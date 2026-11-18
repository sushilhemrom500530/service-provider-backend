import { api, makeAdmin, makeCustomer, makeProvider, oid, PNG, TestUser } from '../../test/factories';
import { Booking } from '../booking/booking.model';
import { SkiPass } from './skipass.model';
import { USER_UPLOADS_FOLDER } from './skipass.constant';
import fs from 'fs';
import path from 'path';

const BASE = '/api/v1/ski-pass';

const SERVICES = [
  { title: 'Lift access', description: 'All lifts, all day' },
  { title: 'Locker', description: 'One locker' },
];

/** multipart create, the way the app sends it today */
const createPass = async (owner: TestUser, over: Record<string, any> = {}) => {
  const fields: Record<string, any> = {
    title: 'Day pass',
    skiPassType: 'Basic',
    services: JSON.stringify(SERVICES),
    serviceArea: 'Courchevel',
    amount: '45',
    description: 'One day, all lifts',
    ...over,
  };
  let req = api().post(`${BASE}/create`).set(...owner.auth);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, String(v));
  const res = await req.attach('file', PNG, 'a.png');
  expect(res.status).toBe(201);
  return res.body.data;
};

const booking = (user: string, product: string, bookingStatus: string) =>
  Booking.create({
    user,
    product,
    productModel: 'SkiPass',
    category: 'Ski_Pass',
    bookingStatus,
    totalPrice: 45,
    personCount: 1,
    date: new Date(),
  });

// multer writes uploads to disk; S3 (which removes them) is mocked in tests
const startedAt = Date.now();
afterAll(() => {
  const dir = path.resolve(USER_UPLOADS_FOLDER);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const st = fs.statSync(file);
    if (st.isFile() && st.size === PNG.length && st.mtimeMs >= startedAt - 1000) fs.unlinkSync(file);
  }
});

describe('Ski Pass listings', () => {
  let provider: TestUser;

  beforeEach(async () => {
    provider = await makeProvider('Ski_Pass');
  });

  /* ---------------- create ---------------- */
  describe('create', () => {
    it('creates with multipart + thumbnail, owner from the token (201 + detail)', async () => {
      const other = oid();
      const data = await createPass(provider, { owner: other, averageRating: 5, reviewCount: 99 });
      expect(data).toMatchObject({
        category: 'Ski_Pass',
        subCategory: null,
        title: 'Day pass',
        passType: 'Basic',
        serviceArea: 'Courchevel',
        price: { amount: 45, unit: 'per_person' },
        rating: { average: 0, count: 0 },
        provider: { id: provider.id },
        isActive: true,
        services: SERVICES,
      });
      expect(data.thumbnail).toMatch(/^https:\/\/test-bucket/);
      const doc: any = await SkiPass.findById(data.id).lean();
      expect(String(doc.owner)).toBe(provider.id);
      expect(doc.averageRating).toBe(0);
      expect(doc.reviewCount).toBe(0);
    });

    it('accepts JSON + clean names (passType, price) on POST /', async () => {
      // JSON body has no file -> thumbnail required (400)
      const res = await api()
        .post(BASE)
        .set(...provider.auth)
        .send({ title: 'x', passType: 'vip', services: SERVICES, serviceArea: 'a', price: 10, description: 'd' });
      expect(res.status).toBe(400);

      const ok = await api()
        .post(BASE)
        .set(...provider.auth)
        .field('title', 'Vip pass')
        .field('passType', 'vip')
        .field('services', JSON.stringify(SERVICES))
        .field('serviceArea', 'Val Thorens')
        .field('price', '120')
        .field('description', 'VIP')
        .attach('thumbnail', PNG, 'a.png');
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({ passType: 'Vip', price: { amount: 120 } });
    });

    it('400 on validation errors', async () => {
      const res = await api()
        .post(`${BASE}/create`)
        .set(...provider.auth)
        .field('title', 'x')
        .field('skiPassType', 'Gold')
        .field('services', '[]')
        .field('amount', 'abc')
        .attach('file', PNG, 'a.png');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(await SkiPass.countDocuments()).toBe(0);
    });

    it('400 on bad services JSON', async () => {
      const res = await api()
        .post(`${BASE}/create`)
        .set(...provider.auth)
        .field('services', '[{bad')
        .attach('file', PNG, 'a.png');
      expect(res.status).toBe(400);
    });

    it('403 for customers, admins and other provider types', async () => {
      const customer = await makeCustomer();
      const admin = await makeAdmin();
      const hire = await makeProvider('Ski_Hire');
      for (const u of [customer, admin, hire]) {
        const res = await api()
          .post(`${BASE}/create`)
          .set(...u.auth)
          .field('title', 'x')
          .field('skiPassType', 'Basic')
          .field('services', JSON.stringify(SERVICES))
          .field('serviceArea', 'a')
          .field('amount', '10')
          .field('description', 'd')
          .attach('file', PNG, 'a.png');
        expect(res.status).toBe(403);
      }
    });
  });

  /* ---------------- browse ---------------- */
  describe('browse', () => {
    it('is public, filters, searches, sorts and paginates; hides inactive/deleted', async () => {
      const a = await createPass(provider, { title: 'Morning pass', amount: '30', skiPassType: 'Basic' });
      const b = await createPass(provider, { title: 'Premium week', amount: '300', skiPassType: 'Premium', serviceArea: 'Tignes' });
      const c = await createPass(provider, { title: 'Hidden', amount: '50' });
      const d = await createPass(provider, { title: 'Gone', amount: '60' });
      await SkiPass.updateOne({ _id: c.id }, { isActive: false });
      await SkiPass.updateOne({ _id: d.id }, { isDeleted: true });

      const all = await api().get(BASE);
      expect(all.status).toBe(200);
      expect(all.body.meta).toEqual({ page: 1, limit: 10, total: 2, totalPages: 1 });
      expect(all.body.data.map((x: any) => x.id).sort()).toEqual([a.id, b.id].sort());
      const card = all.body.data[0];
      expect(card).not.toHaveProperty('description');
      expect(card).not.toHaveProperty('reviews');
      expect(card).not.toHaveProperty('__v');

      const byType = await api().get(`${BASE}?passType=premium`);
      expect(byType.body.data.map((x: any) => x.id)).toEqual([b.id]);

      const unknownType = await api().get(`${BASE}?passType=gold`);
      expect(unknownType.body.data).toHaveLength(0);

      const search = await api().get(`${BASE}/all?search=morn`);
      expect(search.body.data.map((x: any) => x.id)).toEqual([a.id]);

      const area = await api().get(`${BASE}?serviceArea=tign`);
      expect(area.body.data.map((x: any) => x.id)).toEqual([b.id]);

      const price = await api().get(`${BASE}?minPrice=100&maxPrice=500`);
      expect(price.body.data.map((x: any) => x.id)).toEqual([b.id]);

      const sorted = await api().get(`${BASE}?sort=price_desc`);
      expect(sorted.body.data.map((x: any) => x.id)).toEqual([b.id, a.id]);

      const page2 = await api().get(`${BASE}?limit=1&page=2&sort=price_asc`);
      expect(page2.body.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
      expect(page2.body.data.map((x: any) => x.id)).toEqual([b.id]);

      // category is ignored (ski passes have no sub-categories)
      const cat = await api().get(`${BASE}?category=anything`);
      expect(cat.body.meta.total).toBe(2);

      // regex input is escaped
      const regex = await api().get(`${BASE}?search=(((`);
      expect(regex.status).toBe(200);
    });

    it('/my and /my-all return own listings incl. inactive, not deleted', async () => {
      const other = await makeProvider('Ski_Pass');
      const mine = await createPass(provider);
      const inactive = await createPass(provider, { title: 'Off' });
      const deleted = await createPass(provider, { title: 'Del' });
      await createPass(other, { title: 'Theirs' });
      await SkiPass.updateOne({ _id: inactive.id }, { isActive: false });
      await SkiPass.updateOne({ _id: deleted.id }, { isDeleted: true });

      const res = await api().get(`${BASE}/my`).set(...provider.auth);
      expect(res.status).toBe(200);
      expect(res.body.data.map((x: any) => x.id).sort()).toEqual([mine.id, inactive.id].sort());

      const onlyInactive = await api().get(`${BASE}/my-all?status=inactive`).set(...provider.auth);
      expect(onlyInactive.body.data.map((x: any) => x.id)).toEqual([inactive.id]);
      expect(onlyInactive.body.data[0].isActive).toBe(false);

      const admin = await makeAdmin();
      const adminAll = await api().get(`${BASE}/my`).set(...admin.auth);
      expect(adminAll.body.meta.total).toBe(3);

      const customer = await makeCustomer();
      expect((await api().get(`${BASE}/my`).set(...customer.auth)).status).toBe(403);
      expect((await api().get(`${BASE}/my`)).status).toBe(401);
    });
  });

  /* ---------------- detail ---------------- */
  describe('detail', () => {
    it('returns a whitelisted detail, no PII, no reviews/__v', async () => {
      const created = await createPass(provider);
      const customer = await makeCustomer();
      await booking(customer.id, created.id, 'Completed');
      await api().post(`${BASE}/${created.id}/review`).set(...customer.auth).send({ rating: 4, comment: 'Nice' });

      const res = await api().get(`${BASE}/${created.id}`);
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(Object.keys(d).sort()).toEqual(
        [
          'id', 'category', 'subCategory', 'title', 'thumbnail', 'serviceArea', 'passType', 'price',
          'rating', 'provider', 'isActive', 'description', 'services', 'maxPeoplePerBooking', 'createdAt', 'updatedAt',
        ].sort(),
      );
      expect(d.maxPeoplePerBooking).toBe(10);
      expect(d.rating).toEqual({ average: 4, count: 1 });
      expect(d.provider).toEqual({ id: provider.id, name: provider.doc.fullName, photo: expect.any(String) });
      const json = JSON.stringify(res.body);
      expect(json).not.toContain('__v');
      expect(json).not.toContain('"reviews"');
      expect(json).not.toContain('refunds');
      expect(json).not.toContain('availableQty');
      expect(json).not.toContain(provider.doc.email);
      expect(json).not.toContain(customer.doc.email);
      expect(json).not.toContain('phoneNumber');
    });

    it('404 when missing or deleted, 400 for a bad id', async () => {
      const created = await createPass(provider);
      await SkiPass.updateOne({ _id: created.id }, { isDeleted: true });
      expect((await api().get(`${BASE}/${created.id}`)).status).toBe(404);
      expect((await api().get(`${BASE}/${oid()}`)).status).toBe(404);
      expect((await api().get(`${BASE}/not-an-id`)).status).toBe(400);
    });
  });

  /* ---------------- update ---------------- */
  describe('update', () => {
    it('owner can update; mass assignment is ignored', async () => {
      const created = await createPass(provider);
      const res = await api()
        .patch(`${BASE}/${created.id}`)
        .set(...provider.auth)
        .send({
          title: 'New title',
          price: 55,
          passType: 'Premium',
          owner: oid(),
          averageRating: 5,
          reviewCount: 10,
          isDeleted: true,
          reviews: [{ userId: oid(), rating: 5, comment: 'x' }],
        });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ title: 'New title', price: { amount: 55 }, passType: 'Premium' });
      const doc: any = await SkiPass.findById(created.id).lean();
      expect(String(doc.owner)).toBe(provider.id);
      expect(doc.averageRating).toBe(0);
      expect(doc.reviewCount).toBe(0);
      expect(doc.isDeleted).toBe(false);
      expect(doc.reviews).toHaveLength(0);
      expect(doc.services).toHaveLength(2); // not sent -> kept
    });

    it('multipart update via /update/:id replaces the thumbnail and services', async () => {
      const created = await createPass(provider);
      const res = await api()
        .patch(`${BASE}/update/${created.id}`)
        .set(...provider.auth)
        .field('services', JSON.stringify([{ title: 'Only', description: 'one' }]))
        .field('amount', '70')
        .attach('file', PNG, 'b.png');
      expect(res.status).toBe(200);
      expect(res.body.data.thumbnail).not.toBe(created.thumbnail);
      expect(res.body.data.services).toEqual([{ title: 'Only', description: 'one' }]);
      expect(res.body.data.price.amount).toBe(70);
    });

    it('400 on invalid values, no change', async () => {
      const created = await createPass(provider);
      const res = await api()
        .patch(`${BASE}/${created.id}`)
        .set(...provider.auth)
        .send({ amount: 'abc', services: [] });
      expect(res.status).toBe(400);
      const doc: any = await SkiPass.findById(created.id).lean();
      expect(doc.amount).toBe(45);
    });

    it('other provider 403, customer 403, admin OK', async () => {
      const created = await createPass(provider);
      const other = await makeProvider('Ski_Pass');
      const customer = await makeCustomer();
      const admin = await makeAdmin();
      expect((await api().patch(`${BASE}/${created.id}`).set(...other.auth).send({ title: 'x' })).status).toBe(403);
      expect((await api().patch(`${BASE}/update/${created.id}`).set(...customer.auth).send({ title: 'x' })).status).toBe(403);
      const res = await api().patch(`${BASE}/${created.id}`).set(...admin.auth).send({ title: 'By admin' });
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('By admin');
      expect(res.body.data.provider.id).toBe(provider.id);
    });
  });

  /* ---------------- status ---------------- */
  it('status toggle hides the listing from browse', async () => {
    const created = await createPass(provider);
    const other = await makeProvider('Ski_Pass');
    expect((await api().patch(`${BASE}/${created.id}/status`).set(...other.auth).send({ isActive: false })).status).toBe(403);
    expect((await api().patch(`${BASE}/${created.id}/status`).set(...provider.auth).send({ isActive: 'nope' })).status).toBe(400);

    const off = await api().patch(`${BASE}/${created.id}/status`).set(...provider.auth).send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.data).toEqual({ id: created.id, isActive: false });
    expect((await api().get(BASE)).body.meta.total).toBe(0);

    const admin = await makeAdmin();
    const on = await api().patch(`${BASE}/${created.id}/status`).set(...admin.auth).send({ isActive: true });
    expect(on.body.data.isActive).toBe(true);
    expect((await api().get(BASE)).body.meta.total).toBe(1);
  });

  /* ---------------- delete ---------------- */
  describe('delete', () => {
    it('soft deletes; 409 with an open booking; owner or admin only', async () => {
      const created = await createPass(provider);
      const customer = await makeCustomer();
      const other = await makeProvider('Ski_Pass');
      const b = await booking(customer.id, created.id, 'Active');

      expect((await api().delete(`${BASE}/${created.id}`).set(...other.auth)).status).toBe(403);
      expect((await api().delete(`${BASE}/${created.id}`).set(...customer.auth)).status).toBe(403);
      expect((await api().delete(`${BASE}/${created.id}`).set(...provider.auth)).status).toBe(409);

      await Booking.updateOne({ _id: b._id }, { bookingStatus: 'Completed' });
      const res = await api().delete(`${BASE}/delete/${created.id}`).set(...provider.auth);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ id: created.id, deleted: true });

      const doc: any = await SkiPass.findById(created.id).lean();
      expect(doc).toBeTruthy();
      expect(doc.isDeleted).toBe(true);
      expect((await api().get(`${BASE}/${created.id}`)).status).toBe(404);
      expect((await api().delete(`${BASE}/${created.id}`).set(...provider.auth)).status).toBe(404);
    });

    it('admin can delete', async () => {
      const created = await createPass(provider);
      const admin = await makeAdmin();
      expect((await api().delete(`${BASE}/${created.id}`).set(...admin.auth)).status).toBe(200);
    });
  });

  /* ---------------- reviews ---------------- */
  describe('reviews', () => {
    it('403 without a completed booking, 201 with one, 409 duplicate; listed publicly', async () => {
      const created = await createPass(provider);
      const customer = await makeCustomer();

      const noBooking = await api().post(`${BASE}/review/${created.id}`).set(...customer.auth).send({ rating: 5, comment: 'Great' });
      expect(noBooking.status).toBe(403);

      await booking(customer.id, created.id, 'Completed');
      const ok = await api().post(`${BASE}/review/${created.id}`).set(...customer.auth).send({ rating: 5, comment: 'Great' });
      expect(ok.status).toBe(201);
      expect(ok.body.data.rating).toEqual({ average: 5, count: 1 });

      const dup = await api().post(`${BASE}/${created.id}/review`).set(...customer.auth).send({ rating: 3, comment: 'Again' });
      expect(dup.status).toBe(409);

      expect((await api().post(`${BASE}/${created.id}/review`).set(...provider.auth).send({ rating: 3, comment: 'Self' })).status).toBe(403);

      const list = await api().get(`${BASE}/${created.id}/reviews`);
      expect(list.status).toBe(200);
      expect(list.body.meta.total).toBe(1);
      expect(list.body.data[0]).toMatchObject({ rating: 5, comment: 'Great', user: { id: customer.id } });
      expect(JSON.stringify(list.body)).not.toContain(customer.doc.email);

      const card = (await api().get(BASE)).body.data[0];
      expect(card.rating).toEqual({ average: 5, count: 1 });
    });

    it('400 on an invalid rating', async () => {
      const created = await createPass(provider);
      const customer = await makeCustomer();
      await booking(customer.id, created.id, 'Completed');
      const res = await api().post(`${BASE}/${created.id}/review`).set(...customer.auth).send({ rating: 9, comment: 'x' });
      expect(res.status).toBe(400);
    });
  });
});
