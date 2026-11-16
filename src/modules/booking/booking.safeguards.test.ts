/**
 * Cash-flow safeguards: the edge cases that lose money if unhandled.
 */
import { api, makeAdmin, makeCustomer, makeProvider, daysFromNow, isoDate, TestUser } from '../../test/factories';
import { payIntent, getRefunds } from '../../test/stripeMock';
import { makeSkiHireListing, makeSkiPassListing, makeTransportListing } from '../../test/listingFixtures';
import { Booking } from './booking.model';
import { Wallet } from '../wallet/wallet.model';
import { runBookingAutomation } from '../../jobs/automaticUpdateJobService';

const B = '/api/v1/booking';
const balance = async (u: TestUser) => Number(((await Wallet.findOne({ user: u.id }).lean()) as any)?.balance || 0);
const webhook = (event: any) =>
  api().post(`${B}/webhook`).set('stripe-signature', 't=1,v1=x').set('Content-Type', 'application/json').send(JSON.stringify(event));

const intentFor = async (c: TestUser, body: any) => {
  const r = await api().post(`${B}/intent`).set(...c.auth).send(body);
  expect(r.status).toBe(200);
  return r.body.data.paymentIntentId as string;
};

let admin: TestUser;
beforeEach(async () => {
  admin = await makeAdmin();
});

it('two customers paying for the last unit at once: one booking, the other refunded', async () => {
  const provider = await makeProvider('Transport');
  const van = await makeTransportListing(provider.id, 100);
  const body = {
    productId: String(van._id),
    startDateAndTime: daysFromNow(3, 8).toISOString(),
    endDateAndTime: daysFromNow(3, 12).toISOString(),
    personCount: 2,
  };
  const a = await makeCustomer();
  const b = await makeCustomer();
  const pa = await intentFor(a, body);
  const pb = await intentFor(b, body);
  payIntent(pa);
  payIntent(pb);
  const [ra, rb] = await Promise.all([
    api().post(`${B}/create`).set(...a.auth).send({ ...body, paymentIntentId: pa }),
    api().post(`${B}/create`).set(...b.auth).send({ ...body, paymentIntentId: pb }),
  ]);
  const statuses = [ra.status, rb.status].sort();
  expect(statuses).toEqual([201, 409]);
  const loser = ra.status === 409 ? ra : rb;
  expect(loser.body.message).toMatch(/refunded/);
  expect(await Booking.countDocuments()).toBe(1);
  expect(getRefunds()).toHaveLength(1);
});

it('paid but the app never called /create: the job books it', async () => {
  const provider = await makeProvider('Ski_Pass');
  const customer = await makeCustomer();
  const pass = await makeSkiPassListing(provider.id, 40);
  const pi = await intentFor(customer, { productId: String(pass._id), date: isoDate(daysFromNow(2)) });
  payIntent(pi);
  // app crashed here: no /create, no webhook
  await runBookingAutomation(new Date(Date.now() + 6 * 60000));
  const booking: any = await Booking.findOne({ user: customer.id }).lean();
  expect(booking).toBeTruthy();
  expect(booking.totalPrice).toBe(40);
  // when the app comes back, /create returns the same booking
  const again = await api().post(`${B}/create`).set(...customer.auth).send({ paymentIntentId: pi });
  expect(again.status).toBe(201);
  expect(again.body.data.id).toBe(String(booking._id));
});

it('an unpaid late fee blocks new bookings until it is paid', async () => {
  const provider = await makeProvider('Ski_Hire');
  const customer = await makeCustomer();
  const hire = await makeSkiHireListing(provider.id);
  await Booking.create({
    user: customer.id, product: hire._id, productModel: 'SkiHire', category: 'Ski_Hire',
    totalPrice: 50, bookingStatus: 'Completed', lateFee: { hours: 2, amount: 20, status: 'due' },
  });
  const r = await api().post(`${B}/intent`).set(...customer.auth).send({
    productId: String(hire._id),
    startDateAndTime: daysFromNow(5, 9).toISOString(),
    endDateAndTime: daysFromNow(6, 9).toISOString(),
    bookingItems: [{ itemId: String(hire.items[0]._id), quantity: 1 }],
  });
  expect(r.status).toBe(402);
  expect(r.body.message).toMatch(/late fee/);
});

describe('refunds and disputes after payout', () => {
  const completedPass = async () => {
    const provider = await makeProvider('Ski_Pass');
    const customer = await makeCustomer();
    const pass = await makeSkiPassListing(provider.id, 100);
    const body = { productId: String(pass._id), date: isoDate(daysFromNow(1)) };
    const pi = await intentFor(customer, body);
    payIntent(pi);
    const created = await api().post(`${B}/create`).set(...customer.auth).send({ ...body, paymentIntentId: pi });
    await runBookingAutomation(daysFromNow(4));
    expect(await balance(provider)).toBe(80);
    return { provider, customer, id: created.body.data.id as string, pi };
  };

  it('admin partial refund takes back the provider share proportionally', async () => {
    const { provider, customer, id } = await completedPass();
    expect((await api().patch(`${B}/${id}/admin-refund`).set(...customer.auth).send({ amount: 10 })).status).toBe(403);
    const r = await api().patch(`${B}/${id}/admin-refund`).set(...admin.auth).send({ amount: 25, reason: 'Lift closed' });
    expect(r.status).toBe(200);
    expect(r.body.data.refundedAmount).toBe(25);
    expect(getRefunds()[0].amount).toBe(2500);
    expect(await balance(provider)).toBe(60); // 80 - 25 %
    expect(await balance(admin)).toBe(15); // 20 - 25 %
    const tooMuch = await api().patch(`${B}/${id}/admin-refund`).set(...admin.auth).send({ amount: 80 });
    expect(tooMuch.status).toBe(400);
  });

  it('a refund made in the Stripe dashboard is accounted for (webhook)', async () => {
    const { provider, id, pi } = await completedPass();
    const res = await webhook({ type: 'refund.created', data: { object: { payment_intent: pi, amount: 10000, metadata: {} } } });
    expect(res.body).toMatchObject({ received: true, handled: true });
    const b: any = await Booking.findById(id).lean();
    expect(b.refundAmount).toBe(100);
    expect(b.providerPayout).toBe('reversed');
    expect(await balance(provider)).toBe(0);
    // the app's own refunds are not counted twice
    const own = await webhook({ type: 'refund.created', data: { object: { payment_intent: pi, amount: 100, metadata: { source: 'app' } } } });
    expect(own.body.handled).toBe(false);
  });

  it('a chargeback freezes the provider share; winning it gives it back', async () => {
    const { provider, id, pi } = await completedPass();
    await webhook({ type: 'charge.dispute.created', data: { object: { payment_intent: pi, amount: 10000, reason: 'fraudulent', status: 'needs_response' } } });
    expect(await balance(provider)).toBe(0);
    const provView = await api().get(`${B}/${id}`).set(...provider.auth);
    expect(provView.body.data.dispute).toMatchObject({ status: 'open', amount: 100 });
    await webhook({ type: 'charge.dispute.closed', data: { object: { payment_intent: pi, amount: 10000, status: 'won' } } });
    expect(await balance(provider)).toBe(80);
    expect(await balance(admin)).toBe(20);
  });

  it('a chargeback before payout keeps the payout on hold', async () => {
    const provider = await makeProvider('Ski_Pass');
    const customer = await makeCustomer();
    const pass = await makeSkiPassListing(provider.id, 100);
    const body = { productId: String(pass._id), date: isoDate(daysFromNow(1)) };
    const pi = await intentFor(customer, body);
    payIntent(pi);
    await api().post(`${B}/create`).set(...customer.auth).send({ ...body, paymentIntentId: pi });
    await webhook({ type: 'charge.dispute.created', data: { object: { payment_intent: pi, amount: 10000, reason: 'fraudulent' } } });
    await runBookingAutomation(daysFromNow(4));
    expect(await balance(provider)).toBe(0); // completed, but not paid during the dispute
    await webhook({ type: 'charge.dispute.closed', data: { object: { payment_intent: pi, amount: 10000, status: 'lost' } } });
    await runBookingAutomation(daysFromNow(4));
    expect(await balance(provider)).toBe(0); // bank refunded the customer
  });
});
