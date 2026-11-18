/**
 * The restaurant service fee is platform money (decided 17 Nov 2026).
 * The provider is paid on the seats only (minus the platform commission);
 * the service fee goes to the platform in full, also pro rata on the part
 * kept after a late cancel, and it is taken back the same way on refunds.
 *
 * Fixture: 2 VIP x 40 + 5 service fee = 85; platform commission 20 %.
 *   provider: 80 x 80 % = 64   platform: 16 + 5 = 21
 */
import { api, makeAdmin, makeCustomer, makeProvider, daysFromNow, isoDate, TestUser } from '../../test/factories';
import { payIntent } from '../../test/stripeMock';
import { makeMassageListing, makeRestaurantListing } from '../../test/listingFixtures';
import { Booking } from './booking.model';
import { Wallet } from '../wallet/wallet.model';
import { runBookingAutomation } from '../../jobs/automaticUpdateJobService';
import { serviceFeeOf, splitServiceFee } from './booking.rules';

const B = '/api/v1/booking';
const balance = async (u: TestUser) => Number(((await Wallet.findOne({ user: u.id }).lean()) as any)?.balance || 0);

let admin: TestUser;
beforeEach(async () => {
  admin = await makeAdmin(); // 20 % commission
});

const book = async (customer: TestUser, body: Record<string, any>) => {
  const intent = await api().post(`${B}/intent`).set(...customer.auth).send(body);
  expect(intent.status).toBe(200);
  payIntent(intent.body.data.paymentIntentId);
  const created = await api().post(`${B}/create`).set(...customer.auth)
    .send({ ...body, paymentIntentId: intent.body.data.paymentIntentId });
  expect(created.status).toBe(201);
  return created.body.data.id as string;
};

/** accepted 2 x VIP dinner (85, of which 5 service fee) */
const dinner = async (dayOffset = 5) => {
  const provider = await makeProvider('Restaurant');
  const customer = await makeCustomer();
  const r: any = await makeRestaurantListing(provider.id);
  const id = await book(customer, {
    productId: String(r._id),
    date: isoDate(daysFromNow(dayOffset)),
    slotId: String(r.slots[1]._id),
    bookingItems: [{ itemId: String(r.items[0]._id), quantity: 2 }],
  });
  expect((await api().patch(`${B}/${id}/approve`).set(...provider.auth)).status).toBe(200);
  return { provider, customer, r, id };
};

/** move the booking so it has started (and ends in `endsInMin`) */
const started = (id: string, endsInMin = 60) =>
  Booking.updateOne({ _id: id }, { $set: { startAt: new Date(Date.now() - 60000), endAt: new Date(Date.now() + endsInMin * 60000) } });

describe('rules', () => {
  it('serviceFeeOf: stored value, legacy restaurant fallback, never above the price', () => {
    expect(serviceFeeOf({ totalPrice: 85, serviceFee: 5 })).toBe(5);
    expect(serviceFeeOf({ totalPrice: 85, category: 'Restaurant' }, { serviceFee: 5 })).toBe(5);
    expect(serviceFeeOf({ totalPrice: 85, category: 'Massage' }, { serviceFee: 5 })).toBe(0);
    expect(serviceFeeOf({ totalPrice: 3, serviceFee: 5 })).toBe(3);
    expect(serviceFeeOf({ totalPrice: 85, serviceFee: 0, category: 'Restaurant' }, { serviceFee: 5 })).toBe(0);
  });

  it('splitServiceFee: whole amount and pro rata', () => {
    const b = { totalPrice: 65, serviceFee: 5 };
    expect(splitServiceFee(b, 65)).toEqual({ serviceFee: 5, providerGross: 60 });
    expect(splitServiceFee(b, 6.5)).toEqual({ serviceFee: 0.5, providerGross: 6 });
    expect(splitServiceFee(b, 0)).toEqual({ serviceFee: 0, providerGross: 0 });
    expect(splitServiceFee({ totalPrice: 100 }, 100)).toEqual({ serviceFee: 0, providerGross: 100 });
  });
});

describe('Restaurant service fee goes to the platform', () => {
  it('booking stores the fee; provider marks it done: provider 64, platform 21', async () => {
    const { provider, id } = await dinner();
    expect(((await Booking.findById(id).lean()) as any)).toMatchObject({ totalPrice: 85, serviceFee: 5 });

    // before payout: the provider sees what is pending
    const before = (await api().get(`${B}/${id}`).set(...provider.auth)).body.data.earning;
    expect(before).toMatchObject({ gross: 85, serviceFee: 5, platformFee: null, net: null, status: 'pending' });

    await started(id);
    expect((await api().patch(`${B}/${id}/complete`).set(...provider.auth)).status).toBe(200);
    expect(await balance(provider)).toBe(64);
    expect(await balance(admin)).toBe(21);
    const earning = (await api().get(`${B}/${id}`).set(...provider.auth)).body.data.earning;
    expect(earning).toMatchObject({ gross: 85, serviceFee: 5, platformFee: 21, net: 64, status: 'paid' });
  });

  it('auto-complete at the slot end pays the same split', async () => {
    const { provider, id } = await dinner();
    await Booking.updateOne({ _id: id }, { $set: { startAt: new Date(Date.now() - 3 * 3600000), endAt: new Date(Date.now() - 60000) } });
    await runBookingAutomation(new Date());
    expect(((await Booking.findById(id).lean()) as any)).toMatchObject({ bookingStatus: 'Completed', platformFee: 21, providerEarning: 64 });
    expect([await balance(provider), await balance(admin)]).toEqual([64, 21]);
  });

  it('late customer cancel (90 % back): the 8.50 kept = 0.50 service fee + 8.00 seats', async () => {
    const { provider, customer, id } = await dinner(1);
    await started(id, 120); // not allowed to cancel after start: move to 5 h ahead instead
    const soon = new Date(Date.now() + 5 * 3600000);
    await Booking.updateOne({ _id: id }, { $set: { startAt: soon, endAt: new Date(soon.getTime() + 7200000) } });
    const res = await api().patch(`${B}/${id}/cancel`).set(...customer.auth);
    expect(res.body.data.refund).toEqual({ amount: 76.5, percent: 90, status: 'refunded' });
    // provider: 8 x 80 % = 6.40; platform: 1.60 + 0.50 = 2.10
    expect([await balance(provider), await balance(admin)]).toEqual([6.4, 2.1]);
    expect(((await Booking.findById(id).lean()) as any)).toMatchObject({ platformFee: 2.1, providerEarning: 6.4 });
  });

  it('full refund (provider reject): nobody keeps anything, the fee goes back to the card too', async () => {
    const { provider, id } = await dinner();
    const res = await api().patch(`${B}/${id}/reject`).set(...provider.auth).send({ reason: 'Closed' });
    expect(res.body.data.cancellation.refundAmount).toBe(85);
    expect([await balance(provider), await balance(admin)]).toEqual([0, 0]);
  });

  it('admin refund after payout: the platform gives back its fee share too', async () => {
    const { provider, id } = await dinner();
    await started(id);
    await api().patch(`${B}/${id}/complete`).set(...provider.auth);
    expect([await balance(provider), await balance(admin)]).toEqual([64, 21]);

    const res = await api().patch(`${B}/${id}/admin-refund`).set(...admin.auth).send({ amount: 85, reason: 'Complaint' });
    expect(res.status).toBe(200);
    expect([await balance(provider), await balance(admin)]).toEqual([0, 0]);
  });

  it('a restaurant booking made before the fee was stored uses the listing fee and records it', async () => {
    const { provider, id } = await dinner();
    await Booking.collection.updateOne({ _id: (await Booking.findById(id))!._id }, { $unset: { serviceFee: '' } });
    await started(id);
    await api().patch(`${B}/${id}/complete`).set(...provider.auth);
    expect([await balance(provider), await balance(admin)]).toEqual([64, 21]);
    expect(((await Booking.findById(id).lean()) as any).serviceFee).toBe(5);
  });

  it('other services have no service fee: massage 80 -> provider 64, platform 16', async () => {
    const provider = await makeProvider('Massage');
    const customer = await makeCustomer();
    const m: any = await makeMassageListing(provider.id);
    const id = await book(customer, { productId: String(m._id), date: isoDate(daysFromNow(2)), time: '11:00 AM', duration: '60 min' });
    await api().patch(`${B}/${id}/approve`).set(...provider.auth);
    await started(id);
    await api().patch(`${B}/${id}/complete`).set(...provider.auth);
    expect([await balance(provider), await balance(admin)]).toEqual([64, 16]);
    const earning = (await api().get(`${B}/${id}`).set(...provider.auth)).body.data.earning;
    expect(earning).toMatchObject({ gross: 80, serviceFee: 0, platformFee: 16, net: 64 });
  });

  it('provider dashboard: pending leaves out the service fee; after payout earned 64, platform 21', async () => {
    const { provider, id } = await dinner();
    const dash = () => api().get('/api/v1/dashboard/meta/provider').set(...provider.auth);
    const before = await dash();
    expect(before.status).toBe(200);
    expect(before.body.data.earnings).toMatchObject({ pending: 80, earned: 0 });

    await started(id);
    await api().patch(`${B}/${id}/complete`).set(...provider.auth);
    expect((await dash()).body.data.earnings).toMatchObject({ pending: 0, earned: 64, platformFees: 21, balance: 64 });
  });
});
