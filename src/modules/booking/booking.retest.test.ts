/**
 * QA retest of 17 Nov 2026:
 *  1. an auto-cancelled (refunded) booking overwritten to "Completed" by an
 *     old server's end-time timer must stay Cancelled (booking 6afbcf03…3010)
 *  2. the provider's `earning` shows the late fee
 *  3. notification texts carry readable times, exact values in `data`
 */
import { api, makeAdmin, makeCustomer, makeProvider, daysFromNow, TestUser } from '../../test/factories';
import { getRefunds, payIntent } from '../../test/stripeMock';
import { makeSkiHireListing } from '../../test/listingFixtures';
import { Booking } from './booking.model';
import { Payment } from '../payment/payment.model';
import { Wallet } from '../wallet/wallet.model';
import { Notification } from '../notification/notification.model';
import { runBookingAutomation } from '../../jobs/automaticUpdateJobService';

const B = '/api/v1/booking';
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const later = (min: number) => new Date(Date.now() + min * 60000);
const balance = async (u: TestUser) => Number(((await Wallet.findOne({ user: u.id }).lean()) as any)?.balance || 0);

/** A paid Ski Hire booking (25 €/day, 1 day) starting in 4 days, still Pending */
const paidRental = async () => {
  const provider = await makeProvider('Ski_Hire');
  const customer = await makeCustomer();
  const hire = await makeSkiHireListing(provider.id, { qty: 1, price: 25, rate: 10 });
  const body = {
    productId: String(hire._id),
    startDateAndTime: daysFromNow(4, 9).toISOString(),
    endDateAndTime: daysFromNow(5, 9).toISOString(),
    bookingItems: [{ itemId: String(hire.items[0]._id), quantity: 1 }],
  };
  const intent = await api().post(`${B}/intent`).set(...customer.auth).send(body);
  payIntent(intent.body.data.paymentIntentId);
  const created = await api().post(`${B}/create`).set(...customer.auth)
    .send({ ...body, paymentIntentId: intent.body.data.paymentIntentId });
  expect(created.status).toBe(201);
  return { provider, customer, id: created.body.data.id as string };
};

/** What the old server's timer does: every booking past its end -> Completed */
const oldServerTimer = (id: string) => Booking.updateOne({ _id: id }, { $set: { bookingStatus: 'Completed' } });

beforeEach(async () => {
  await makeAdmin(); // 20 % platform fee
});

describe('Bug 1: cancelled booking overwritten to Completed', () => {
  it('is still shown as Cancelled (no review) and the job puts it back; money untouched', async () => {
    const { provider, customer, id } = await paidRental();

    // provider never answers: expired + refunded by the job
    await runBookingAutomation(later(25 * 60));
    expect(getRefunds()).toHaveLength(1);
    expect(((await Booking.findById(id).lean()) as any).bookingStatus).toBe('Cancelled');

    // an old server version completes it at its end time
    await oldServerTimer(id);

    // the app still sees the cancellation, before any job ran
    const mine = await api().get(`${B}/${id}`).set(...customer.auth);
    expect(mine.status).toBe(200);
    expect(mine.body.data.status).toBe('Cancelled');
    expect(mine.body.data.actions).toEqual([]);
    expect(mine.body.data.cancellation).toMatchObject({ by: 'system', refundAmount: 25 });
    expect(mine.body.data.timeline.completedAt).toBeNull();
    expect(mine.body.data.timeline.cancelledAt).toBeTruthy();
    const theirs = await api().get(`${B}/${id}`).set(...provider.auth);
    expect(theirs.body.data.status).toBe('Cancelled');
    expect(theirs.body.data.earning.status).toBe('none');

    // it is listed under "cancelled", not "past"
    const cancelledTab = await api().get(`${B}/my`).query({ tab: 'cancelled' }).set(...customer.auth);
    expect(cancelledTab.body.data.map((b: any) => b.id)).toContain(id);

    // the job stores Cancelled again; nothing paid or refunded a second time
    await runBookingAutomation(later(25 * 60 + 2));
    const b: any = await Booking.findById(id).lean();
    expect(b).toMatchObject({ bookingStatus: 'Cancelled', cancelledBy: 'system', refundAmount: 25, providerPayout: 'reversed' });
    expect(b.completedAt).toBeUndefined();
    expect(getRefunds()).toHaveLength(1);
    expect(await Payment.findOne({ booking: id }).lean()).toMatchObject({ status: 'Refunded', refundedAmount: 25 });
    expect(await balance(provider)).toBe(0);
  });

  it('a customer cancel overwritten the same way is also restored', async () => {
    const { customer, id } = await paidRental();
    expect((await api().patch(`${B}/${id}/cancel`).set(...customer.auth)).status).toBe(200);
    await oldServerTimer(id);
    expect((await api().get(`${B}/${id}`).set(...customer.auth)).body.data.status).toBe('Cancelled');
    // opening it as the customer already repairs the stored status
    expect(((await Booking.findById(id).lean()) as any).bookingStatus).toBe('Cancelled');
  });

  it('a real completion is never touched', async () => {
    const { provider, id } = await paidRental();
    await api().patch(`${B}/${id}/approve`).set(...provider.auth);
    await api().patch(`${B}/${id}/hand-over`).set(...provider.auth);
    await api().patch(`${B}/${id}/return`).set(...provider.auth);
    await runBookingAutomation(later(5));
    const b: any = await Booking.findById(id).lean();
    expect(b.bookingStatus).toBe('Completed');
    expect(b.completedAt).toBeTruthy();
  });
});

describe('Bug 2: provider earning includes the late fee', () => {
  it('earning.lateFee: pending while due, split into fee / net once paid; booking gross unchanged', async () => {
    const { provider, customer, id } = await paidRental();
    await api().patch(`${B}/${id}/approve`).set(...provider.auth);
    await api().patch(`${B}/${id}/hand-over`).set(...provider.auth);
    // ended 70 min ago -> 2 started hours x 10 €
    const end = new Date(Date.now() - 70 * 60000);
    await Booking.updateOne({ _id: id }, { $set: { endDateAndTime: end, endAt: end } });
    const ret = await api().patch(`${B}/${id}/return`).set(...provider.auth);
    expect(ret.body.data.lateFee).toEqual({ hours: 2, amount: 20, status: 'due' });

    const due = (await api().get(`${B}/${id}`).set(...provider.auth)).body.data.earning;
    expect(due).toMatchObject({ gross: 25, platformFee: 5, net: 20, status: 'paid' });
    expect(due.lateFee).toEqual({ gross: 20, platformFee: null, net: null, status: 'pending' });

    const lf = await api().post(`${B}/${id}/late-fee/intent`).set(...customer.auth);
    payIntent(lf.body.data.paymentIntentId);
    await api().post(`${B}/${id}/late-fee/confirm`).set(...customer.auth).send({ paymentIntentId: lf.body.data.paymentIntentId });

    const paid = (await api().get(`${B}/${id}`).set(...provider.auth)).body.data.earning;
    expect(paid).toMatchObject({ gross: 25, platformFee: 5, net: 20 });
    expect(paid.lateFee).toEqual({ gross: 20, platformFee: 4, net: 16, status: 'paid' });
    expect(await balance(provider)).toBe(36); // 20 + 16, same as earning

    // the customer never sees earnings
    expect((await api().get(`${B}/${id}`).set(...customer.auth)).body.data.earning).toBeUndefined();
  });

  it('no late fee -> earning.lateFee is null', async () => {
    const { provider, id } = await paidRental();
    await api().patch(`${B}/${id}/approve`).set(...provider.auth);
    await api().patch(`${B}/${id}/hand-over`).set(...provider.auth);
    await api().patch(`${B}/${id}/return`).set(...provider.auth);
    expect((await api().get(`${B}/${id}`).set(...provider.auth)).body.data.earning.lateFee).toBeNull();
  });
});

describe('Bug 3: readable times in notifications', () => {
  it('hand-over and new-request texts have no raw ISO time; exact time in data', async () => {
    const { provider, customer, id } = await paidRental();
    const request: any = await Notification.findOne({ receiverId: provider.id, event: 'booking.new' }).lean();
    expect(request.description).not.toMatch(ISO);
    expect(request.description).toMatch(/before \w{3} \d{1,2} \w{3}, \d{1,2}:\d{2} (AM|PM)/);
    expect(request.data.approveBy).toBeTruthy();

    await api().patch(`${B}/${id}/approve`).set(...provider.auth);
    await api().patch(`${B}/${id}/hand-over`).set(...provider.auth);
    const handed: any = await Notification.findOne({ receiverId: customer.id, event: 'booking.handed_over' }).lean();
    expect(handed.description).not.toMatch(ISO);
    expect(handed.description).toMatch(/return it by \w{3} \d{1,2} \w{3}, \d{1,2}:\d{2} (AM|PM) \w+/);
    const b: any = await Booking.findById(id).lean();
    expect(new Date(handed.data.returnBy).getTime()).toBe(new Date(b.endAt).getTime());

    // the list sends data to the app; booking notifications carry the session start
    const list = await api().get('/api/v1/notifications').set(...customer.auth);
    const item = list.body.data.find((n: any) => n.event === 'booking.handed_over');
    expect(item.data.returnBy).toBeTruthy();
    const approved = list.body.data.find((n: any) => n.event === 'booking.approved');
    expect(new Date(approved.data.startAt).getTime()).toBe(new Date(b.startAt).getTime());
  });
});
