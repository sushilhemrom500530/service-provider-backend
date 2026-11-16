/**
 * Regression tests for the app team's report:
 *  - the review button must disappear once the customer has reviewed
 *  - massage time/duration come back in one format ("10:30 AM", "60 min")
 *  - listings that can never be booked are refused
 */
import { api, makeCustomer, makeProvider, makeSubCategory, daysFromNow, isoDate, TestUser } from '../../test/factories';
import { payIntent } from '../../test/stripeMock';
import { makeMassageListing, makeRestaurantListing, makeSkiPassListing } from '../../test/listingFixtures';
import { Massage } from '../massage/massage.model';
import { runBookingAutomation } from '../../jobs/automaticUpdateJobService';
import { fitsOpeningHours, formatDuration, formatTime, openWindowMinutes } from './booking.rules';

const B = '/api/v1/booking';

const book = async (customer: TestUser, body: Record<string, any>) => {
  const intent = await api().post(`${B}/intent`).set(...customer.auth).send(body);
  expect(intent.status).toBe(200);
  payIntent(intent.body.data.paymentIntentId);
  const create = await api()
    .post(`${B}/create`)
    .set(...customer.auth)
    .send({ ...body, paymentIntentId: intent.body.data.paymentIntentId });
  expect(create.status).toBe(201);
  return create.body.data;
};

describe('rules helpers', () => {
  it('formats durations and times', () => {
    expect(formatDuration('1 hrs')).toBe('60 min');
    expect(formatDuration('30 mins')).toBe('30 min');
    expect(formatDuration('1 hour 30 min')).toBe('90 min');
    expect(formatDuration(null)).toBeNull();
    expect(formatTime('14:00')).toBe('2:00 PM');
    expect(formatTime('9:05 am')).toBe('9:05 AM');
    expect(formatTime(undefined)).toBeNull();
  });

  it('opening window and session fit, also past midnight', () => {
    expect(openWindowMinutes('12:21 AM', '2:21 AM')).toBe(120);
    expect(openWindowMinutes('8:45 PM', '3:30 AM')).toBe(405);
    expect(openWindowMinutes('9:00 AM', '9:00 AM')).toBe(1440);
    expect(fitsOpeningHours('11:00 PM', 60, '8:45 PM', '3:30 AM')).toBe(true);
    expect(fitsOpeningHours('1:00 AM', 120, '8:45 PM', '3:30 AM')).toBe(true);
    expect(fitsOpeningHours('3:00 AM', 60, '8:45 PM', '3:30 AM')).toBe(false);
    expect(fitsOpeningHours('10:00 AM', 60, '8:45 PM', '3:30 AM')).toBe(false);
  });
});

describe('review action', () => {
  it('shows "review" after completion and hides it once the customer reviewed', async () => {
    const provider = await makeProvider('Ski_Pass');
    const customer = await makeCustomer();
    const pass = await makeSkiPassListing(provider.id, 40);
    const first = await book(customer, { productId: String(pass._id), date: isoDate(daysFromNow(1)) });
    const second = await book(customer, { productId: String(pass._id), date: isoDate(daysFromNow(2)) });
    await runBookingAutomation(daysFromNow(4));

    const before = await api().get(`${B}/${first.id}`).set(...customer.auth);
    expect(before.body.data.status).toBe('Completed');
    expect(before.body.data.actions).toContain('review');

    const review = await api()
      .post(`/api/v1/ski-pass/${pass._id}/review`)
      .set(...customer.auth)
      .send({ rating: 5, comment: 'Great' });
    expect(review.status).toBe(201);

    // gone on this booking, on the customer's other booking of the same pass, and in lists
    const after = await api().get(`${B}/${first.id}`).set(...customer.auth);
    expect(after.body.data.actions).not.toContain('review');
    const other = await api().get(`${B}/${second.id}`).set(...customer.auth);
    expect(other.body.data.actions).not.toContain('review');
    const list = await api().get(`${B}/my`).set(...customer.auth);
    for (const b of list.body.data) expect(b.actions).not.toContain('review');

    // another customer who has not reviewed still sees it
    const other2 = await makeCustomer();
    const theirs = await book(other2, { productId: String(pass._id), date: isoDate(daysFromNow(1)) });
    await runBookingAutomation(daysFromNow(4));
    const view = await api().get(`${B}/${theirs.id}`).set(...other2.auth);
    expect(view.body.data.actions).toContain('review');
  });
});

describe('massage formats and hours', () => {
  it('stores and returns time "h:mm A" and duration "<n> min"', async () => {
    const provider = await makeProvider('Massage');
    const customer = await makeCustomer();
    const m = await makeMassageListing(provider.id);
    const created = await book(customer, {
      productId: String(m._id),
      date: isoDate(daysFromNow(2)),
      time: '14:00',
      duration: '1h',
    });
    expect(created.schedule.time).toBe('2:00 PM');
    expect(created.schedule.duration).toBe('60 min');
    const provView = await api().get(`${B}/${created.id}`).set(...provider.auth);
    expect(provView.body.data.schedule).toMatchObject({ time: '2:00 PM', duration: '60 min' });
  });

  it('old listings with "30 mins" / "1 hrs" are returned as "30 min" / "60 min"', async () => {
    const provider = await makeProvider('Massage');
    const doc: any = await makeMassageListing(provider.id);
    await Massage.collection.updateOne(
      { _id: doc._id },
      { $set: { priceByDuration: [{ duration: '1 hrs', amount: 80 }, { duration: '30 mins', amount: 50 }] } },
    );
    const res = await api().get(`/api/v1/massage/${doc._id}`);
    expect(res.body.data.durations.map((d: any) => [d.duration, d.minutes])).toEqual([
      ['30 min', 30],
      ['60 min', 60],
    ]);
    // the app sends back what it got; booking still matches
    const customer = await makeCustomer();
    const intent = await api().post(`${B}/intent`).set(...customer.auth).send({
      productId: String(doc._id), date: isoDate(daysFromNow(2)), time: '10:00 AM', duration: '30 min',
    });
    expect(intent.status).toBe(200);
    expect(intent.body.data.amount).toBe(50);
  });

  it('books inside opening hours that cross midnight, refuses outside', async () => {
    const provider = await makeProvider('Massage');
    const customer = await makeCustomer();
    const m: any = await makeMassageListing(provider.id);
    await Massage.updateOne({ _id: m._id }, { $set: { openTime: '8:00 PM', closeTime: '2:00 AM' } });
    const base = { productId: String(m._id), date: isoDate(daysFromNow(2)), duration: '60 min' };
    const late = await api().post(`${B}/intent`).set(...customer.auth).send({ ...base, time: '11:00 PM' });
    expect(late.status).toBe(200);
    const noon = await api().post(`${B}/intent`).set(...customer.auth).send({ ...base, time: '12:00 PM' });
    expect(noon.status).toBe(400);
    const overrun = await api().post(`${B}/intent`).set(...customer.auth).send({ ...base, time: '1:30 AM' });
    expect(overrun.status).toBe(400);
  });
});

describe('impossible listings are refused', () => {
  let provider: TestUser;
  let sub: string;
  beforeEach(async () => {
    provider = await makeProvider('Massage');
    sub = await makeSubCategory('Massage');
  });

  const body = (extra: Record<string, any>) => ({
    category: sub,
    title: 'Night massage',
    serviceArea: 'Chamonix',
    benefits: 'b',
    ourRecommendations: 'r',
    ...extra,
  });
  const create = (extra: Record<string, any>) => {
    let req = api().post('/api/v1/massage').set(...provider.auth);
    for (const [k, v] of Object.entries(body(extra)))
      req = req.field(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    return req.attach('file', Buffer.from('89504e470d0a1a0a', 'hex'), 'a.png');
  };

  it('massage: a session longer than the opening hours -> 400', async () => {
    const res = await create({
      openTime: '12:21 AM',
      closeTime: '2:21 AM',
      priceByDuration: [{ duration: '11 hr 22 min', amount: 80 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/longer than the opening hours/);
    expect(await Massage.countDocuments()).toBe(0);
  });

  it('massage: overnight hours with a fitting session are accepted', async () => {
    const res = await create({
      openTime: '8:45 PM',
      closeTime: '3:30 AM',
      priceByDuration: [{ duration: '90 min', amount: 80 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.durations[0].duration).toBe('90 min');
  });

  it('massage update: shrinking hours below a session -> 400; editing other fields of old data still works', async () => {
    const m: any = await makeMassageListing(provider.id);
    const shrink = await api().patch(`/api/v1/massage/${m._id}`).set(...provider.auth).send({ openTime: '9:00 AM', closeTime: '10:00 AM' });
    expect(shrink.status).toBe(400);
    const longOne = await api().patch(`/api/v1/massage/${m._id}`).set(...provider.auth)
      .send({ priceByDuration: [{ duration: '12h', amount: 300 }] });
    expect(longOne.status).toBe(400);

    // an old listing that is already wrong can still get a new title
    await Massage.collection.updateOne(
      { _id: m._id },
      { $set: { openTime: '12:21 AM', closeTime: '2:21 AM', priceByDuration: [{ duration: '11 hr 22 min', amount: 80 }] } },
    );
    const title = await api().patch(`/api/v1/massage/${m._id}`).set(...provider.auth).send({ title: 'Renamed' });
    expect(title.status).toBe(200);
    // ...and fixing it is accepted
    const fix = await api().patch(`/api/v1/massage/${m._id}`).set(...provider.auth)
      .send({ priceByDuration: [{ duration: '60 min', amount: 80 }] });
    expect(fix.status).toBe(200);
  });

  it('restaurant: a 14-hour slot -> 400', async () => {
    const owner = await makeProvider('Restaurant');
    const r: any = await makeRestaurantListing(owner.id);
    const res = await api().patch(`/api/v1/restaurant/${r._id}`).set(...owner.auth)
      .send({ slots: [{ startTime: '8:00 AM', endTime: '10:00 PM' }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at most 6 hours/);
  });
});
