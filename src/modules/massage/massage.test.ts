import { Types } from 'mongoose';
import {
  api,
  makeAdmin,
  makeCustomer,
  makeProvider,
  makeSubCategory,
  oid,
  PNG,
  TestUser,
} from '../../test/factories';
import { Massage } from './massage.model';
import { Booking } from '../booking/booking.model';
import { formatDuration, parseDurationMinutes } from './massage.utils';

const BASE = '/api/v1/massage';

const baseBody = (category: string, extra: Record<string, any> = {}) => ({
  category,
  title: 'Deep tissue',
  openTime: '9:00 AM',
  closeTime: '21:00',
  serviceArea: 'Chamonix',
  benefits: 'Relaxes muscles',
  ourRecommendations: 'Drink water',
  priceByDuration: [
    { duration: '90 min', amount: 120 },
    { duration: '1h', amount: 80 },
  ],
  ...extra,
});

/** Inserts a listing directly (no upload) */
const seed = (owner: string, category: string, extra: Record<string, any> = {}) =>
  Massage.create({
    category,
    owner,
    thumbnail: 'https://x/t.png',
    title: 'Swedish',
    openTime: '9:00 AM',
    closeTime: '6:00 PM',
    priceByDuration: [{ duration: '60 min', amount: 70 }],
    serviceArea: 'Chamonix',
    amount: 70,
    benefits: 'b',
    ourRecommendations: 'r',
    ...extra,
  });

const booking = (user: string, product: string, status: string) =>
  Booking.create({
    user,
    product,
    productModel: 'Massage',
    category: 'Massage',
    bookingStatus: status,
    totalPrice: 70,
    duration: '60 min',
  });

/** Multipart create with a thumbnail */
const createMultipart = (p: TestUser, body: Record<string, any>) => {
  let req = api().post(`${BASE}/create`).set(...p.auth);
  for (const [k, v] of Object.entries(body))
    req = req.field(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  return req.attach('file', PNG, 'a.png');
};

let provider: TestUser;
let sub: string;

beforeEach(async () => {
  provider = await makeProvider('Massage');
  sub = await makeSubCategory('Massage', 'Thai');
});

describe('duration parsing', () => {
  it.each([
    ['60', 60],
    [60, 60],
    ['60 min', 60],
    ['60mins', 60],
    ['1h', 60],
    ['1 hour', 60],
    ['1.5 hours', 90],
    ['1h 30', 90],
    ['1 hour 30 min', 90],
    ['90 MIN', 90],
  ])('%p -> %p', (input, minutes) => {
    expect(parseDurationMinutes(input)).toBe(minutes);
  });

  it.each(['', 'abc', '1.25 min', '-5'])('rejects %p', input => {
    expect(parseDurationMinutes(input)).toBeNull();
  });

  it('stored form still matches the booking normalizer', () => {
    const normalize = (v: string) => v.toLowerCase().replace(/\s+/g, '');
    expect(normalize(formatDuration(60))).toBe(normalize('60 min'));
  });
});

describe('create', () => {
  it('multipart: 201, owner from token, durations normalized, amount = cheapest', async () => {
    const other = oid();
    const res = await createMultipart(provider, {
      ...baseBody(sub),
      owner: other,
      averageRating: 5,
    });
    expect(res.status).toBe(201);
    const d = res.body.data;
    expect(d.provider.id).toBe(provider.id);
    expect(d.thumbnail).toMatch(/^https:\/\/test-bucket/);
    expect(d.subCategory).toEqual(expect.objectContaining({ id: sub, name: 'Thai' }));
    expect(d.durations).toEqual([
      expect.objectContaining({ duration: '60 min', minutes: 60, price: 80 }),
      expect.objectContaining({ duration: '90 min', minutes: 90, price: 120 }),
    ]);
    expect(d.price).toEqual({ amount: 80, unit: 'per_session' });
    expect(d.rating).toEqual({ average: 0, count: 0 });
    const doc: any = await Massage.findById(d.id).lean();
    expect(String(doc.owner)).toBe(provider.id);
    expect(doc.amount).toBe(80);
    expect(doc.averageRating).toBe(0);
  });

  it('accepts API names (durations/price, recommendations) and explicit amount', async () => {
    const body: any = baseBody(sub, {
      durations: [{ duration: '45', price: '50' }],
      recommendations: 'Rest',
      amount: '55',
    });
    delete body.priceByDuration;
    delete body.ourRecommendations;
    const res = await createMultipart(provider, body);
    expect(res.status).toBe(201);
    expect(res.body.data.recommendations).toBe('Rest');
    expect(res.body.data.durations[0]).toEqual(
      expect.objectContaining({ duration: '45 min', minutes: 45, price: 50 }),
    );
    const doc: any = await Massage.findById(res.body.data.id).lean();
    expect(doc.amount).toBe(55);
    expect(doc.priceByDuration[0].duration).toBe('45 min');
  });

  it('403 for a customer or another provider type', async () => {
    const customer = await makeCustomer();
    expect((await createMultipart(customer, baseBody(sub))).status).toBe(403);
    const transport = await makeProvider('Transport');
    expect((await createMultipart(transport, baseBody(sub))).status).toBe(403);
  });

  it('400 on validation errors', async () => {
    const cases = [
      baseBody(sub, { title: '' }),
      baseBody(sub, { openTime: '25:00' }),
      baseBody(sub, { closeTime: 'late' }),
      baseBody(sub, { priceByDuration: [{ duration: 'forever', amount: 10 }] }),
      baseBody(sub, { priceByDuration: [{ duration: '60', amount: 0 }] }),
      baseBody(sub, { priceByDuration: [{ duration: '60' }] }),
      baseBody(sub, {
        priceByDuration: [
          { duration: '60', amount: 10 },
          { duration: '1 hour', amount: 12 },
        ],
      }),
      baseBody(sub, { priceByDuration: [] }),
      baseBody(sub, { category: oid() }), // not a Massage sub-category
    ];
    for (const body of cases) {
      const res = await createMultipart(provider, body);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    }
    const missing: any = baseBody(sub);
    delete missing.benefits;
    expect((await createMultipart(provider, missing)).status).toBe(400);
  });

  it('400 without a thumbnail (JSON body)', async () => {
    const res = await api().post(BASE).set(...provider.auth).send(baseBody(sub));
    expect(res.status).toBe(400);
  });
});

describe('browse', () => {
  it('public cards with filters, search, sort, pagination; inactive/deleted hidden', async () => {
    const other = await makeSubCategory('Massage', 'Sports');
    await seed(provider.id, sub, { title: 'Cheap Thai', amount: 40, priceByDuration: [{ duration: '30 min', amount: 40 }] });
    await seed(provider.id, sub, { title: 'Pricey Thai', amount: 150, priceByDuration: [{ duration: '2 hours', amount: 150 }] });
    await seed(provider.id, other, { title: 'Sports one', serviceArea: 'Megeve' });
    await seed(provider.id, sub, { title: 'Hidden', isActive: false });
    await seed(provider.id, sub, { title: 'Gone', isDeleted: true });

    const all = await api().get(BASE);
    expect(all.status).toBe(200);
    expect(all.body.meta).toEqual({ page: 1, limit: 10, total: 3, totalPages: 1 });
    const titles = all.body.data.map((c: any) => c.title);
    expect(titles).not.toContain('Hidden');
    expect(titles).not.toContain('Gone');
    const card = all.body.data[0];
    expect(Object.keys(card).sort()).toEqual(
      ['category', 'id', 'isActive', 'price', 'provider', 'rating', 'serviceArea', 'subCategory', 'thumbnail', 'title'].sort(),
    );
    expect(card.category).toBe('Massage');
    expect(card.provider).toEqual({ id: provider.id, name: expect.any(String), photo: expect.any(String) });

    const byCat = await api().get(`${BASE}/all`).query({ category: 'sports' });
    expect(byCat.body.data.map((c: any) => c.title)).toEqual(['Sports one']);
    expect(byCat.body.data[0].subCategory.name).toBe('Sports');

    const search = await api().get(BASE).query({ search: 'thai', sort: 'price_asc' });
    expect(search.body.data.map((c: any) => c.title)).toEqual(['Cheap Thai', 'Pricey Thai']);
    expect(search.body.data[0].price).toEqual({ amount: 40, unit: 'per_session' });

    const range = await api().get(BASE).query({ minPrice: 60, maxPrice: 100 });
    expect(range.body.data.map((c: any) => c.title)).toEqual(['Sports one']);

    const area = await api().get(BASE).query({ serviceArea: 'meg' });
    expect(area.body.data).toHaveLength(1);

    const page = await api().get(BASE).query({ page: 2, limit: 2 });
    expect(page.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(page.body.data).toHaveLength(1);

    const bad = await api().get(BASE).query({ search: '((', category: '[' });
    expect(bad.status).toBe(200);
  });

  it('/my: own listings incl. inactive, status filter; admin sees all', async () => {
    const other = await makeProvider('Massage');
    await seed(provider.id, sub, { title: 'Mine active' });
    await seed(provider.id, sub, { title: 'Mine inactive', isActive: false });
    await seed(provider.id, sub, { title: 'Mine deleted', isDeleted: true });
    await seed(other.id, sub, { title: 'Theirs' });

    const mine = await api().get(`${BASE}/my`).set(...provider.auth);
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((c: any) => c.title).sort()).toEqual(['Mine active', 'Mine inactive']);
    expect(mine.body.data.find((c: any) => c.title === 'Mine inactive').isActive).toBe(false);

    const inactive = await api().get(`${BASE}/my-all`).set(...provider.auth).query({ status: 'inactive' });
    expect(inactive.body.data.map((c: any) => c.title)).toEqual(['Mine inactive']);

    const admin = await makeAdmin();
    const adminRes = await api().get(`${BASE}/my`).set(...admin.auth);
    expect(adminRes.body.meta.total).toBe(3);

    const customer = await makeCustomer();
    expect((await api().get(`${BASE}/my`).set(...customer.auth)).status).toBe(403);
    expect((await api().get(`${BASE}/my`)).status).toBe(401);
  });
});

describe('detail', () => {
  it('whitelisted shape', async () => {
    const customer = await makeCustomer();
    const doc = await seed(provider.id, sub, {
      reviews: [{ userId: customer.id, rating: 4, comment: 'ok' }],
      priceByDuration: [
        { duration: '1 hour', amount: 70 },
        { duration: '30 min', amount: 40 },
      ],
    });
    const res = await api().get(`${BASE}/${doc._id}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    for (const k of ['__v', 'reviews', 'refunds', 'owner', 'priceByDuration', 'ourRecommendations', 'availableQty'])
      expect(d).not.toHaveProperty(k);
    expect(JSON.stringify(d)).not.toContain('@test.dev');
    expect(d).toEqual(
      expect.objectContaining({
        id: String(doc._id),
        openTime: '9:00 AM',
        closeTime: '6:00 PM',
        benefits: 'b',
        recommendations: 'r',
        description: '',
        price: { amount: 40, unit: 'per_session' },
      }),
    );
    // old stored duration text is returned in the one format "<n> min"
    expect(d.durations.map((x: any) => [x.duration, x.minutes, x.price])).toEqual([
      ['30 min', 30, 40],
      ['60 min', 60, 70],
    ]);
    expect(d.createdAt).toBeDefined();
  });

  it('404 deleted / unknown, 400 bad id', async () => {
    const doc = await seed(provider.id, sub, { isDeleted: true });
    expect((await api().get(`${BASE}/${doc._id}`)).status).toBe(404);
    expect((await api().get(`${BASE}/${oid()}`)).status).toBe(404);
    expect((await api().get(`${BASE}/nope`)).status).toBe(400);
  });
});

describe('update', () => {
  it('owner can update; mass assignment ignored; duration _ids kept', async () => {
    const doc: any = await seed(provider.id, sub, {
      priceByDuration: [
        { duration: '1 hour', amount: 70 },
        { duration: '90 min', amount: 100 },
      ],
    });
    const keepId = String(doc.priceByDuration[0]._id);
    const res = await api()
      .patch(`${BASE}/${doc._id}`)
      .set(...provider.auth)
      .send({
        title: 'Renamed',
        owner: oid(),
        averageRating: 5,
        reviewCount: 99,
        isDeleted: true,
        durations: [
          { duration: '60', price: 75 },
          { duration: '2h', price: 140 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Renamed');
    expect(res.body.data.durations.map((d: any) => [d.duration, d.price])).toEqual([
      ['60 min', 75],
      ['120 min', 140],
    ]);
    expect(res.body.data.durations[0].id).toBe(keepId);

    const after: any = await Massage.findById(doc._id).lean();
    expect(String(after.owner)).toBe(provider.id);
    expect(after.averageRating).toBe(0);
    expect(after.reviewCount).toBe(0);
    expect(after.isDeleted).toBe(false);
    expect(after.amount).toBe(75); // follows the cheapest duration
  });

  it('amount as a string is coerced; NaN refused; times validated', async () => {
    const doc = await seed(provider.id, sub);
    const ok = await api().patch(`${BASE}/update/${doc._id}`).set(...provider.auth).field('amount', '65');
    expect(ok.status).toBe(200);
    expect((await Massage.findById(doc._id).lean() as any).amount).toBe(65);

    const bad = await api().patch(`${BASE}/${doc._id}`).set(...provider.auth).send({ amount: 'abc' });
    expect(bad.status).toBe(400);
    const badTime = await api().patch(`${BASE}/${doc._id}`).set(...provider.auth).send({ openTime: '9h' });
    expect(badTime.status).toBe(400);
  });

  it('new thumbnail via multipart', async () => {
    const doc = await seed(provider.id, sub);
    const res = await api()
      .patch(`${BASE}/${doc._id}`)
      .set(...provider.auth)
      .field('priceByDuration', JSON.stringify([{ duration: '45 min', amount: 55 }]))
      .attach('file', PNG, 'b.png');
    expect(res.status).toBe(200);
    expect(res.body.data.thumbnail).toMatch(/^https:\/\/test-bucket/);
    expect(res.body.data.durations).toHaveLength(1);
  });

  it('other provider and customer 403, admin OK', async () => {
    const doc = await seed(provider.id, sub);
    const other = await makeProvider('Massage');
    const customer = await makeCustomer();
    const admin = await makeAdmin();
    expect((await api().patch(`${BASE}/${doc._id}`).set(...other.auth).send({ title: 'x' })).status).toBe(403);
    expect((await api().patch(`${BASE}/update/${doc._id}`).set(...customer.auth).send({ title: 'x' })).status).toBe(403);
    const res = await api().patch(`${BASE}/${doc._id}`).set(...admin.auth).send({ title: 'By admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('By admin');
    expect(res.body.data.provider.id).toBe(provider.id);
  });
});

describe('status', () => {
  it('toggles isActive (owner), hides from browse', async () => {
    const doc = await seed(provider.id, sub);
    const res = await api().patch(`${BASE}/${doc._id}/status`).set(...provider.auth).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: String(doc._id), isActive: false });
    expect((await api().get(BASE)).body.data).toHaveLength(0);

    const other = await makeProvider('Massage');
    expect((await api().patch(`${BASE}/${doc._id}/status`).set(...other.auth).send({ isActive: true })).status).toBe(403);
    expect((await api().patch(`${BASE}/${doc._id}/status`).set(...provider.auth).send({})).status).toBe(400);
  });
});

describe('delete', () => {
  it('soft delete; 409 with an open booking; 403 for others', async () => {
    const customer = await makeCustomer();
    const doc = await seed(provider.id, sub);
    const b = await booking(customer.id, String(doc._id), 'Active');

    const other = await makeProvider('Massage');
    expect((await api().delete(`${BASE}/${doc._id}`).set(...other.auth)).status).toBe(403);

    const blocked = await api().delete(`${BASE}/${doc._id}`).set(...provider.auth);
    expect(blocked.status).toBe(409);

    await Booking.updateOne({ _id: b._id }, { bookingStatus: 'Completed' });
    const ok = await api().delete(`${BASE}/delete/${doc._id}`).set(...provider.auth);
    expect(ok.status).toBe(200);
    const after: any = await Massage.findById(doc._id).lean();
    expect(after.isDeleted).toBe(true);
    expect((await api().get(`${BASE}/${doc._id}`)).status).toBe(404);
  });
});

describe('reviews', () => {
  it('403 without completed booking, 201 with one, 409 duplicate, listed', async () => {
    const customer = await makeCustomer();
    const doc = await seed(provider.id, sub);
    const body = { rating: 5, comment: 'Great massage' };

    expect((await api().post(`${BASE}/${doc._id}/review`).set(...customer.auth).send(body)).status).toBe(403);

    await booking(customer.id, String(doc._id), 'Completed');
    const ok = await api().post(`${BASE}/review/${doc._id}`).set(...customer.auth).send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.data.rating).toEqual({ average: 5, count: 1 });

    const dup = await api().post(`${BASE}/${doc._id}/review`).set(...customer.auth).send(body);
    expect(dup.status).toBe(409);

    expect((await api().post(`${BASE}/${doc._id}/review`).set(...provider.auth).send(body)).status).toBe(403);

    const list = await api().get(`${BASE}/${doc._id}/reviews`);
    expect(list.status).toBe(200);
    expect(list.body.data.reviews).toHaveLength(1);
    expect(list.body.data.reviews[0].user.id).toBe(customer.id);
    expect(list.body.meta.total).toBe(1);

    const card = (await api().get(BASE)).body.data[0];
    expect(card.rating).toEqual({ average: 5, count: 1 });
  });
});

describe('aliases', () => {
  it('old paths respond', async () => {
    const doc = await seed(provider.id, sub);
    expect((await api().get(`${BASE}/all`)).status).toBe(200);
    expect((await api().get(`${BASE}/my-all`).set(...provider.auth)).status).toBe(200);
    expect((await api().get(`${BASE}/${doc._id}`)).status).toBe(200);
    expect(Types.ObjectId.isValid(String(doc._id))).toBe(true);
  });
});
