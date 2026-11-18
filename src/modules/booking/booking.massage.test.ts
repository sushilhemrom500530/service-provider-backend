/**
 * QA Massage report of 17 Nov 2026:
 *  M1  a session time takes at most `capacity` guests (therapists, default 1)
 *  M2  the customer's cancel text names the service and the time
 *  M3  the provider's "cancelled by customer" text has the date and time
 */
import { api, makeAdmin, makeCustomer, makeProvider, makeSubCategory, daysFromNow, isoDate, PNG, TestUser } from '../../test/factories';
import { getRefunds, payIntent } from '../../test/stripeMock';
import { makeMassageListing } from '../../test/listingFixtures';
import { Booking } from './booking.model';
import { Notification } from '../notification/notification.model';
import { Massage } from '../massage/massage.model';
import { peakGuests } from './booking.availability';

const B = '/api/v1/booking';
const FULL = 'This time is already booked. Choose another time.';
const DAY = () => isoDate(daysFromNow(3));

/** paid booking through the real flow; returns the created booking id */
const book = async (customer: TestUser, body: Record<string, any>) => {
  const intent = await api().post(`${B}/intent`).set(...customer.auth).send(body);
  expect([intent.status, intent.body.message]).toEqual([200, expect.any(String)]);
  payIntent(intent.body.data.paymentIntentId);
  const created = await api().post(`${B}/create`).set(...customer.auth)
    .send({ ...body, paymentIntentId: intent.body.data.paymentIntentId });
  expect(created.status).toBe(201);
  return created.body.data.id as string;
};

const session = (m: any, time: string, duration = '60 min', personCount = 1) => ({
  productId: String(m._id), date: DAY(), time, duration, personCount,
});

const tryIntent = async (body: Record<string, any>) =>
  api().post(`${B}/intent`).set(...(await makeCustomer()).auth).send(body);

const listingWith = async (provider: TestUser, capacity?: number) => {
  const m: any = await makeMassageListing(provider.id); // 60 min €80 / 90 min €110, 9:00 AM - 8:00 PM
  if (capacity) await Massage.updateOne({ _id: m._id }, { $set: { capacity } });
  return m;
};

beforeEach(async () => {
  await makeAdmin();
});

describe('M1: one therapist, one guest at a time (capacity 1, the default)', () => {
  it('a booked time is refused; overlapping times too; touching times are fine', async () => {
    const provider = await makeProvider('Massage');
    const m = await listingWith(provider);
    await book(await makeCustomer(), session(m, '11:00 AM')); // 11:00 - 12:00, still waiting for approval

    const same = await tryIntent(session(m, '11:00 AM'));
    expect([same.status, same.body.message]).toEqual([409, FULL]);
    const overlap = await tryIntent(session(m, '11:30 AM', '90 min'));
    expect([overlap.status, overlap.body.message]).toEqual([409, FULL]);
    const before = await tryIntent(session(m, '10:30 AM'));
    expect(before.status).toBe(409); // 10:30 - 11:30 overlaps

    expect((await tryIntent(session(m, '10:00 AM'))).status).toBe(200); // ends 11:00
    expect((await tryIntent(session(m, '12:00 PM'))).status).toBe(200); // starts 12:00
  });

  it('accepted and in-progress bookings block too; cancelled and rejected ones free the time', async () => {
    const provider = await makeProvider('Massage');
    const customer = await makeCustomer();
    const m = await listingWith(provider);
    const id = await book(customer, session(m, '2:00 PM'));
    await api().patch(`${B}/${id}/approve`).set(...provider.auth);
    expect((await tryIntent(session(m, '2:00 PM'))).status).toBe(409);

    await api().patch(`${B}/${id}/cancel`).set(...customer.auth);
    expect((await tryIntent(session(m, '2:00 PM'))).status).toBe(200);

    const id2 = await book(customer, session(m, '2:00 PM'));
    expect((await tryIntent(session(m, '2:00 PM'))).status).toBe(409);
    await api().patch(`${B}/${id2}/reject`).set(...provider.auth).send({ reason: 'Therapist ill' });
    expect((await tryIntent(session(m, '2:00 PM'))).status).toBe(200);
  });

  it('two guests on a one-therapist listing: 400 with the limit', async () => {
    const m = await listingWith(await makeProvider('Massage'));
    const res = await tryIntent(session(m, '11:00 AM', '60 min', 2));
    expect([res.status, res.body.message]).toEqual([400, 'This massage takes up to 1 guest at the same time.']);
  });

  it('the same time on another listing or another day is free', async () => {
    const provider = await makeProvider('Massage');
    const m = await listingWith(provider);
    const other = await listingWith(provider);
    await book(await makeCustomer(), session(m, '11:00 AM'));
    expect((await tryIntent(session(other, '11:00 AM'))).status).toBe(200);
    expect((await tryIntent({ ...session(m, '11:00 AM'), date: isoDate(daysFromNow(4)) })).status).toBe(200);
  });

  it('two customers paying for the same time at once: the second booking is refused and refunded', async () => {
    const m = await listingWith(await makeProvider('Massage'));
    const [a, b] = [await makeCustomer(), await makeCustomer()];
    const body = session(m, '4:00 PM');
    // both see a free time and pay before either booking exists
    const ia = await api().post(`${B}/intent`).set(...a.auth).send(body);
    const ib = await api().post(`${B}/intent`).set(...b.auth).send(body);
    expect([ia.status, ib.status]).toEqual([200, 200]);
    payIntent(ia.body.data.paymentIntentId);
    payIntent(ib.body.data.paymentIntentId);

    const first = await api().post(`${B}/create`).set(...a.auth).send({ ...body, paymentIntentId: ia.body.data.paymentIntentId });
    expect(first.status).toBe(201);
    const second = await api().post(`${B}/create`).set(...b.auth).send({ ...body, paymentIntentId: ib.body.data.paymentIntentId });
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/refunded/i);
    expect(getRefunds()).toHaveLength(1);
    expect(await Booking.countDocuments({ product: m._id })).toBe(1);
  });
});

describe('M1: capacity set by the provider', () => {
  it('capacity 2: two guests at the same time, the third is refused; group bookings count every guest', async () => {
    const m = await listingWith(await makeProvider('Massage'), 2);
    await book(await makeCustomer(), session(m, '11:00 AM'));

    const two = await tryIntent(session(m, '11:00 AM', '60 min', 2));
    expect([two.status, two.body.message]).toEqual([409, 'Only 1 place left at this time. Choose another time or fewer guests.']);
    await book(await makeCustomer(), session(m, '11:30 AM', '90 min')); // 11:30-13:00, overlaps -> 2 at 11:30
    expect((await tryIntent(session(m, '11:00 AM'))).status).toBe(409);
    expect((await tryIntent(session(m, '12:00 PM'))).status).toBe(200); // 12:00-13:00: only one guest then
    expect((await tryIntent(session(m, '9:00 AM', '60 min', 2))).status).toBe(200);
    expect((await tryIntent(session(m, '9:00 AM', '60 min', 3))).status).toBe(400);
  });

  it('peak, not sum: two short sessions one after the other leave a place for a long one', async () => {
    const m = await listingWith(await makeProvider('Massage'), 2);
    await book(await makeCustomer(), session(m, '11:00 AM')); // 11-12
    await book(await makeCustomer(), session(m, '12:00 PM')); // 12-13
    expect((await tryIntent(session(m, '11:00 AM', '90 min'))).status).toBe(200); // 11:00-12:30: 2 at most
  });

  it('peakGuests: touching sessions do not overlap', () => {
    const at = (h: number) => new Date(Date.UTC(2030, 0, 1, h));
    const list = [
      { startAt: at(10), endAt: at(11), personCount: 1 },
      { startAt: at(11), endAt: at(12), personCount: 2 },
      { startAt: at(11), endAt: at(13), personCount: 1 },
    ];
    expect(peakGuests(list, at(9), at(14))).toBe(3);
    expect(peakGuests(list, at(10), at(11))).toBe(1);
    expect(peakGuests(list, at(12), at(13))).toBe(1);
    expect(peakGuests([], at(9), at(10))).toBe(0);
  });
});

describe('M1: availability for the app', () => {
  it('one time: available false with the reason', async () => {
    const m = await listingWith(await makeProvider('Massage'));
    await book(await makeCustomer(), session(m, '11:00 AM'));
    const q = (query: Record<string, any>) => api().get(`${B}/availability/${m._id}`).query({ date: DAY(), duration: '60 min', ...query });

    expect((await q({ time: '11:00 AM' })).body.data).toMatchObject({ available: false, left: 0, reason: 'booked', capacity: 1, time: '11:00 AM', duration: '60 min' });
    expect((await q({ time: '12:00 PM' })).body.data).toMatchObject({ available: true, left: 1, reason: null });
    expect((await q({ time: '7:30 PM' })).body.data).toMatchObject({ available: false, reason: 'closed' });
    expect((await q({ time: '12:00 PM', personCount: 2 })).body.data).toMatchObject({ available: false, reason: 'too_many_guests' });
    const past = await api().get(`${B}/availability/${m._id}`).query({ date: isoDate(daysFromNow(-1)), time: '11:00 AM', duration: '60 min' });
    expect(past.body.data).toMatchObject({ available: false, reason: 'past' });
    expect((await q({ time: '11:00 AM', duration: '45 min' })).status).toBe(400); // not offered
  });

  it('a whole day: start times every 30 min, taken ones greyed out', async () => {
    const m = await listingWith(await makeProvider('Massage'));
    await book(await makeCustomer(), session(m, '11:00 AM'));
    const res = await api().get(`${B}/availability/${m._id}`).query({ date: DAY(), duration: '60 min' });
    expect(res.status).toBe(200);
    const { slots, capacity, step } = res.body.data;
    expect([capacity, step]).toEqual([1, 30]);
    expect(slots[0].time).toBe('9:00 AM');
    expect(slots[slots.length - 1].time).toBe('7:00 PM'); // last 60 min session before 8:00 PM
    const free = (t: string) => slots.find((s: any) => s.time === t).available;
    expect([free('10:00 AM'), free('10:30 AM'), free('11:00 AM'), free('11:30 AM'), free('12:00 PM')]).toEqual([true, false, false, false, true]);
    expect(slots.find((s: any) => s.time === '11:00 AM')).toMatchObject({ left: 0, isPast: false });

    const hourly = await api().get(`${B}/availability/${m._id}`).query({ date: DAY(), duration: '90 min', step: 60 });
    expect(hourly.body.data.slots.map((s: any) => s.time)).toEqual(
      ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'],
    );
  });

  it('old call without a date still answers available (no break for older apps)', async () => {
    const m = await listingWith(await makeProvider('Massage'));
    const res = await api().get(`${B}/availability/${m._id}`);
    expect(res.body.data).toMatchObject({ category: 'Massage', available: true, capacity: 1 });
  });
});

describe('M1: capacity on the listing', () => {
  it('provider sets it on create / edit ("therapists" also accepted); detail returns it; invalid -> 400', async () => {
    const provider = await makeProvider('Massage');
    const sub = await makeSubCategory('Massage', 'Sports');
    const res = await api().post('/api/v1/massage').set(...provider.auth)
      .field('category', sub).field('title', 'Duo').field('openTime', '9:00 AM').field('closeTime', '8:00 PM')
      .field('serviceArea', 'Méribel').field('benefits', 'Relax').field('recommendations', 'Water')
      .field('durations', JSON.stringify([{ duration: '60 min', price: 100 }]))
      .field('capacity', '2')
      .attach('file', PNG, 'a.png');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ capacity: 2, price: { amount: 100, unit: 'per_person' } });

    const id = res.body.data.id;
    const edit = await api().patch(`/api/v1/massage/${id}`).set(...provider.auth).send({ therapists: 3 });
    expect(edit.body.data.capacity).toBe(3);
    for (const bad of [0, -1, 1.5, 'x', 51]) {
      const r = await api().patch(`/api/v1/massage/${id}`).set(...provider.auth).send({ capacity: bad });
      expect([bad, r.status]).toEqual([bad, 400]);
    }
    expect((await api().get(`/api/v1/massage/${id}`)).body.data.capacity).toBe(3);
  });

  it('a listing saved before capacity existed counts as 1', async () => {
    const m = await listingWith(await makeProvider('Massage'));
    await Massage.collection.updateOne({ _id: m._id }, { $unset: { capacity: '' } });
    expect((await api().get(`/api/v1/massage/${m._id}`)).body.data.capacity).toBe(1);
    await book(await makeCustomer(), session(m, '11:00 AM'));
    expect((await tryIntent(session(m, '11:00 AM'))).status).toBe(409);
  });
});

describe('M2 / M3: cancellation texts name the booking', () => {
  it('customer cancel: both texts have the service and the session time; data.startAt is exact', async () => {
    const provider = await makeProvider('Massage');
    const customer = await makeCustomer();
    const m = await listingWith(provider);
    const id = await book(customer, session(m, '12:00 PM'));
    await api().patch(`${B}/${id}/cancel`).set(...customer.auth);
    const b: any = await Booking.findById(id).lean();

    const mine: any = await Notification.findOne({ receiverId: customer.id, event: 'booking.cancelled' }).lean();
    expect(mine.description).toMatch(/^Deep tissue on \w{3} \d{1,2} \w{3}, 12:00 PM \w+ was cancelled\. €80\.00 \(100%\) is refunded to your card\.$/);
    expect(new Date(mine.data.startAt).getTime()).toBe(new Date(b.startAt).getTime());
    expect(mine.data).toMatchObject({ refunded: 80, percent: 100 });

    const theirs: any = await Notification.findOne({ receiverId: provider.id, event: 'booking.cancelled' }).lean();
    expect(theirs.description).toMatch(/^A booking for Deep tissue on \w{3} \d{1,2} \w{3}, 12:00 PM \w+ was cancelled by the customer\.$/);
    expect(new Date(theirs.data.startAt).getTime()).toBe(new Date(b.startAt).getTime());
  });

  it('provider reject: the customer text has the time and the reason', async () => {
    const provider = await makeProvider('Massage');
    const customer = await makeCustomer();
    const m = await listingWith(provider);
    const id = await book(customer, session(m, '3:00 PM'));
    await api().patch(`${B}/${id}/reject`).set(...provider.auth).send({ reason: 'Therapist ill' });
    const n: any = await Notification.findOne({ receiverId: customer.id, event: 'booking.rejected' }).lean();
    expect(n.description).toMatch(/^Deep tissue on \w{3} \d{1,2} \w{3}, 3:00 PM \w+ was cancelled by the provider\. €80\.00 is refunded to your card\. Reason: Therapist ill$/);
  });
});
