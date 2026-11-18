/**
 * Customer cancel must ALWAYS end with the refund recorded, even if the
 * server stops in the middle (restart / deploy / crash) or Stripe is
 * unreachable, and must never refund twice.
 * Reproduces booking 6afacc06…a56c: Stripe refunded the card, the server
 * restarted before writing it, the booking stayed "Cancelled, payment Paid".
 */
import { api, makeAdmin, makeCustomer, makeProvider, daysFromNow, TestUser } from '../../test/factories';
import { failNextRefundWith, getRefunds, payIntent, stripeMock } from '../../test/stripeMock';
import { makeSkiHireListing } from '../../test/listingFixtures';
import { Booking } from './booking.model';
import { Payment } from '../payment/payment.model';
import { Wallet } from '../wallet/wallet.model';
import { Notification } from '../notification/notification.model';
import { runBookingAutomation } from '../../jobs/automaticUpdateJobService';

const B = '/api/v1/booking';
const balance = async (u: TestUser) => Number(((await Wallet.findOne({ user: u.id }).lean()) as any)?.balance || 0);
const later = (min: number) => new Date(Date.now() + min * 60000);
const webhook = (event: any) =>
  api().post(`${B}/webhook`).set('stripe-signature', 't=1,v1=x').set('Content-Type', 'application/json').send(JSON.stringify(event));

/** A paid Ski Hire booking (25 €) 4 days ahead, still Pending */
const paidBooking = async () => {
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
  const pi = intent.body.data.paymentIntentId as string;
  payIntent(pi);
  const created = await api().post(`${B}/create`).set(...customer.auth).send({ ...body, paymentIntentId: pi });
  expect(created.status).toBe(201);
  return { provider, customer, id: created.body.data.id as string, pi };
};

const paymentOf = async (id: string) => (await Payment.findOne({ booking: id }).lean()) as any;

beforeEach(async () => {
  await makeAdmin();
});

it('normal cancel: refund to the card, payment Refunded, nothing left pending', async () => {
  const { customer, id } = await paidBooking();
  const res = await api().patch(`${B}/${id}/cancel`).set(...customer.auth).send({ reason: 'QA' });
  expect(res.status).toBe(200);
  expect(res.body.data.refund).toEqual({ amount: 25, percent: 100, status: 'refunded' });
  expect(getRefunds()).toHaveLength(1);
  const p = await paymentOf(id);
  expect(p).toMatchObject({ status: 'Refunded', refundedAmount: 25 });
  const b: any = await Booking.findById(id).lean();
  expect(b).toMatchObject({ bookingStatus: 'Cancelled', refundAmount: 25, providerPayout: 'reversed' });
  expect(b.pendingRefund).toBeUndefined();
  expect(res.body.data.refundedAmount).toBe(25);
});

it('server stopped AFTER Stripe refunded (the live case): the job records it, no second refund', async () => {
  const { customer, id, pi } = await paidBooking();
  // what was left in the database: cancelled, nothing recorded, payout held
  await Booking.updateOne(
    { _id: id },
    { $set: { bookingStatus: 'Cancelled', cancelledBy: 'user', cancelReason: 'QA test cancel', cancelledAt: new Date() } },
  );
  // ...while Stripe already refunded the card
  await stripeMock.refunds.create({ payment_intent: pi, metadata: { source: 'app', bookingId: id } });

  await runBookingAutomation(later(3));
  expect(getRefunds()).toHaveLength(1); // no second refund
  expect(await paymentOf(id)).toMatchObject({ status: 'Refunded', refundedAmount: 25 });
  const b: any = await Booking.findById(id).lean();
  expect(b).toMatchObject({ refundAmount: 25, providerPayout: 'reversed' });
  expect(b.pendingRefund).toBeUndefined();
  expect(await Notification.exists({ receiverId: customer.id, event: 'booking.cancelled' })).toBeTruthy();

  // running again changes nothing
  await runBookingAutomation(later(10));
  expect(getRefunds()).toHaveLength(1);
  expect((await paymentOf(id)).refundedAmount).toBe(25);
});

it('server stopped BEFORE the refund was sent: the job sends it once', async () => {
  const { id } = await paidBooking();
  await Booking.updateOne(
    { _id: id },
    {
      $set: {
        bookingStatus: 'Cancelled',
        cancelledBy: 'user',
        cancelledAt: new Date(),
        pendingRefund: { amount: 25, target: 25, kept: 0, percent: 100, kind: 'customer', startedAt: new Date(), claimedAt: new Date() },
      },
    },
  );
  // not yet: the request that claimed it may still be running
  await runBookingAutomation(later(1));
  expect(getRefunds()).toHaveLength(0);
  // after the claim timeout the job finishes it
  await runBookingAutomation(later(3));
  expect(getRefunds()).toHaveLength(1);
  expect(await paymentOf(id)).toMatchObject({ status: 'Refunded', refundedAmount: 25 });
  await runBookingAutomation(later(10));
  expect(getRefunds()).toHaveLength(1);
});

it('Stripe refuses: 502, the booking is back as it was, nothing recorded', async () => {
  const { customer, id } = await paidBooking();
  failNextRefundWith(Object.assign(new Error('Card was closed'), { type: 'StripeInvalidRequestError' }));
  const res = await api().patch(`${B}/${id}/cancel`).set(...customer.auth);
  expect(res.status).toBe(502);
  const b: any = await Booking.findById(id).lean();
  expect(b.bookingStatus).toBe('Active');
  expect(b.pendingRefund).toBeUndefined();
  expect(b.cancelledAt).toBeUndefined();
  expect(await paymentOf(id)).toMatchObject({ status: 'Paid', refundedAmount: 0 });
});

it('Stripe unreachable: cancelled with refund "pending", the job refunds it later, once', async () => {
  const { customer, id } = await paidBooking();
  failNextRefundWith(Object.assign(new Error('socket hang up'), { type: 'StripeConnectionError' }));
  const res = await api().patch(`${B}/${id}/cancel`).set(...customer.auth);
  expect(res.status).toBe(200);
  expect(res.body.data.status).toBe('Cancelled');
  expect(res.body.data.refund).toEqual({ amount: 25, percent: 100, status: 'pending' });
  expect(getRefunds()).toHaveLength(0);

  await runBookingAutomation(later(3));
  expect(getRefunds()).toHaveLength(1);
  expect(await paymentOf(id)).toMatchObject({ status: 'Refunded', refundedAmount: 25 });
});

it('webhook for an app refund the server never recorded: counted once, even if resent', async () => {
  const { id, pi } = await paidBooking();
  await Booking.updateOne(
    { _id: id },
    {
      $set: {
        bookingStatus: 'Cancelled',
        cancelledBy: 'user',
        cancelledAt: new Date(Date.now() - 5 * 60000),
        pendingRefund: { amount: 25, target: 25, kept: 0, percent: 100, kind: 'customer', startedAt: new Date(), claimedAt: new Date(Date.now() - 5 * 60000) },
      },
    },
  );
  const refund: any = await stripeMock.refunds.create({ payment_intent: pi, metadata: { source: 'app', bookingId: id } });
  const event = { type: 'refund.created', data: { object: { id: refund.id, payment_intent: pi, amount: 2500, metadata: { source: 'app', bookingId: id } } } };
  expect((await webhook(event)).body.handled).toBe(true);
  expect((await webhook(event)).body.handled).toBe(false); // resent
  expect(getRefunds()).toHaveLength(1);
  expect(await paymentOf(id)).toMatchObject({ status: 'Refunded', refundedAmount: 25 });
  const b: any = await Booking.findById(id).lean();
  expect(b.pendingRefund).toBeUndefined();
  expect(b.refundAmount).toBe(25);
});

it('a dashboard refund webhook resent by Stripe takes the provider share back only once', async () => {
  const { provider, customer, id, pi } = await paidBooking();
  const prov = provider;
  await api().patch(`${B}/${id}/approve`).set(...prov.auth);
  await api().patch(`${B}/${id}/hand-over`).set(...prov.auth);
  await api().patch(`${B}/${id}/return`).set(...prov.auth);
  expect(await balance(prov)).toBe(20);
  const event = { type: 'refund.created', data: { object: { id: 're_dash_1', payment_intent: pi, amount: 1000, metadata: {} } } };
  expect((await webhook(event)).body.handled).toBe(true);
  expect((await webhook(event)).body.handled).toBe(false);
  expect(await balance(prov)).toBe(12); // 20 - 40 % once
  expect((await paymentOf(id)).refundedAmount).toBe(10);
  expect(customer).toBeTruthy();
});
