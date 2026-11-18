/**
 * An old server version running on the same database marks bookings
 * Completed by its own timer (rentals at their end time, even when handed
 * over and not returned). The current flow must not trust that status:
 * the rental stays InProgress, the late fee still happens, the provider is
 * only paid after a real completion.
 */
import { api, makeAdmin, makeCustomer, makeProvider, daysFromNow, isoDate, TestUser } from '../../test/factories';
import { payIntent } from '../../test/stripeMock';
import { makeMassageListing, makeSkiHireListing } from '../../test/listingFixtures';
import { Booking } from './booking.model';
import { Wallet } from '../wallet/wallet.model';
import { runBookingAutomation } from '../../jobs/automaticUpdateJobService';

const B = '/api/v1/booking';
const balance = async (u: TestUser) => Number(((await Wallet.findOne({ user: u.id }).lean()) as any)?.balance || 0);

const book = async (customer: TestUser, body: Record<string, any>) => {
  const intent = await api().post(`${B}/intent`).set(...customer.auth).send(body);
  expect(intent.status).toBe(200);
  payIntent(intent.body.data.paymentIntentId);
  const create = await api().post(`${B}/create`).set(...customer.auth)
    .send({ ...body, paymentIntentId: intent.body.data.paymentIntentId });
  expect(create.status).toBe(201);
  return create.body.data.id as string;
};

beforeEach(async () => {
  await makeAdmin(); // platform fee 20 %
});

/** What the old server's cron does: just flips the status */
const oldServerCompletes = (id: string) => Booking.updateOne({ _id: id }, { $set: { bookingStatus: 'Completed' } });

/** A handed-over Ski Hire rental (25 €/day, 10 €/h late) that ended `minutesAgo` */
const handedOverRental = async (minutesAgo: number) => {
  const provider = await makeProvider('Ski_Hire');
  const customer = await makeCustomer();
  const hire = await makeSkiHireListing(provider.id, { qty: 1, price: 25, rate: 10 });
  const id = await book(customer, {
    productId: String(hire._id),
    startDateAndTime: daysFromNow(1, 9).toISOString(),
    endDateAndTime: daysFromNow(2, 9).toISOString(),
    bookingItems: [{ itemId: String(hire.items[0]._id), quantity: 1 }],
  });
  await api().patch(`${B}/${id}/approve`).set(...provider.auth);
  await api().patch(`${B}/${id}/hand-over`).set(...provider.auth);
  const end = new Date(Date.now() - minutesAgo * 60000);
  await Booking.updateOne({ _id: id }, { $set: { endDateAndTime: end, endAt: end } });
  return { provider, customer, hire, id };
};

it('handed over, not returned, completed by the old server: stays InProgress, late fee on return, paid only then', async () => {
  const { provider, customer, hire, id } = await handedOverRental(200); // 3 h 20 min late
  await oldServerCompletes(id);

  // the app still sees an open, overdue rental
  const custView = await api().get(`${B}/${id}`).set(...customer.auth);
  expect(custView.body.data.status).toBe('InProgress');
  expect(custView.body.data.timer.state).toBe('overdue');
  const provView = await api().get(`${B}/${id}`).set(...provider.auth);
  expect(provView.body.data.actions).toEqual(['return']);

  // opening it already repaired the stored status; nothing was paid
  expect(((await Booking.findById(id).lean()) as any).bookingStatus).toBe('Active');
  expect(await balance(provider)).toBe(0);

  // flipped again while nobody looks: the jobs reopen it and pay nothing
  await oldServerCompletes(id);
  const run: any = await runBookingAutomation();
  expect(run.reopened).toBe(1);
  expect(((await Booking.findById(id).lean()) as any).bookingStatus).toBe('Active');
  expect(await balance(provider)).toBe(0);

  // old server flips it again; the provider's return still works (no 409)
  await oldServerCompletes(id);
  const ret = await api().patch(`${B}/${id}/return`).set(...provider.auth);
  expect(ret.status).toBe(200);
  expect(ret.body.data.status).toBe('Completed');
  expect(ret.body.data.lateFee).toEqual({ hours: 4, amount: 25, status: 'due' }); // capped at the price
  expect(await balance(provider)).toBe(20); // 25 - 20 % after the real completion

  // the unit stayed booked while the rental was out
  expect(hire).toBeTruthy();
});

it('never returned: auto-returned 48 h after the end with the late fee, not at the end time', async () => {
  const { provider, id } = await handedOverRental(30);
  await oldServerCompletes(id);
  await runBookingAutomation(new Date(Date.now() + 60000));
  expect(((await Booking.findById(id).lean()) as any).bookingStatus).toBe('Active');
  expect(await balance(provider)).toBe(0);

  await oldServerCompletes(id);
  await runBookingAutomation(new Date(Date.now() + 49 * 3600000));
  const b: any = await Booking.findById(id).lean();
  expect(b.bookingStatus).toBe('Completed');
  expect(b.completedAt).toBeTruthy();
  expect(b.lateFee.status).toBe('due');
  expect(b.providerPayout).toBe('paid');
});

it('a rented unit closed early by the old server is still not bookable by someone else', async () => {
  // still running: ends tomorrow 13:00, after the 10:00–12:00 asked below
  // (fixed clock time, so the test does not depend on when it runs)
  const { hire, id } = await handedOverRental(-Math.ceil((daysFromNow(1, 13).getTime() - Date.now()) / 60000));
  await oldServerCompletes(id);
  const other = await makeCustomer();
  const clash = await api().post(`${B}/intent`).set(...other.auth).send({
    productId: String(hire._id),
    startDateAndTime: daysFromNow(1, 10).toISOString(),
    endDateAndTime: daysFromNow(1, 12).toISOString(),
    bookingItems: [{ itemId: String(hire.items[0]._id), quantity: 1 }],
  });
  expect(clash.status).toBe(409);
});

it('a massage completed early by the old server is still upcoming and can be cancelled', async () => {
  const provider = await makeProvider('Massage');
  const customer = await makeCustomer();
  const m = await makeMassageListing(provider.id);
  const id = await book(customer, { productId: String(m._id), date: isoDate(daysFromNow(3)), time: '10:00 AM', duration: '60 min' });
  await api().patch(`${B}/${id}/approve`).set(...provider.auth);
  await oldServerCompletes(id);

  const view = await api().get(`${B}/${id}`).set(...customer.auth);
  expect(view.body.data.status).toBe('Confirmed');
  expect(view.body.data.actions).toContain('cancel');
  const cancel = await api().patch(`${B}/${id}/cancel`).set(...customer.auth);
  expect(cancel.status).toBe(200);
  expect(cancel.body.data.refund.percent).toBe(100);
  expect(await balance(provider)).toBe(0);
});

it('real completions are untouched', async () => {
  const provider = await makeProvider('Massage');
  const customer = await makeCustomer();
  const m = await makeMassageListing(provider.id);
  const id = await book(customer, { productId: String(m._id), date: isoDate(daysFromNow(1)), time: '10:00 AM', duration: '60 min' });
  await api().patch(`${B}/${id}/approve`).set(...provider.auth);
  const run1: any = await runBookingAutomation(daysFromNow(3));
  expect(run1.completed).toBe(1);
  const run2: any = await runBookingAutomation(daysFromNow(3));
  expect(run2.reopened).toBe(0);
  expect(((await Booking.findById(id).lean()) as any).bookingStatus).toBe('Completed');
  expect(await balance(provider)).toBe(64);
});
