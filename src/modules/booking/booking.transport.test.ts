/**
 * QA Transport report of 17 Nov 2026:
 *  T1  a vehicle (or Ski Hire unit) not returned yet can't be booked / handed over again
 *  T6  a no-show tells the customer and the provider
 *  T7  the late fee text gives the real delay, not the charged hours
 *  T8  money in texts is "€45.00"
 */
import { api, makeAdmin, makeCustomer, makeProvider, daysFromNow, TestUser } from '../../test/factories';
import { payIntent } from '../../test/stripeMock';
import { makeSkiHireListing, makeTransportListing } from '../../test/listingFixtures';
import { Booking } from './booking.model';
import { Wallet } from '../wallet/wallet.model';
import { Notification } from '../notification/notification.model';
import { runBookingAutomation } from '../../jobs/automaticUpdateJobService';
import { formatMinutes, formatMoney } from './booking.rules';

const B = '/api/v1/booking';
const minutesAgo = (m: number) => new Date(Date.now() - m * 60000);
const balance = async (u: TestUser) => Number(((await Wallet.findOne({ user: u.id }).lean()) as any)?.balance || 0);

/** paid booking through the real flow (intent -> card -> create) */
const book = async (customer: TestUser, body: Record<string, any>) => {
  const intent = await api().post(`${B}/intent`).set(...customer.auth).send(body);
  expect(intent.status).toBe(200);
  payIntent(intent.body.data.paymentIntentId);
  const created = await api().post(`${B}/create`).set(...customer.auth)
    .send({ ...body, paymentIntentId: intent.body.data.paymentIntentId });
  expect(created.status).toBe(201);
  return created.body.data.id as string;
};

const trip = (van: any, start: Date, end: Date) => ({
  productId: String(van._id),
  startDateAndTime: start.toISOString(),
  endDateAndTime: end.toISOString(),
  personCount: 2,
  address: 'Hotel',
  destination: 'Airport',
});

/** move a booking's schedule (start/end) as if time had passed */
const reschedule = (id: string, start: Date, end: Date) =>
  Booking.updateOne({ _id: id }, { $set: { startDateAndTime: start, startAt: start, endDateAndTime: end, endAt: end } });

/** approved + handed over, and now overdue: ended `lateMin` minutes ago */
const overdueTrip = async (provider: TestUser, customer: TestUser, van: any, lateMin: number) => {
  const id = await book(customer, trip(van, daysFromNow(1, 8), daysFromNow(1, 10)));
  expect((await api().patch(`${B}/${id}/approve`).set(...provider.auth)).status).toBe(200);
  expect((await api().patch(`${B}/${id}/hand-over`).set(...provider.auth)).status).toBe(200);
  await reschedule(id, minutesAgo(lateMin + 60), minutesAgo(lateMin));
  return id;
};

const textsOf = async (receiver: TestUser, event: string) =>
  (await Notification.find({ receiverId: receiver.id, event }).lean()) as any[];

beforeEach(async () => {
  await makeAdmin(); // 20 % platform fee
});

describe('T8: money and delay formatting', () => {
  it('formatMoney: euro sign, 2 decimals', () => {
    expect(formatMoney(45)).toBe('€45.00');
    expect(formatMoney(378.5)).toBe('€378.50');
    expect(formatMoney(0.1 + 0.2)).toBe('€0.30');
    expect(formatMoney(undefined)).toBe('€0.00');
    expect(formatMoney(1234.5)).toBe('€1,234.50');
    expect(formatMoney(10, 'usd')).toBe('US$10.00');
  });

  it('formatMinutes: real delay', () => {
    expect(formatMinutes(15)).toBe('15 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(75)).toBe('1 h 15 min');
    expect(formatMinutes(-3)).toBe('0 min');
  });

  it('cancellation texts use "€100.00", never "100 EUR"', async () => {
    const provider = await makeProvider('Transport');
    const customer = await makeCustomer();
    const van = await makeTransportListing(provider.id, 100);
    const id = await book(customer, trip(van, daysFromNow(3, 8), daysFromNow(3, 10)));
    expect((await api().patch(`${B}/${id}/cancel`).set(...customer.auth)).status).toBe(200);
    const [n] = await textsOf(customer, 'booking.cancelled');
    expect(n.description).toMatch(/^Airport shuttle on \w{3} \d{1,2} \w{3}, \d{1,2}:\d{2} (AM|PM) \w+ was cancelled\. €100\.00 \(100%\) is refunded to your card\.$/);
    const all = (await Notification.find().lean()) as any[];
    for (const x of all) expect(x.description).not.toMatch(/\d+(\.\d+)? EUR/);
  });
});

describe('T1: a vehicle that is not back yet', () => {
  it('cannot be booked again until it is returned, whatever the scheduled times', async () => {
    const provider = await makeProvider('Transport');
    const first = await makeCustomer();
    const next = await makeCustomer();
    const van = await makeTransportListing(provider.id, 100);
    const outId = await overdueTrip(provider, first, van, 9); // trip ended 9 min ago, still out

    // next customer, no time overlap with the (past) trip: refused
    const soon = trip(van, daysFromNow(1, 8), daysFromNow(1, 10));
    const refused = await api().post(`${B}/intent`).set(...next.auth).send(soon);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/has not been returned by the previous customer yet/);

    // the availability check says why
    const av = await api().get(`${B}/availability/${van._id}`).query({ start: soon.startDateAndTime, end: soon.endDateAndTime });
    expect(av.body.data).toMatchObject({ available: false, reason: 'not_returned' });

    // after the latest automatic close (48 h after the end) it can be booked
    const later = await api().post(`${B}/intent`).set(...next.auth).send(trip(van, daysFromNow(3, 8), daysFromNow(3, 10)));
    expect(later.status).toBe(200);

    // once it is back: bookable again
    expect((await api().patch(`${B}/${outId}/return`).set(...provider.auth)).status).toBe(200);
    expect((await api().post(`${B}/intent`).set(...next.auth).send(soon)).status).toBe(200);
    const free = await api().get(`${B}/availability/${van._id}`).query({ start: soon.startDateAndTime, end: soon.endDateAndTime });
    expect(free.body.data).toMatchObject({ available: true, reason: null });
  });

  it('a normal overlap still answers "already booked"', async () => {
    const provider = await makeProvider('Transport');
    const van = await makeTransportListing(provider.id, 100);
    const body = trip(van, daysFromNow(2, 8), daysFromNow(2, 10));
    await book(await makeCustomer(), body);
    const clash = await api().post(`${B}/intent`).set(...(await makeCustomer()).auth).send(body);
    expect(clash.status).toBe(409);
    expect(clash.body.message).toBe('This transport is already booked for that time.');
  });

  it('a rental still within its time does not block a later booking', async () => {
    const provider = await makeProvider('Transport');
    const customer = await makeCustomer();
    const van = await makeTransportListing(provider.id, 100);
    const id = await book(customer, trip(van, daysFromNow(1, 8), daysFromNow(1, 10)));
    await api().patch(`${B}/${id}/approve`).set(...provider.auth);
    await api().patch(`${B}/${id}/hand-over`).set(...provider.auth); // out, not late
    const after = await api().post(`${B}/intent`).set(...(await makeCustomer()).auth)
      .send(trip(van, daysFromNow(1, 11), daysFromNow(1, 12)));
    expect(after.status).toBe(200);
  });

  it('the next booking cannot be handed over while the previous customer still has the vehicle', async () => {
    const provider = await makeProvider('Transport');
    const van = await makeTransportListing(provider.id, 100);
    const nextCustomer = await makeCustomer();
    const nextId = await book(nextCustomer, trip(van, daysFromNow(4, 8), daysFromNow(4, 10)));
    await api().patch(`${B}/${nextId}/approve`).set(...provider.auth);
    const outId = await overdueTrip(provider, await makeCustomer(), van, 30);

    const blocked = await api().patch(`${B}/${nextId}/hand-over`).set(...provider.auth);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/has not been returned by the previous customer yet/);

    await api().patch(`${B}/${outId}/return`).set(...provider.auth);
    expect((await api().patch(`${B}/${nextId}/hand-over`).set(...provider.auth)).status).toBe(200);
  });

  it('Ski Hire: a unit not returned yet is not available', async () => {
    const provider = await makeProvider('Ski_Hire');
    const hire = await makeSkiHireListing(provider.id, { qty: 1, price: 25, rate: 10 });
    const items = [{ itemId: String(hire.items[0]._id), quantity: 1 }];
    const id = await book(await makeCustomer(), {
      productId: String(hire._id),
      startDateAndTime: daysFromNow(1, 9).toISOString(),
      endDateAndTime: daysFromNow(2, 9).toISOString(),
      bookingItems: items,
    });
    await api().patch(`${B}/${id}/approve`).set(...provider.auth);
    await api().patch(`${B}/${id}/hand-over`).set(...provider.auth);
    await reschedule(id, minutesAgo(24 * 60), minutesAgo(20));

    const body = {
      productId: String(hire._id),
      startDateAndTime: daysFromNow(1, 9).toISOString(),
      endDateAndTime: daysFromNow(2, 9).toISOString(),
      bookingItems: items,
    };
    const refused = await api().post(`${B}/intent`).set(...(await makeCustomer()).auth).send(body);
    expect(refused.status).toBe(409);
    const av = await api().get(`${B}/availability/${hire._id}`).query({ start: body.startDateAndTime, end: body.endDateAndTime });
    expect(av.body.data.items[0].available).toBe(0);

    await api().patch(`${B}/${id}/return`).set(...provider.auth);
    expect((await api().post(`${B}/intent`).set(...(await makeCustomer()).auth).send(body)).status).toBe(200);
  });
});

describe('T7: late fee text gives the real delay', () => {
  it('20 min late: "returned 20 min late. Late fee: €20.00 (1 started hour)"', async () => {
    const provider = await makeProvider('Transport');
    const customer = await makeCustomer();
    const van = await makeTransportListing(provider.id, 100); // 20 € per started hour
    const id = await overdueTrip(provider, customer, van, 20);
    const ret = await api().patch(`${B}/${id}/return`).set(...provider.auth);
    expect(ret.body.data.lateFee).toEqual({ hours: 1, amount: 20, status: 'due' });

    const [n] = await textsOf(customer, 'booking.late_fee_due');
    expect(n.description).toBe('Airport shuttle was returned 20 min late. Late fee: €20.00 (1 started hour). Please pay it in the app.');
    expect(n.data).toMatchObject({ lateMinutes: 20, chargedHours: 1, lateFee: 20, currency: 'eur' });
  });

  it('70 min late: "1 h 10 min late ... (2 started hours)"', async () => {
    const provider = await makeProvider('Transport');
    const customer = await makeCustomer();
    const van = await makeTransportListing(provider.id, 100);
    const id = await overdueTrip(provider, customer, van, 70);
    await api().patch(`${B}/${id}/return`).set(...provider.auth);
    const [n] = await textsOf(customer, 'booking.late_fee_due');
    expect(n.description).toMatch(/returned 1 h 10 min late\. Late fee: €40\.00 \(2 started hours\)/);
  });

  it('within the 15 min grace: no fee, plain "returned" text', async () => {
    const provider = await makeProvider('Transport');
    const customer = await makeCustomer();
    const van = await makeTransportListing(provider.id, 100);
    const id = await overdueTrip(provider, customer, van, 10);
    await api().patch(`${B}/${id}/return`).set(...provider.auth);
    expect(await textsOf(customer, 'booking.late_fee_due')).toHaveLength(0);
    const [n] = await textsOf(customer, 'booking.completed');
    expect(n.description).toBe('Thanks! Airport shuttle has been returned.');
  });
});

describe('T6: no-show is notified', () => {
  it('never handed over: closed as a no-show, both sides told, provider paid', async () => {
    const provider = await makeProvider('Transport');
    const customer = await makeCustomer();
    const van = await makeTransportListing(provider.id, 100);
    const id = await book(customer, trip(van, daysFromNow(1, 8), daysFromNow(1, 10)));
    await api().patch(`${B}/${id}/approve`).set(...provider.auth);
    await reschedule(id, minutesAgo(120), minutesAgo(5));

    await runBookingAutomation(new Date());
    const b: any = await Booking.findById(id).lean();
    expect(b).toMatchObject({ bookingStatus: 'Completed', noShow: true, providerPayout: 'paid' });

    const [mine] = await textsOf(customer, 'booking.no_show');
    expect(mine.title).toBe('Not picked up');
    expect(mine.description).toBe(
      'Airport shuttle was not picked up, so the booking is closed as a no-show. The €100.00 payment is not refunded.',
    );
    expect(mine.data).toMatchObject({ noShow: true, kept: 100 });
    expect(String(mine.booking)).toBe(id);

    const [theirs] = await textsOf(provider, 'booking.no_show');
    expect(theirs.description).toBe(
      'The customer did not pick up Airport shuttle. The booking is closed as a no-show and €80.00 is added to your wallet.',
    );
    expect(theirs.data).toMatchObject({ noShow: true, earning: 80 });
    expect(await balance(provider)).toBe(80);

    // no "completed, leave a review" text for a no-show; job re-run sends nothing twice
    expect(await textsOf(customer, 'booking.completed')).toHaveLength(0);
    await runBookingAutomation(new Date());
    expect(await Notification.countDocuments({ event: 'booking.no_show' })).toBe(2);
  });
});
