import { api, makeAdmin, makeCustomer, makeProvider, daysFromNow, isoDate, TestUser } from '../../test/factories';
import { payIntent, getRefunds } from '../../test/stripeMock';
import {
  makeMassageListing,
  makeRestaurantListing,
  makeSkiHireListing,
  makeSkiPassListing,
  makeTransportListing,
} from '../../test/listingFixtures';
import { Booking } from './booking.model';
import { Payment } from '../payment/payment.model';
import { Wallet } from '../wallet/wallet.model';
import { Notification } from '../notification/notification.model';
import { runBookingAutomation } from '../../jobs/automaticUpdateJobService';

const B = '/api/v1/booking';

/** intent -> (customer pays in the Stripe sheet) -> create */
const book = async (customer: TestUser, body: Record<string, any>) => {
  const intent = await api().post(`${B}/intent`).set(...customer.auth).send(body);
  if (intent.status !== 200) return { intent, create: null as any };
  payIntent(intent.body.data.paymentIntentId);
  const create = await api()
    .post(`${B}/create`)
    .set(...customer.auth)
    .send({ ...body, paymentIntentId: intent.body.data.paymentIntentId });
  return { intent, create };
};

const balance = async (u: TestUser) => Number((await Wallet.findOne({ user: u.id }).lean() as any)?.balance || 0);

let admin: TestUser;
beforeEach(async () => {
  admin = await makeAdmin(); // admin wallet profitCharge = 20 %
});

describe('Ski Pass', () => {
  it('prices on the server, is confirmed at payment and appears on both sides', async () => {
    const provider = await makeProvider('Ski_Pass');
    const customer = await makeCustomer();
    const pass = await makeSkiPassListing(provider.id, 50);

    const { intent, create } = await book(customer, {
      productId: String(pass._id),
      date: isoDate(daysFromNow(3)),
      personCount: 3,
      totalPrice: 1, // ignored
      isPermitted: false, // ignored
    });
    expect(intent.status).toBe(200);
    expect(intent.body.data).toMatchObject({ amount: 150, currency: 'eur', category: 'Ski_Pass' });
    expect(intent.body.data.publishableKey).toMatch(/^pk_/);

    expect(create.status).toBe(201);
    const b = create.body.data;
    expect(b).toMatchObject({ category: 'Ski_Pass', status: 'Confirmed', people: 3 });
    expect(b.price.total).toBe(150);
    expect(b.ticketNumber).toMatch(/^TKT-/);
    expect(b.actions).toEqual(['cancel']);
    expect(b).not.toHaveProperty('providerPayout');
    expect(b).not.toHaveProperty('__v');
    expect(b.earning).toBeUndefined();

    const mine = await api().get(`${B}/my?tab=upcoming`).set(...customer.auth);
    expect(mine.body.meta.total).toBe(1);
    const prov = await api().get(`${B}/provider`).set(...provider.auth);
    expect(prov.body.data[0].customer.name).toBe(customer.doc.fullName);
    expect(prov.body.data[0].actions).toEqual(['reject']);

    // a second create with the same payment returns the same booking (idempotent)
    const again = await api()
      .post(`${B}/create`)
      .set(...customer.auth)
      .send({ productId: String(pass._id), paymentIntentId: intent.body.data.paymentIntentId });
    expect(again.status).toBe(201);
    expect(again.body.data.id).toBe(b.id);
    expect(await Booking.countDocuments()).toBe(1);
  });

  it('completes after its day and pays the provider minus the platform fee', async () => {
    const provider = await makeProvider('Ski_Pass');
    const customer = await makeCustomer();
    const pass = await makeSkiPassListing(provider.id, 100);
    const { create } = await book(customer, { productId: String(pass._id), date: isoDate(daysFromNow(1)) });
    expect(create.status).toBe(201);

    await runBookingAutomation(daysFromNow(5));
    const b: any = await Booking.findById(create.body.data.id).lean();
    expect(b.bookingStatus).toBe('Completed');
    expect(b.providerPayout).toBe('paid');
    expect(b.platformFee).toBe(20);
    expect(b.providerEarning).toBe(80);
    expect(await balance(provider)).toBe(80);
    expect(await balance(admin)).toBe(20);
  });

  it('rejects a past date and an unknown listing', async () => {
    const customer = await makeCustomer();
    const provider = await makeProvider('Ski_Pass');
    const pass = await makeSkiPassListing(provider.id);
    const past = await api().post(`${B}/intent`).set(...customer.auth)
      .send({ productId: String(pass._id), date: isoDate(daysFromNow(-2)) });
    expect(past.status).toBe(400);
    const missing = await api().post(`${B}/intent`).set(...customer.auth)
      .send({ productId: '64b000000000000000000000', date: isoDate(daysFromNow(2)) });
    expect(missing.status).toBe(404);
  });
});

describe('Ski Hire', () => {
  const range = (fromDay: number, toDay: number) => ({
    startDateAndTime: daysFromNow(fromDay, 9).toISOString(),
    endDateAndTime: daysFromNow(toDay, 9).toISOString(),
  });

  it('checks stock per date, needs approval, hand-over, late return fee, payout', async () => {
    const provider = await makeProvider('Ski_Hire');
    const customer = await makeCustomer();
    const other = await makeCustomer();
    const hire = await makeSkiHireListing(provider.id, { qty: 2, price: 25, rate: 10 });
    const skis = String(hire.items[0]._id);

    const first = await book(customer, {
      productId: String(hire._id),
      ...range(2, 4),
      bookingItems: [{ itemId: skis, quantity: 2 }],
      isPermitted: true, // client can't approve itself
      bookingStatus: 'Completed', // ignored
    });
    expect(first.intent.body.data.amount).toBe(100); // 25 x 2 x 2 days
    expect(first.create.status).toBe(201);
    const id = first.create.body.data.id;
    expect(first.create.body.data.status).toBe('Pending');

    // same dates: sold out; other dates: fine
    const clash = await api().post(`${B}/intent`).set(...other.auth)
      .send({ productId: String(hire._id), ...range(3, 5), bookingItems: [{ itemId: skis, quantity: 1 }] });
    expect(clash.status).toBe(409);
    const later = await api().post(`${B}/intent`).set(...other.auth)
      .send({ productId: String(hire._id), ...range(6, 7), bookingItems: [{ itemId: skis, quantity: 2 }] });
    expect(later.status).toBe(200);

    // availability endpoint
    const av = await api().get(`${B}/availability/${hire._id}`).query(range(2, 3));
    expect(av.body.data.items.find((i: any) => i.itemId === skis).available).toBe(0);

    // customer can't approve; another provider can't approve
    expect((await api().patch(`${B}/${id}/approve`).set(...customer.auth)).status).toBe(403);
    const stranger = await makeProvider('Ski_Hire');
    expect((await api().patch(`${B}/${id}/approve`).set(...stranger.auth)).status).toBe(403);

    const approved = await api().patch(`${B}/${id}/approve`).set(...provider.auth);
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('Confirmed');
    expect(approved.body.data.actions).toEqual(expect.arrayContaining(['hand_over', 'reject']));
    expect((await api().patch(`${B}/${id}/approve`).set(...provider.auth)).status).toBe(409);
    expect(await Notification.exists({ receiverId: customer.id, event: 'booking.approved', booking: id })).toBeTruthy();

    // return before hand-over is refused
    expect((await api().patch(`${B}/${id}/return`).set(...provider.auth)).status).toBe(409);

    const handed = await api().patch(`${B}/${id}/hand-over`).set(...provider.auth);
    expect(handed.body.data.status).toBe('InProgress');
    expect(handed.body.data.actions).toEqual(['return']);

    // pretend the rental ended 3 h 20 min ago
    await Booking.updateOne({ _id: id }, {
      $set: { endDateAndTime: new Date(Date.now() - 200 * 60000), endAt: new Date(Date.now() - 200 * 60000) },
    });
    const mineActive = await api().get(`${B}/${id}`).set(...customer.auth);
    expect(mineActive.body.data.timer.state).toBe('overdue');

    const ret = await api().patch(`${B}/${id}/return`).set(...provider.auth);
    expect(ret.status).toBe(200);
    expect(ret.body.data.status).toBe('Completed');
    expect(ret.body.data.lateFee).toEqual({ hours: 4, amount: 40, status: 'due' });
    expect(await balance(provider)).toBe(80); // 100 - 20 %

    // customer pays the late fee in the app
    const cust = await api().get(`${B}/${id}`).set(...customer.auth);
    expect(cust.body.data.actions).toEqual(expect.arrayContaining(['pay_late_fee', 'review']));
    const lf = await api().post(`${B}/${id}/late-fee/intent`).set(...customer.auth);
    expect(lf.status).toBe(200);
    expect(lf.body.data.amount).toBe(40);
    payIntent(lf.body.data.paymentIntentId);
    const paid = await api().post(`${B}/${id}/late-fee/confirm`).set(...customer.auth)
      .send({ paymentIntentId: lf.body.data.paymentIntentId });
    expect(paid.status).toBe(200);
    expect(paid.body.data.lateFee.status).toBe('paid');
    expect(await balance(provider)).toBe(112); // 80 + 32
    expect(await balance(admin)).toBe(28); // 20 + 8
    // confirming twice changes nothing
    await api().post(`${B}/${id}/late-fee/confirm`).set(...customer.auth)
      .send({ paymentIntentId: lf.body.data.paymentIntentId });
    expect(await balance(provider)).toBe(112);
  });

  it('closes a rental never picked up as a no-show (no refund)', async () => {
    const provider = await makeProvider('Ski_Hire');
    const customer = await makeCustomer();
    const hire = await makeSkiHireListing(provider.id);
    const { create } = await book(customer, {
      productId: String(hire._id),
      ...range(1, 2),
      bookingItems: [{ itemId: String(hire.items[1]._id), quantity: 1 }],
    });
    await api().patch(`${B}/${create.body.data.id}/approve`).set(...provider.auth);
    await runBookingAutomation(daysFromNow(4));
    const b: any = await Booking.findById(create.body.data.id).lean();
    expect(b.bookingStatus).toBe('Completed');
    expect(b.noShow).toBe(true);
    expect(b.providerPayout).toBe('paid');
    expect(getRefunds()).toHaveLength(0);
  });
});

describe('Transport', () => {
  it('blocks double booking of the vehicle; provider reject refunds 100 % once', async () => {
    const provider = await makeProvider('Transport');
    const customer = await makeCustomer();
    const van = await makeTransportListing(provider.id, 100);
    const body = {
      productId: String(van._id),
      startDateAndTime: daysFromNow(2, 8).toISOString(),
      endDateAndTime: daysFromNow(2, 10).toISOString(),
      personCount: 3,
      address: 'Hotel',
      destination: 'Airport',
    };
    const tooMany = await api().post(`${B}/intent`).set(...customer.auth).send({ ...body, personCount: 9 });
    expect(tooMany.status).toBe(400);

    const { create } = await book(customer, body);
    expect(create.status).toBe(201);
    const id = create.body.data.id;

    const clash = await api().post(`${B}/intent`).set(...(await makeCustomer()).auth).send(body);
    expect(clash.status).toBe(409);

    const rejected = await api().patch(`${B}/${id}/reject`).set(...provider.auth).send({ reason: 'Vehicle broken' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('Cancelled');
    expect(rejected.body.data.cancellation).toEqual({ by: 'provider', reason: 'Vehicle broken', refundAmount: 100 });
    expect(getRefunds()).toHaveLength(1);
    expect(getRefunds()[0].amount).toBeUndefined(); // full refund
    expect((await Payment.findOne({ booking: id }).lean() as any).status).toBe('Refunded');

    // no second refund, by anyone
    expect((await api().patch(`${B}/${id}/reject`).set(...provider.auth)).status).toBe(409);
    expect((await api().patch(`${B}/${id}/cancel`).set(...customer.auth)).status).toBe(409);
    expect(getRefunds()).toHaveLength(1);

    // the slot is free again
    const retry = await api().post(`${B}/intent`).set(...customer.auth).send(body);
    expect(retry.status).toBe(200);
  });
});

describe('Restaurant', () => {
  it('counts seats per date and slot; customer cancel > 24 h refunds 100 %', async () => {
    const provider = await makeProvider('Restaurant');
    const customer = await makeCustomer();
    const r = await makeRestaurantListing(provider.id);
    const vip = String(r.items[0]._id);
    const dinner = String(r.slots[1]._id);
    const day = isoDate(daysFromNow(5));

    const av = await api().get(`${B}/availability/${r._id}`).query({ date: day });
    expect(av.status).toBe(200);
    expect(av.body.data.slots).toHaveLength(2);

    const first = await book(customer, { productId: String(r._id), date: day, slotId: dinner, bookingItems: [{ itemId: vip, quantity: 2 }] });
    expect(first.intent.body.data.amount).toBe(85); // 2 x 40 + 5 service fee
    expect(first.create.status).toBe(201);
    expect(first.create.body.data.schedule.slot).toEqual({ startTime: '7:00 PM', endTime: '9:00 PM' });

    const full = await api().post(`${B}/intent`).set(...customer.auth)
      .send({ productId: String(r._id), date: day, slotId: dinner, bookingItems: [{ itemId: vip, quantity: 1 }] });
    expect(full.status).toBe(409);
    // another day, or the lunch slot, still has VIP seats
    const otherDay = await api().post(`${B}/intent`).set(...customer.auth)
      .send({ productId: String(r._id), date: isoDate(daysFromNow(6)), slotId: dinner, bookingItems: [{ itemId: vip, quantity: 2 }] });
    expect(otherDay.status).toBe(200);
    // legacy "slots: [id]" still works
    const lunch = await api().post(`${B}/intent`).set(...customer.auth)
      .send({ productId: String(r._id), date: day, slots: [String(r.slots[0]._id)], bookingItems: [{ itemId: vip, quantity: 2 }] });
    expect(lunch.status).toBe(200);

    // someone else can't cancel or read it
    const intruder = await makeCustomer();
    const id = first.create.body.data.id;
    expect((await api().patch(`${B}/${id}/cancel`).set(...intruder.auth)).status).toBe(403);
    expect((await api().get(`${B}/${id}`).set(...intruder.auth)).status).toBe(403);

    const cancelled = await api().patch(`${B}/${id}/cancel`).set(...customer.auth).send({ reason: 'Plans changed' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.refund).toEqual({ amount: 85, percent: 100, status: 'refunded' });
    expect(await balance(provider)).toBe(0);

    // seats are free again
    const again = await api().post(`${B}/intent`).set(...customer.auth)
      .send({ productId: String(r._id), date: day, slotId: dinner, bookingItems: [{ itemId: vip, quantity: 2 }] });
    expect(again.status).toBe(200);
  });
});

describe('Massage', () => {
  it('validates duration and hours; late customer cancel refunds 90 % and pays the provider 10 % minus fee', async () => {
    const provider = await makeProvider('Massage');
    const customer = await makeCustomer();
    const m = await makeMassageListing(provider.id);
    const tomorrow = isoDate(daysFromNow(1));

    const badDuration = await api().post(`${B}/intent`).set(...customer.auth)
      .send({ productId: String(m._id), date: tomorrow, time: '10:00 AM', duration: '45 min' });
    expect(badDuration.status).toBe(400);
    const closed = await api().post(`${B}/intent`).set(...customer.auth)
      .send({ productId: String(m._id), date: tomorrow, time: '7:30 PM', duration: '90 min' });
    expect(closed.status).toBe(400);

    const { intent, create } = await book(customer, {
      productId: String(m._id), date: tomorrow, time: '10:00 AM', duration: '1h',
    });
    expect(intent.body.data.amount).toBe(80);
    const id = create.body.data.id;
    await api().patch(`${B}/${id}/approve`).set(...provider.auth);

    // move the session to 5 hours from now: inside the 24 h window
    const soon = new Date(Date.now() + 5 * 3600000);
    await Booking.updateOne({ _id: id }, { $set: { startAt: soon, endAt: new Date(soon.getTime() + 3600000) } });

    const res = await api().patch(`${B}/${id}/cancel`).set(...customer.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.refund).toEqual({ amount: 72, percent: 90, status: 'refunded' });
    expect(getRefunds()[0].amount).toBe(7200); // partial refund in cents
    expect((await Payment.findOne({ booking: id }).lean() as any).status).toBe('Partially_Refunded');
    expect(await balance(provider)).toBe(6.4); // 8 kept - 20 %
  });

  it('provider marks a started session complete', async () => {
    const provider = await makeProvider('Massage');
    const customer = await makeCustomer();
    const m = await makeMassageListing(provider.id);
    const { create } = await book(customer, { productId: String(m._id), date: isoDate(daysFromNow(2)), time: '11:00', duration: '60' });
    const id = create.body.data.id;
    await api().patch(`${B}/${id}/approve`).set(...provider.auth);
    expect((await api().patch(`${B}/${id}/complete`).set(...provider.auth)).status).toBe(409); // not started
    const past = new Date(Date.now() - 30 * 60000);
    await Booking.updateOne({ _id: id }, { $set: { startAt: past, endAt: new Date(past.getTime() + 3600000) } });
    const done = await api().patch(`${B}/${id}/complete`).set(...provider.auth);
    expect(done.body.data.status).toBe('Completed');
    expect(done.body.data.earning).toMatchObject({ gross: 80, platformFee: 16, net: 64, status: 'paid' });
  });
});

describe('Automation and old endpoints', () => {
  it('expires a booking the provider did not approve in time (full refund)', async () => {
    const provider = await makeProvider('Massage');
    const customer = await makeCustomer();
    const m = await makeMassageListing(provider.id);
    const { create } = await book(customer, { productId: String(m._id), date: isoDate(daysFromNow(3)), time: '10:00 AM', duration: '60 min' });
    await runBookingAutomation(new Date(Date.now() + 25 * 3600000));
    const b: any = await Booking.findById(create.body.data.id).lean();
    expect(b.bookingStatus).toBe('Cancelled');
    expect(b.cancelledBy).toBe('system');
    expect(getRefunds()).toHaveLength(1);
    expect(await Notification.exists({ receiverId: provider.id, event: 'booking.expired' })).toBeTruthy();
  });

  it('keeps the old action paths working', async () => {
    const provider = await makeProvider('Massage');
    const customer = await makeCustomer();
    const m = await makeMassageListing(provider.id);
    const { create } = await book(customer, { productId: String(m._id), date: isoDate(daysFromNow(3)), time: '10:00 AM', duration: '60 min' });
    const id = create.body.data.id;
    const permit = await api().patch(`${B}/update-permit/${id}`).set(...provider.auth).send({ isPermitted: true });
    expect(permit.body.data.status).toBe('Confirmed');
    const refund = await api().patch(`${B}/refund/${id}`).set(...customer.auth).send({ reason: 'x' });
    expect(refund.status).toBe(200);
    expect(refund.body.data.status).toBe('Cancelled');
    const legacyList = await api().get(`${B}/my-booking`).set(...customer.auth);
    expect(legacyList.body.data).toHaveLength(1);
  });

  it('needs a paid intent to create a booking', async () => {
    const provider = await makeProvider('Ski_Pass');
    const customer = await makeCustomer();
    const pass = await makeSkiPassListing(provider.id);
    const body = { productId: String(pass._id), date: isoDate(daysFromNow(2)) };
    const intent = await api().post(`${B}/intent`).set(...customer.auth).send(body);
    const unpaid = await api().post(`${B}/create`).set(...customer.auth)
      .send({ ...body, paymentIntentId: intent.body.data.paymentIntentId });
    expect(unpaid.status).toBe(402);
    // someone else's payment
    payIntent(intent.body.data.paymentIntentId);
    const thief = await makeCustomer();
    const stolen = await api().post(`${B}/create`).set(...thief.auth)
      .send({ ...body, paymentIntentId: intent.body.data.paymentIntentId });
    expect(stolen.status).toBe(403);
    expect(await Booking.countDocuments()).toBe(0);
  });
});
