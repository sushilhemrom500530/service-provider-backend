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
import { Restaurant } from './restaurant.model';
import { RestaurantSetting } from './restaurantSetting.model';
import { Booking } from '../booking/booking.model';
import { getRestaurantServiceFee, isOpenAt } from './restaurant.service';

const BASE = '/api/v1/restaurant';
const PHOTO = 'https://x/seat.png';

const body = (category: string, extra: Record<string, any> = {}) => ({
  title: 'Le Chalet',
  description: 'Fondue and views',
  category,
  serviceArea: 'Courchevel',
  foodType: 'Savoyard',
  openTime: '10:00 AM',
  closeTime: '11:00 PM',
  thumbnail: 'https://x/thumb.png',
  seats: [
    { type: 'VIP', price: 80, quantity: 10, photo: PHOTO, description: 'Window' },
    { type: 'Normal', price: 40, quantity: 30, photo: PHOTO },
  ],
  slots: [
    { startTime: '12:00 PM', endTime: '2:00 PM' },
    { startTime: '7:00 PM', endTime: '9:00 PM' },
  ],
  ...extra,
});

const setup = async () => {
  const provider = await makeProvider('Restaurant');
  const category = await makeSubCategory('Restaurant', 'Fine dining');
  return { provider, category };
};

const createOne = async (provider: TestUser, category: string, extra: Record<string, any> = {}) => {
  const res = await api().post(BASE).set(...provider.auth).send(body(category, extra));
  expect(res.status).toBe(201);
  return res.body.data;
};

const booking = (product: string, user: string, extra: Record<string, any> = {}) =>
  Booking.create({
    user,
    product,
    productModel: 'Restaurant',
    category: 'Restaurant',
    totalPrice: 100,
    bookingStatus: 'Active',
    ...extra,
  });

describe('Restaurant listings', () => {
  describe('create', () => {
    it('201 with a clean detail, owner from the token', async () => {
      const { provider, category } = await setup();
      const other = oid();
      const res = await api()
        .post(BASE)
        .set(...provider.auth)
        .send(body(category, { owner: other, averageRating: 5 }));
      expect(res.status).toBe(201);
      const d = res.body.data;
      expect(d).toMatchObject({
        category: 'Restaurant',
        title: 'Le Chalet',
        description: 'Fondue and views',
        subCategory: { id: category, name: 'Fine dining' },
        price: { amount: 40, unit: 'per_seat' },
        rating: { average: 0, count: 0 },
        provider: { id: provider.id },
        isActive: true,
        openTime: '10:00 AM',
        closeTime: '11:00 PM',
        serviceFee: 0,
      });
      expect(typeof d.isOpenNow).toBe('boolean');
      expect(d.seats).toHaveLength(2);
      expect(d.seats[0]).toEqual({
        id: expect.any(String),
        type: 'VIP',
        photo: PHOTO,
        price: 80,
        quantity: 10,
        description: 'Window',
      });
      expect(d.slots[0]).toEqual({ id: expect.any(String), startTime: '12:00 PM', endTime: '2:00 PM' });
      const doc: any = await Restaurant.findById(d.id).lean();
      expect(String(doc.owner)).toBe(provider.id);
      expect(doc.averageRating).toBe(0);
      expect(doc.items[0].availableQty).toBe(10);
      expect(doc.availableSlots).toHaveLength(2);
    });

    it('accepts one seat type and the old `items` shape', async () => {
      const { provider, category } = await setup();
      const res = await api()
        .post(`${BASE}/create`)
        .set(...provider.auth)
        .send(
          body(category, {
            seats: undefined,
            items: [{ seat: 'Normal', price: '25', totalQty: '12', photo: PHOTO }],
          }),
        );
      expect(res.status).toBe(201);
      expect(res.body.data.seats).toEqual([
        expect.objectContaining({ type: 'Normal', price: 25, quantity: 12 }),
      ]);
    });

    it('403 for a customer or another provider type', async () => {
      const { category } = await setup();
      const customer = await makeCustomer();
      const skiHire = await makeProvider('Ski_Hire');
      for (const u of [customer, skiHire]) {
        const res = await api().post(BASE).set(...u.auth).send(body(category));
        expect(res.status).toBe(403);
      }
    });

    it('400 on invalid input', async () => {
      const { provider, category } = await setup();
      const cases = [
        { title: '' },
        { seats: [] },
        { seats: [{ type: 'VIP', price: 10, quantity: 1, photo: PHOTO }, { type: 'vip', price: 10, quantity: 1, photo: PHOTO }] },
        { seats: [{ type: 'Gold', price: 10, quantity: 1, photo: PHOTO }] },
        { seats: [{ type: 'VIP', price: 'abc', quantity: 1, photo: PHOTO }] },
        { slots: [] },
        { openTime: 'soon' },
        { slots: [{ startTime: '10:30 PM', endTime: '12:30 PM' }] }, // assertValidSlots
        { slots: [{ startTime: '8:00 AM', endTime: '9:00 AM' }] }, // outside opening hours
        { category: oid() },
        { seats: [{ type: 'VIP', price: 10, quantity: 1 }] }, // no photo
      ];
      for (const extra of cases) {
        const res = await api().post(BASE).set(...provider.auth).send(body(category, extra));
        expect([res.status, extra]).toEqual([400, extra]);
        expect(res.body.success).toBe(false);
      }
    });

    it('400 on a bad JSON string in multipart', async () => {
      const { provider, category } = await setup();
      const res = await api()
        .post(BASE)
        .set(...provider.auth)
        .field('title', 'X')
        .field('category', category)
        .field('items', '[{bad')
        .attach('thumbnail', PNG, 'a.png');
      expect(res.status).toBe(400);
    });

    it('multipart create with thumbnail and seat photos (files[i])', async () => {
      const { provider, category } = await setup();
      const res = await api()
        .post(`${BASE}/create`)
        .set(...provider.auth)
        .field('title', 'Multipart')
        .field('category', category)
        .field('serviceArea', 'Val Thorens')
        .field('openTime', '10:00 AM')
        .field('closeTime', '11:00 PM')
        .field('description', 'desc')
        .field('items', JSON.stringify([{ seat: 'VIP', price: 50, totalQty: 4 }, { seat: 'Normal', price: 20, totalQty: 8 }]))
        .field('slots', JSON.stringify([{ startTime: '12:00 PM', endTime: '2:00 PM' }]))
        .attach('thumbnail', PNG, 'thumb.png')
        .attach('files[1]', PNG, 'normal.png')
        .attach('files[0]', PNG, 'vip.png');
      expect(res.status).toBe(201);
      const d = res.body.data;
      expect(d.thumbnail).toMatch(/thumb\.png$/);
      expect(d.seats.find((s: any) => s.type === 'VIP').photo).toMatch(/vip\.png$/);
      expect(d.seats.find((s: any) => s.type === 'Normal').photo).toMatch(/normal\.png$/);
      expect(d.description).toBe('desc');
    });
  });

  describe('browse', () => {
    it('public list with filters, search, meta; hides inactive and deleted', async () => {
      const { provider, category } = await setup();
      const a = await createOne(provider, category, { title: 'Alpine Grill' });
      await createOne(provider, category, {
        title: 'Cheap Eats',
        seats: [{ type: 'Normal', price: 10, quantity: 5, photo: PHOTO }],
      });
      const hidden = await createOne(provider, category, { title: 'Hidden' });
      const gone = await createOne(provider, category, { title: 'Gone' });
      await Restaurant.updateOne({ _id: hidden.id }, { isActive: false });
      await Restaurant.updateOne({ _id: gone.id }, { isDeleted: true });

      const all = await api().get(BASE);
      expect(all.status).toBe(200);
      expect(all.body.meta).toEqual({ page: 1, limit: 10, total: 2, totalPages: 1 });
      expect(all.body.data.map((c: any) => c.title).sort()).toEqual(['Alpine Grill', 'Cheap Eats']);
      // a provider filter cannot widen the public list
      expect((await api().get(`${BASE}?status=inactive`)).body.meta.total).toBe(2);

      const search = await api().get(`${BASE}/all?search=alpine`);
      expect(search.body.data.map((c: any) => c.id)).toEqual([a.id]);

      const cheap = await api().get(`${BASE}?maxPrice=15`);
      expect(cheap.body.data.map((c: any) => c.title)).toEqual(['Cheap Eats']);

      const between = await api().get(`${BASE}?minPrice=50&maxPrice=60`);
      expect(between.body.data).toHaveLength(0); // no single seat in 50..60

      const byCat = await api().get(`${BASE}?category=fine`);
      expect(byCat.body.meta.total).toBe(2);
      expect((await api().get(`${BASE}?category=nope`)).body.meta.total).toBe(0);

      const sorted = await api().get(`${BASE}?sort=price_asc&limit=1&page=2`);
      expect(sorted.body.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
      expect(sorted.body.data[0].title).toBe('Alpine Grill');

      const card = all.body.data[0];
      expect(Object.keys(card).sort()).toEqual(
        ['category', 'id', 'isActive', 'price', 'provider', 'rating', 'serviceArea', 'subCategory', 'thumbnail', 'title'].sort(),
      );
    });

    it('/my lists own listings incl. inactive; admin sees all', async () => {
      const { provider, category } = await setup();
      const other = await makeProvider('Restaurant');
      const mine = await createOne(provider, category);
      await createOne(other, category);
      await api().patch(`${BASE}/${mine.id}/status`).set(...provider.auth).send({ isActive: false });

      const res = await api().get(`${BASE}/my`).set(...provider.auth);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ id: mine.id, isActive: false });
      const inactive = await api().get(`${BASE}/my-all?status=active`).set(...provider.auth);
      expect(inactive.body.data).toHaveLength(0);

      const admin = await makeAdmin();
      expect((await api().get(`${BASE}/my`).set(...admin.auth)).body.meta.total).toBe(2);
      expect((await api().get(`${BASE}/my`)).status).toBe(401);
    });
  });

  describe('detail', () => {
    it('whitelisted shape, 404 when deleted', async () => {
      const { provider, category } = await setup();
      const r = await createOne(provider, category);
      const res = await api().get(`${BASE}/${r.id}`);
      expect(res.status).toBe(200);
      const json = JSON.stringify(res.body);
      for (const banned of ['__v', '"reviews"', 'availableQty', 'availableSlots', 'refunds', '@test.dev', 'phoneNumber', '"status"'])
        expect(json).not.toContain(banned);
      expect(res.body.data.provider).toEqual({ id: provider.id, name: expect.any(String), photo: expect.any(String) });

      await Restaurant.updateOne({ _id: r.id }, { isDeleted: true });
      expect((await api().get(`${BASE}/${r.id}`)).status).toBe(404);
      expect((await api().get(`${BASE}/not-an-id`)).status).toBe(400);
    });

    it('isOpenNow handles normal and overnight hours', () => {
      const at = (h: number, m = 0) => new Date(Date.UTC(2026, 0, 15, h, m));
      // UTC tz for a deterministic check
      expect(isOpenAt('10:00 AM', '10:00 PM', at(12), 'UTC')).toBe(true);
      expect(isOpenAt('10:00 AM', '10:00 PM', at(23), 'UTC')).toBe(false);
      expect(isOpenAt('6:00 PM', '2:00 AM', at(1), 'UTC')).toBe(true);
      expect(isOpenAt('6:00 PM', '2:00 AM', at(3), 'UTC')).toBe(false);
      expect(isOpenAt('bad', '2:00 AM', at(3), 'UTC')).toBe(false);
    });
  });

  describe('update', () => {
    it('owner updates whitelisted fields; mass assignment ignored', async () => {
      const { provider, category } = await setup();
      const r = await createOne(provider, category);
      const res = await api()
        .patch(`${BASE}/${r.id}`)
        .set(...provider.auth)
        .send({ title: 'New name', description: 'New desc', owner: oid(), averageRating: 5, reviewCount: 9, isDeleted: true, serviceFee: 99 });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ title: 'New name', description: 'New desc', serviceFee: 0 });
      const doc: any = await Restaurant.findById(r.id).lean();
      expect(String(doc.owner)).toBe(provider.id);
      expect(doc.averageRating).toBe(0);
      expect(doc.reviewCount).toBe(0);
      expect(doc.isDeleted).toBe(false);
    });

    it('another provider gets 403; admin can update; old alias works', async () => {
      const { provider, category } = await setup();
      const r = await createOne(provider, category);
      const other = await makeProvider('Restaurant');
      expect((await api().patch(`${BASE}/${r.id}`).set(...other.auth).send({ title: 'x' })).status).toBe(403);
      const admin = await makeAdmin();
      const res = await api().patch(`${BASE}/update/${r.id}`).set(...admin.auth).send({ title: 'By admin' });
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('By admin');
    });

    it('works on an old invalid document (no full save)', async () => {
      const { provider, category } = await setup();
      const r = await createOne(provider, category);
      // old doc: a seat with price 0 (now invalid) and no new flags
      await Restaurant.collection.updateOne(
        { _id: new Types.ObjectId(r.id) },
        { $set: { 'items.1.price': 0 }, $unset: { isActive: '', isDeleted: '', reviewCount: '', description: '' } },
      );
      const res = await api().patch(`${BASE}/${r.id}`).set(...provider.auth).send({ foodType: 'Italian' });
      expect(res.status).toBe(200);
      expect(res.body.data.foodType).toBe('Italian');
    });

    it('seats: keeps _id and booked stock, missing price keeps old price, add and remove', async () => {
      const { provider, category } = await setup();
      const r = await createOne(provider, category);
      const vip = r.seats.find((s: any) => s.type === 'VIP');
      const normal = r.seats.find((s: any) => s.type === 'Normal');
      // 3 VIP seats booked
      await Restaurant.updateOne({ _id: r.id, 'items._id': vip.id }, { $set: { 'items.$.availableQty': 7 } });

      const res = await api()
        .patch(`${BASE}/${r.id}`)
        .set(...provider.auth)
        .send({ seats: [{ id: vip.id, quantity: 12 }] });
      expect(res.status).toBe(200);
      const seat = res.body.data.seats.find((s: any) => s.type === 'VIP');
      expect(seat).toMatchObject({ id: vip.id, quantity: 12, price: 80, photo: PHOTO });
      expect(res.body.data.seats).toHaveLength(2); // Normal not sent: kept
      let doc: any = await Restaurant.findById(r.id).lean();
      expect(doc.items.find((i: any) => String(i._id) === vip.id).availableQty).toBe(9);

      // shrink below booked: clamped at 0
      await api().patch(`${BASE}/${r.id}`).set(...provider.auth).send({ items: [{ _id: vip.id, totalQty: 2 }] });
      doc = await Restaurant.findById(r.id).lean();
      expect(doc.items.find((i: any) => String(i._id) === vip.id)).toMatchObject({ totalQty: 2, availableQty: 0 });

      // match by type (old app), keeps _id
      const byType = await api().patch(`${BASE}/${r.id}`).set(...provider.auth).send({ items: [{ seat: 'Normal', price: 45 }] });
      expect(byType.body.data.seats.find((s: any) => s.type === 'Normal')).toMatchObject({ id: normal.id, price: 45 });

      // remove refused while booked
      const customer = await makeCustomer();
      const b = await booking(r.id, customer.id, { bookingItems: [{ itemId: normal.id, quantity: 1 }] });
      const refused = await api().patch(`${BASE}/${r.id}`).set(...provider.auth).send({ removeSeatIds: [normal.id] });
      expect(refused.status).toBe(409);
      await Booking.updateOne({ _id: b._id }, { bookingStatus: 'Completed' });
      const removed = await api().patch(`${BASE}/${r.id}`).set(...provider.auth).send({ removeItemIds: [normal.id] });
      expect(removed.status).toBe(200);
      expect(removed.body.data.seats.map((s: any) => s.type)).toEqual(['VIP']);

      // add it back (new seat needs photo), then a third type is refused
      const added = await api()
        .patch(`${BASE}/${r.id}`)
        .set(...provider.auth)
        .field('seats', JSON.stringify([{ type: 'Normal', price: 30, quantity: 5 }]))
        .attach('files[0]', PNG, 'new.png');
      expect(added.status).toBe(200);
      expect(added.body.data.seats.find((s: any) => s.type === 'Normal').photo).toMatch(/new\.png$/);
      const noPhoto = await api()
        .patch(`${BASE}/${r.id}`)
        .set(...provider.auth)
        .send({ removeSeatIds: [vip.id], seats: [{ type: 'VIP', price: 30, quantity: 5 }] });
      expect(noPhoto.status).toBe(400);
      const dup = await api()
        .patch(`${BASE}/${r.id}`)
        .set(...provider.auth)
        .send({ seats: [{ id: vip.id, type: 'Normal' }] });
      expect(dup.status).toBe(400);
    });

    it('slots: patch keeps ids, syncs bookable copy, validates hours', async () => {
      const { provider, category } = await setup();
      const r = await createOne(provider, category);
      const [lunch, dinner] = r.slots;
      const res = await api()
        .patch(`${BASE}/${r.id}`)
        .set(...provider.auth)
        .send({ slots: [{ id: lunch.id, startTime: '12:30 PM', endTime: '2:30 PM' }, { startTime: '9:00 PM', endTime: '10:30 PM' }] });
      expect(res.status).toBe(200);
      expect(res.body.data.slots).toHaveLength(3);
      expect(res.body.data.slots[0]).toEqual({ id: lunch.id, startTime: '12:30 PM', endTime: '2:30 PM' });
      const doc: any = await Restaurant.findById(r.id).lean();
      expect(doc.availableSlots).toHaveLength(3);
      expect(doc.availableSlots.find((s: any) => String(s._id) === lunch.id).startTime).toBe('12:30 PM');

      expect((await api().patch(`${BASE}/${r.id}`).set(...provider.auth).send({ slots: [{ startTime: '10:30 PM', endTime: '12:30 PM' }] })).status).toBe(400);
      expect((await api().patch(`${BASE}/${r.id}`).set(...provider.auth).send({ closeTime: '8:00 PM' })).status).toBe(400); // dinner slot outside
      expect((await api().patch(`${BASE}/${r.id}`).set(...provider.auth).field('slots', '{oops')).status).toBe(400);

      const customer = await makeCustomer();
      await booking(r.id, customer.id, { slots: [dinner.id] });
      expect((await api().patch(`${BASE}/${r.id}`).set(...provider.auth).send({ removeSlotIds: [dinner.id] })).status).toBe(409);
      const ok = await api().patch(`${BASE}/${r.id}`).set(...provider.auth).send({ removeSlotIds: [lunch.id] });
      expect(ok.status).toBe(200);
      expect(ok.body.data.slots.map((s: any) => s.id)).not.toContain(lunch.id);
    });
  });

  describe('status and delete', () => {
    it('toggles isActive (owner only)', async () => {
      const { provider, category } = await setup();
      const r = await createOne(provider, category);
      const other = await makeProvider('Restaurant');
      expect((await api().patch(`${BASE}/${r.id}/status`).set(...other.auth).send({ isActive: false })).status).toBe(403);
      expect((await api().patch(`${BASE}/${r.id}/status`).set(...provider.auth).send({ isActive: 'maybe' })).status).toBe(400);
      const res = await api().patch(`${BASE}/${r.id}/status`).set(...provider.auth).send({ isActive: false });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ id: r.id, isActive: false });
      expect((await api().get(BASE)).body.meta.total).toBe(0);
    });

    it('soft delete; 409 with an open booking; alias works', async () => {
      const { provider, category } = await setup();
      const r = await createOne(provider, category);
      const customer = await makeCustomer();
      const b = await booking(r.id, customer.id);
      expect((await api().delete(`${BASE}/${r.id}`).set(...provider.auth)).status).toBe(409);
      await Booking.updateOne({ _id: b._id }, { bookingStatus: 'Cancelled' });
      const other = await makeProvider('Restaurant');
      expect((await api().delete(`${BASE}/${r.id}`).set(...other.auth)).status).toBe(403);
      const res = await api().delete(`${BASE}/delete/${r.id}`).set(...provider.auth);
      expect(res.status).toBe(200);
      const doc: any = await Restaurant.findById(r.id).lean();
      expect(doc).toMatchObject({ isDeleted: true, isActive: false });
    });
  });

  describe('reviews', () => {
    it('403 without a completed booking, 201 with one, 409 duplicate', async () => {
      const { provider, category } = await setup();
      const r = await createOne(provider, category);
      const customer = await makeCustomer();
      const review = { rating: 4, comment: 'Great fondue' };
      expect((await api().post(`${BASE}/${r.id}/review`).set(...customer.auth).send(review)).status).toBe(403);
      await booking(r.id, customer.id, { bookingStatus: 'Completed' });
      const ok = await api().post(`${BASE}/review/${r.id}`).set(...customer.auth).send(review);
      expect(ok.status).toBe(201);
      expect(ok.body.data.rating).toEqual({ average: 4, count: 1 });
      expect((await api().post(`${BASE}/${r.id}/review`).set(...customer.auth).send(review)).status).toBe(409);

      const list = await api().get(`${BASE}/${r.id}/reviews`);
      expect(list.status).toBe(200);
      expect(list.body.data[0]).toMatchObject({ rating: 4, comment: 'Great fondue' });
      expect((await api().get(`${BASE}/${r.id}`)).body.data.rating).toEqual({ average: 4, count: 1 });
    });
  });

  describe('service fee', () => {
    it('one platform setting, synced to listings, used for new restaurants', async () => {
      const { provider, category } = await setup();
      const admin = await makeAdmin();
      const r = await createOne(provider, category);

      expect((await api().patch(`${BASE}/service-fee/update`).set(...provider.auth).send({ serviceFee: 5 })).status).toBe(403);
      expect((await api().patch(`${BASE}/service-fee/update`).set(...admin.auth).send({ serviceFee: -1 })).status).toBe(400);
      const upd = await api().patch(`${BASE}/service-fee/update`).set(...admin.auth).send({ serviceFee: 7.5 });
      expect(upd.status).toBe(200);
      expect(upd.body.data.serviceFee).toBe(7.5);

      expect((await api().get(`${BASE}/${r.id}`)).body.data.serviceFee).toBe(7.5);
      const fresh = await createOne(provider, category, { title: 'Fresh' });
      expect(fresh.serviceFee).toBe(7.5);

      const view = await api().get(`${BASE}/view/service-fee`).set(...admin.auth);
      expect(view.body.data).toEqual({ serviceFee: 7.5 });
      expect(await getRestaurantServiceFee()).toBe(7.5);
    });

    it('falls back to the highest listing fee, then 0', async () => {
      expect(await getRestaurantServiceFee()).toBe(0);
      const { provider, category } = await setup();
      const r = await createOne(provider, category);
      await Restaurant.updateOne({ _id: r.id }, { serviceFee: 4 });
      expect(await getRestaurantServiceFee()).toBe(4);
      await RestaurantSetting.create({ key: 'restaurant', serviceFee: 0 });
      expect(await getRestaurantServiceFee()).toBe(0);
    });
  });
});
