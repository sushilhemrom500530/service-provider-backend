import { Booking } from '../booking/booking.model';
import { Transport } from './transport.model';
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

const BASE = '/api/v1/transport';

const validFields = (category: string) => ({
  category,
  title: 'Mercedes V-Class',
  serviceArea: 'Courchevel',
  amount: '120',
  seats: '7',
  mileage: '15 km/l',
  power: '190 hp',
  extraChargePerHour: '25',
  description: 'Airport transfer',
});

/** multipart create with a thumbnail */
const createViaApi = (user: TestUser, fields: Record<string, string>, fileField = 'file') => {
  const req = api().post(`${BASE}/`).set(...user.auth);
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  return req.attach(fileField, PNG, 'a.png');
};

/** direct DB insert (fast fixtures) */
const insert = (owner: string, category: string, extra: Record<string, any> = {}) =>
  Transport.create({
    owner,
    category,
    thumbnail: 'https://x/t.png',
    title: 'Van',
    personCount: 4,
    milage: '10',
    extraChargePerHours: 5,
    serviceArea: 'Val Thorens',
    amount: 100,
    ...extra,
  });

const booking = (user: string, product: string, bookingStatus: string) =>
  Booking.create({
    user,
    product,
    productModel: 'Transport',
    category: 'Transport',
    bookingStatus,
    totalPrice: 100,
  });

describe('Transport listings', () => {
  let provider: TestUser;
  let sub: string;

  beforeEach(async () => {
    provider = await makeProvider('Transport');
    sub = await makeSubCategory('Transport', 'Van');
  });

  /* ---------------- create ---------------- */
  describe('create', () => {
    it('201 with clean API names, owner from the token, detail shape', async () => {
      const other = oid();
      const res = await createViaApi(provider, { ...validFields(sub), owner: other, averageRating: '5' });
      expect(res.status).toBe(201);
      const d = res.body.data;
      expect(d).toMatchObject({
        category: 'Transport',
        subCategory: { id: sub, name: 'Van' },
        title: 'Mercedes V-Class',
        price: { amount: 120, unit: 'per_trip' },
        seats: 7,
        mileage: '15 km/l',
        power: '190 hp',
        extraChargePerHour: 25,
        rating: { average: 0, count: 0 },
        provider: { id: provider.id },
        isActive: true,
      });
      expect(d.thumbnail).toMatch(/^https:\/\/test-bucket/);
      const stored: any = await Transport.findById(d.id).lean();
      expect(String(stored.owner)).toBe(provider.id);
      expect(stored.averageRating).toBe(0);
      expect(stored).toMatchObject({ personCount: 7, milage: '15 km/l', extraChargePerHours: 25 });
      expect(d).not.toHaveProperty('insuranceFee');
      expect(d).not.toHaveProperty('maintenanceFee');
    });

    it('accepts the old field names on the old /create path', async () => {
      const { seats, mileage, extraChargePerHour, ...rest } = validFields(sub);
      const res = await createViaApi(provider, {
        ...rest,
        personCount: seats,
        milage: mileage,
        extraChargePerHours: extraChargePerHour,
      }).then(r => r);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ seats: 7, mileage: '15 km/l', extraChargePerHour: 25 });

      const alias = await api()
        .post(`${BASE}/create`)
        .set(...provider.auth)
        .field('category', sub)
        .field('title', 'B')
        .field('serviceArea', 'X')
        .field('amount', '50')
        .field('personCount', '3')
        .field('milage', '9')
        .field('extraChargePerHours', '0')
        .field('insuranceFee', '0')
        .field('maintainCharge', '0')
        .attach('file', PNG, 'a.png');
      expect(alias.status).toBe(201);
    });

    it('403 for customers, admins and other provider types', async () => {
      for (const u of [await makeCustomer(), await makeAdmin(), await makeProvider('Ski_Hire')]) {
        const res = await createViaApi(u, validFields(sub));
        expect(res.status).toBe(403);
      }
    });

    it('400 on validation errors (no 500s)', async () => {
      const cases: Record<string, string | undefined>[] = [
        { category: undefined },
        { category: 'not-an-id' },
        { category: oid() },
        { seats: '0' },
        { seats: undefined },
        { mileage: undefined },
        { extraChargePerHour: 'abc' },
        { amount: '0' },
        { serviceArea: '' },
      ];
      for (const c of cases) {
        const fields: Record<string, any> = { ...validFields(sub), ...c };
        for (const k of Object.keys(fields)) if (fields[k] === undefined) delete fields[k];
        const res = await createViaApi(provider, fields);
        expect([c, res.status]).toEqual([c, 400]);
      }
      expect(await Transport.countDocuments()).toBe(0);
    });

    it('400 without a thumbnail', async () => {
      const res = await api().post(`${BASE}/`).set(...provider.auth).send(validFields(sub));
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  /* ---------------- browse / my ---------------- */
  describe('browse', () => {
    it('public, filters, search, sort, pagination; inactive/deleted hidden', async () => {
      const sub2 = await makeSubCategory('Transport', 'Limousine');
      await insert(provider.id, sub, { title: 'Cheap van', amount: 50 });
      await insert(provider.id, sub2, { title: 'Luxury limo', amount: 300, serviceArea: 'Meribel' });
      await insert(provider.id, sub, { title: 'Hidden', isActive: false });
      await insert(provider.id, sub, { title: 'Gone', isDeleted: true });

      const all = await api().get(`${BASE}?sort=price_asc`);
      expect(all.status).toBe(200);
      expect(all.body.data.map((c: any) => c.title)).toEqual(['Cheap van', 'Luxury limo']);
      expect(all.body.meta).toEqual({ page: 1, limit: 10, total: 2, totalPages: 1 });
      const card = all.body.data[0];
      expect(Object.keys(card).sort()).toEqual(
        ['category', 'id', 'isActive', 'price', 'provider', 'rating', 'serviceArea', 'subCategory', 'thumbnail', 'title'].sort(),
      );
      expect(card.provider).toEqual({ id: provider.id, name: expect.any(String), photo: expect.any(String) });

      const q = async (qs: string) => (await api().get(`${BASE}/all?${qs}`)).body.data.map((c: any) => c.title);
      expect(await q('search=limo')).toEqual(['Luxury limo']);
      expect(await q('category=limousine')).toEqual(['Luxury limo']);
      expect(await q(`category=${sub}`)).toEqual(['Cheap van']);
      expect(await q('serviceArea=meri')).toEqual(['Luxury limo']);
      expect(await q('minPrice=100')).toEqual(['Luxury limo']);
      expect(await q('maxPrice=100')).toEqual(['Cheap van']);
      expect(await q('sort=price_desc')).toEqual(['Luxury limo', 'Cheap van']);
      expect(await q('search=(((')).toEqual([]);

      const page = await api().get(`${BASE}?limit=1&page=2&sort=price_asc`);
      expect(page.body.data.map((c: any) => c.title)).toEqual(['Luxury limo']);
      expect(page.body.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
    });

    it('/my returns own listings incl. inactive; status filter; aliases', async () => {
      const other = await makeProvider('Transport');
      await insert(provider.id, sub, { title: 'Mine active' });
      await insert(provider.id, sub, { title: 'Mine inactive', isActive: false });
      await insert(provider.id, sub, { title: 'Mine deleted', isDeleted: true });
      await insert(other.id, sub, { title: 'Theirs' });

      const res = await api().get(`${BASE}/my`).set(...provider.auth);
      expect(res.status).toBe(200);
      expect(res.body.data.map((c: any) => c.title).sort()).toEqual(['Mine active', 'Mine inactive']);
      const inactive = await api().get(`${BASE}/my-all?status=inactive`).set(...provider.auth);
      expect(inactive.body.data.map((c: any) => [c.title, c.isActive])).toEqual([['Mine inactive', false]]);

      expect((await api().get(`${BASE}/my`)).status).toBe(401);
      expect((await api().get(`${BASE}/my`).set(...(await makeCustomer()).auth)).status).toBe(403);
    });
  });

  /* ---------------- detail ---------------- */
  describe('detail', () => {
    it('whitelisted shape; old String personCount coerced; 404 when deleted', async () => {
      const t = await insert(provider.id, sub, {
        reviews: [{ userId: oid(), rating: 4, comment: 'ok' }],
        averageRating: 4,
      });
      // simulate an old document that stored personCount as a String
      await Transport.collection.updateOne({ _id: t._id }, { $set: { personCount: '5' }, $unset: { reviewCount: '' } });

      const res = await api().get(`${BASE}/${t._id}`);
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.seats).toBe(5);
      expect(d.rating).toEqual({ average: 4, count: 1 });
      expect(d).not.toHaveProperty('__v');
      expect(d).not.toHaveProperty('reviews');
      expect(d).not.toHaveProperty('refunds');
      expect(d).not.toHaveProperty('owner');
      expect(d).not.toHaveProperty('personCount');
      expect(d).not.toHaveProperty('milage');
      expect(JSON.stringify(d)).not.toContain('@test.dev');
      expect(JSON.stringify(d)).not.toContain('availableQty');
      expect(Object.keys(d)).toEqual(
        expect.arrayContaining(['description', 'createdAt', 'mileage', 'power', 'extraChargePerHour']),
      );
      expect(d).not.toHaveProperty('insuranceFee');
      expect(d).not.toHaveProperty('maintenanceFee');

      await Transport.updateOne({ _id: t._id }, { isDeleted: true });
      expect((await api().get(`${BASE}/${t._id}`)).status).toBe(404);
      expect((await api().get(`${BASE}/not-an-id`)).status).toBe(400);
    });
  });

  /* ---------------- update ---------------- */
  describe('update', () => {
    it('owner OK, other provider 403, customer 403, admin OK, mass-assignment ignored', async () => {
      const t = await insert(provider.id, sub);
      const intruder = await makeProvider('Transport');
      const customer = await makeCustomer();
      const admin = await makeAdmin();

      const own = await api()
        .patch(`${BASE}/${t._id}`)
        .set(...provider.auth)
        .send({ title: 'New title', seats: 8, owner: intruder.id, averageRating: 5, reviewCount: 99, isDeleted: true });
      expect(own.status).toBe(200);
      expect(own.body.data).toMatchObject({ title: 'New title', seats: 8 });
      const stored: any = await Transport.findById(t._id).lean();
      expect(String(stored.owner)).toBe(provider.id);
      expect(stored.averageRating).toBe(0);
      expect(stored.reviewCount).toBe(0);
      expect(stored.isDeleted).toBe(false);
      expect(stored.amount).toBe(100); // untouched

      expect((await api().patch(`${BASE}/${t._id}`).set(...intruder.auth).send({ title: 'x' })).status).toBe(403);
      expect((await api().patch(`${BASE}/update/${t._id}`).set(...customer.auth).send({ title: 'x' })).status).toBe(403);

      const byAdmin = await api()
        .patch(`${BASE}/update/${t._id}`)
        .set(...admin.auth)
        .field('milage', '22')
        .attach('file', PNG, 'b.png');
      expect(byAdmin.status).toBe(200);
      expect(byAdmin.body.data.mileage).toBe('22');
      expect(byAdmin.body.data.thumbnail).toMatch(/^https:\/\/test-bucket/);
      expect((await Transport.findById(t._id).lean())!.title).toBe('New title');
    });

    it('400 on invalid values and bad category', async () => {
      const t = await insert(provider.id, sub);
      for (const body of [{ seats: 0 }, { amount: -5 }, { extraChargePerHour: 'x' }, { category: oid() }]) {
        const res = await api().patch(`${BASE}/${t._id}`).set(...provider.auth).send(body);
        expect([body, res.status]).toEqual([body, 400]);
      }
    });
  });

  /* ---------------- status / delete ---------------- */
  it('status toggle hides the listing from browse', async () => {
    const t = await insert(provider.id, sub);
    const off = await api().patch(`${BASE}/${t._id}/status`).set(...provider.auth).send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.data).toEqual({ id: String(t._id), isActive: false });
    expect((await api().get(BASE)).body.data).toHaveLength(0);
    expect((await api().patch(`${BASE}/${t._id}/status`).set(...provider.auth).send({ isActive: 'maybe' })).status).toBe(400);
    const other = await makeProvider('Transport');
    expect((await api().patch(`${BASE}/${t._id}/status`).set(...other.auth).send({ isActive: true })).status).toBe(403);
  });

  it('delete is soft, 409 with an open booking, 403 for others', async () => {
    const t = await insert(provider.id, sub);
    const customer = await makeCustomer();
    const other = await makeProvider('Transport');
    expect((await api().delete(`${BASE}/${t._id}`).set(...other.auth)).status).toBe(403);

    const b = await booking(customer.id, String(t._id), 'Active');
    expect((await api().delete(`${BASE}/delete/${t._id}`).set(...provider.auth)).status).toBe(409);

    await Booking.updateOne({ _id: b._id }, { bookingStatus: 'Completed' });
    const res = await api().delete(`${BASE}/${t._id}`).set(...provider.auth);
    expect(res.status).toBe(200);
    const stored: any = await Transport.findById(t._id).lean();
    expect(stored).toMatchObject({ isDeleted: true, isActive: false });
    expect((await api().get(`${BASE}/${t._id}`)).status).toBe(404);
  });

  /* ---------------- reviews ---------------- */
  it('review: 403 without a completed booking, 201 with one, 409 duplicate; listed via /:id/reviews', async () => {
    const t = await insert(provider.id, sub);
    const customer = await makeCustomer();

    const denied = await api().post(`${BASE}/${t._id}/review`).set(...customer.auth).send({ rating: 5, comment: 'Great' });
    expect(denied.status).toBe(403);

    await booking(customer.id, String(t._id), 'Completed');
    const ok = await api().post(`${BASE}/review/${t._id}`).set(...customer.auth).send({ rating: 5, comment: 'Great' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.rating).toEqual({ average: 5, count: 1 });

    const dup = await api().post(`${BASE}/${t._id}/review`).set(...customer.auth).send({ rating: 4, comment: 'Again' });
    expect(dup.status).toBe(409);

    expect((await api().post(`${BASE}/${t._id}/review`).set(...provider.auth).send({ rating: 5, comment: 'x' })).status).toBe(403);

    const list = await api().get(`${BASE}/${t._id}/reviews`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ rating: 5, comment: 'Great', user: { id: customer.id } });
    expect(JSON.stringify(list.body)).not.toContain('@test.dev');

    const card = (await api().get(BASE)).body.data[0];
    expect(card.rating).toEqual({ average: 5, count: 1 });
  });
});

/* ------------------------------------------------------------------ */
/* All-inclusive price: no insurance / maintenance fee (17 Nov 2026)   */
/* ------------------------------------------------------------------ */
describe('Transport: all-inclusive price (insurance / maintenance fees removed)', () => {
  let provider: TestUser;
  let sub: string;

  beforeEach(async () => {
    provider = await makeProvider('Transport');
    sub = await makeSubCategory('Transport', 'Van');
  });

  it('create works without the fees (no more "insuranceFee is required")', async () => {
    const res = await createViaApi(provider, validFields(sub));
    expect(res.status).toBe(201);
    const stored: any = await Transport.findById(res.body.data.id).lean();
    expect(stored).not.toHaveProperty('insuranceFee');
    expect(stored).not.toHaveProperty('maintainCharge');
  });

  it('older apps still sending the fees (new or old names, even invalid values): accepted, ignored, never stored', async () => {
    const olderApps: Record<string, string>[] = [
      { insuranceFee: '0', maintenanceFee: '0' },
      { insuranceFee: '20', maintainCharge: '10' },
      { insuranceFee: 'abc', maintenanceFee: '-1' },
    ];
    for (const extra of olderApps) {
      const res = await createViaApi(provider, { ...validFields(sub), ...extra });
      expect([extra, res.status]).toEqual([extra, 201]);
      expect(res.body.data).not.toHaveProperty('insuranceFee');
      expect(res.body.data).not.toHaveProperty('maintenanceFee');
      const stored: any = await Transport.findById(res.body.data.id).lean();
      expect(stored.insuranceFee).toBeUndefined();
      expect(stored.maintainCharge).toBeUndefined();
    }
  });

  it('edit ignores the fees; an old stored value is never returned', async () => {
    const t = await insert(provider.id, sub);
    // a listing saved before the change still holds the old values
    await Transport.collection.updateOne({ _id: t._id }, { $set: { insuranceFee: 20, maintainCharge: 10 } });
    const res = await api().patch(`${BASE}/${t._id}`).set(...provider.auth)
      .send({ title: 'Edited', insuranceFee: 50, maintenanceFee: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('insuranceFee');
    expect(res.body.data).not.toHaveProperty('maintenanceFee');
    const stored: any = await Transport.collection.findOne({ _id: t._id });
    expect(stored).toMatchObject({ title: 'Edited', insuranceFee: 20, maintainCharge: 10 }); // untouched until the cleanup script

    const pub = await api().get(`${BASE}/${t._id}`);
    expect(pub.body.data).not.toHaveProperty('insuranceFee');
    expect(pub.body.data).not.toHaveProperty('maintenanceFee');
    const list = await api().get(`${BASE}`);
    expect(JSON.stringify(list.body.data)).not.toMatch(/insuranceFee|maintenanceFee|maintainCharge/);
  });

  it('the customer pays the trip price only, even if an old listing still holds fees', async () => {
    const t = await insert(provider.id, sub, { amount: 150 });
    await Transport.collection.updateOne({ _id: t._id }, { $set: { insuranceFee: 20, maintainCharge: 10 } });
    const customer = await makeCustomer();
    const start = new Date(Date.now() + 3 * 86400000);
    const intent = await api().post('/api/v1/booking/intent').set(...customer.auth).send({
      productId: String(t._id),
      startDateAndTime: start.toISOString(),
      endDateAndTime: new Date(start.getTime() + 2 * 3600000).toISOString(),
      personCount: 2,
    });
    expect(intent.status).toBe(200);
    expect(intent.body.data.amount).toBe(150);
    expect(JSON.stringify(intent.body.data)).not.toMatch(/insurance|maintenance|maintainCharge/i);
  });
});
