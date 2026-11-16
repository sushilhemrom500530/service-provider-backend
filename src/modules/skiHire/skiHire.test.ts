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
import { SkiHire } from './skihire.model';
import { Booking } from '../booking/booking.model';

const BASE = '/api/v1/ski-hire';

let provider: TestUser;
let subId: string;

const body = (over: Record<string, any> = {}) => ({
  category: subId,
  title: 'Alpine Rentals',
  description: 'Skis and boots',
  thumbnail: 'https://cdn.example.com/t.png',
  serviceArea: 'Courchevel',
  priceUnit: 'per_day',
  extraChargePerHour: 5,
  items: [
    { name: 'Skis', price: 30, quantity: 10 },
    { name: 'Boots', price: 15, quantity: 5 },
  ],
  ...over,
});

const createListing = async (by: TestUser = provider, over: Record<string, any> = {}) => {
  const res = await api().post(BASE).set(...by.auth).send(body(over));
  expect(res.status).toBe(201);
  return res.body.data;
};

const makeBooking = (listingId: string, userId: string, status: string, itemId?: string) =>
  Booking.create({
    user: userId,
    product: listingId,
    productModel: 'SkiHire',
    category: 'Ski_Hire',
    totalPrice: 30,
    bookingStatus: status,
    bookingItems: itemId ? [{ itemId, quantity: 1 }] : [],
  });

beforeEach(async () => {
  provider = await makeProvider('Ski_Hire');
  subId = await makeSubCategory('Ski_Hire', 'Skis');
});

describe('create', () => {
  it('201 with the detail shape; owner comes from the token', async () => {
    const other = oid();
    const res = await api()
      .post(BASE)
      .set(...provider.auth)
      .send(body({ owner: other, averageRating: 5 }));
    expect(res.status).toBe(201);
    const d = res.body.data;
    expect(d).toMatchObject({
      category: 'Ski_Hire',
      subCategory: { id: subId, name: 'Skis' },
      title: 'Alpine Rentals',
      price: { amount: 15, unit: 'per_day' },
      rating: { average: 0, count: 0 },
      provider: { id: provider.id },
      priceUnit: 'per_day',
      extraChargePerHour: 5,
      isActive: true,
    });
    expect(d.items).toHaveLength(2);
    expect(d.items[0]).toEqual({ id: expect.any(String), name: 'Skis', photo: '', price: 30, quantity: 10 });
    const db: any = await SkiHire.findById(d.id).lean();
    expect(String(db.owner)).toBe(provider.id);
    expect(db.averageRating).toBe(0);
    expect(db.items[0].availableQty).toBe(10);
  });

  it('accepts the old productItems / productName names and the /create alias', async () => {
    const res = await api()
      .post(`${BASE}/create`)
      .set(...provider.auth)
      .send(body({ items: undefined, productItems: [{ productName: 'Helmet', price: '8', quantity: '3' }] }));
    expect(res.status).toBe(201);
    expect(res.body.data.items[0]).toMatchObject({ name: 'Helmet', price: 8, quantity: 3 });
  });

  it('403 for a customer, an admin and a provider of another type', async () => {
    for (const u of [await makeCustomer(), await makeAdmin(), await makeProvider('Transport')]) {
      const res = await api().post(BASE).set(...u.auth).send(body());
      expect(res.status).toBe(403);
    }
  });

  it('400 on validation errors', async () => {
    const bad = [
      body({ items: [] }),
      body({ items: undefined }),
      body({ items: [{ name: 'A', price: 10, quantity: 1 }] }), // name too short
      body({ items: [{ name: '123', price: 10, quantity: 1 }] }), // no letters
      body({ items: [{ name: 'Skis', price: 0, quantity: 1 }] }),
      body({ priceUnit: 'per_week' }),
      body({ title: '' }),
      body({ category: oid() }), // not a Ski_Hire sub-category
    ];
    for (const b of bad) {
      const res = await api().post(BASE).set(...provider.auth).send(b);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    }
    const noThumb = await api().post(BASE).set(...provider.auth).send(body({ thumbnail: undefined }));
    expect(noThumb.status).toBe(400);
  });

  it('multipart create with a thumbnail and item photos', async () => {
    const res = await api()
      .post(BASE)
      .set(...provider.auth)
      .field('category', subId)
      .field('title', 'Multipart Hire')
      .field('serviceArea', 'Val Thorens')
      .field('priceUnit', 'per_hour')
      .field('extraChargePerHour', '0')
      .field(
        'productItems',
        JSON.stringify([
          { productName: 'Skis', price: '20', quantity: '4' },
          { productName: 'Poles', price: '5', quantity: '6' },
        ]),
      )
      .attach('thumbnail', PNG, 'a.png')
      .attach('files', PNG, 'skis.png')
      .attach('itemPhoto_1', PNG, 'poles.png');
    expect(res.status).toBe(201);
    const d = res.body.data;
    expect(d.thumbnail).toMatch(/^https:\/\/test-bucket/);
    expect(d.items[0].photo).toMatch(/skis\.png$/);
    expect(d.items[1].photo).toMatch(/poles\.png$/);
    expect(d.price).toEqual({ amount: 5, unit: 'per_hour' });
  });
});

describe('browse and my listings', () => {
  it('filters, searches, paginates and hides inactive/deleted', async () => {
    const a = await createListing(provider, { title: 'Cheap Skis', items: [{ name: 'Skis', price: 10, quantity: 1 }] });
    const b = await createListing(provider, { title: 'Premium Skis', serviceArea: 'Tignes', items: [{ name: 'Skis', price: 100, quantity: 1 }] });
    const c = await createListing(provider, { title: 'Hidden' });
    const d = await createListing(provider, { title: 'Gone' });
    await SkiHire.updateOne({ _id: c.id }, { isActive: false });
    await SkiHire.updateOne({ _id: d.id }, { isDeleted: true });

    const all = await api().get(BASE); // public, no auth
    expect(all.status).toBe(200);
    expect(all.body.meta).toMatchObject({ page: 1, total: 2 });
    expect(all.body.data.map((x: any) => x.id).sort()).toEqual([a.id, b.id].sort());

    const search = await api().get(`${BASE}?search=premium`);
    expect(search.body.data.map((x: any) => x.id)).toEqual([b.id]);

    const area = await api().get(`${BASE}/all?serviceArea=tign`);
    expect(area.body.data.map((x: any) => x.id)).toEqual([b.id]);

    const range = await api().get(`${BASE}?minPrice=50&maxPrice=150`);
    expect(range.body.data.map((x: any) => x.id)).toEqual([b.id]);

    const cat = await api().get(`${BASE}?category=skis`);
    expect(cat.body.meta.total).toBe(2);
    const noCat = await api().get(`${BASE}?category=snowboard`);
    expect(noCat.body.meta.total).toBe(0);

    const sorted = await api().get(`${BASE}?sort=price_asc`);
    expect(sorted.body.data.map((x: any) => x.price.amount)).toEqual([10, 100]);

    const page = await api().get(`${BASE}?limit=1&page=2`);
    expect(page.body.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
    expect(page.body.data).toHaveLength(1);

    const card = all.body.data[0];
    expect(Object.keys(card).sort()).toEqual(
      ['category', 'id', 'isActive', 'price', 'provider', 'rating', 'serviceArea', 'subCategory', 'thumbnail', 'title'].sort(),
    );
    expect(Object.keys(card.provider).sort()).toEqual(['id', 'name', 'photo']);

    const mine = await api().get(`${BASE}/my`).set(...provider.auth);
    expect(mine.body.meta.total).toBe(3); // inactive included, deleted not
    const inactive = await api().get(`${BASE}/my-all?status=inactive`).set(...provider.auth);
    expect(inactive.body.data.map((x: any) => [x.id, x.isActive])).toEqual([[c.id, false]]);

    const other = await makeProvider('Ski_Hire');
    const otherMine = await api().get(`${BASE}/my`).set(...other.auth);
    expect(otherMine.body.meta.total).toBe(0);
  });
});

describe('detail', () => {
  it('whitelisted shape, 404 when deleted', async () => {
    const created = await createListing();
    const res = await api().get(`${BASE}/${created.id}`);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    for (const key of ['__v', 'reviews', 'availableQty', 'totalPrice', 'refunds', 'email', 'phoneNumber', 'productName', 'totalQty'])
      expect(text).not.toContain(`"${key}"`);
    expect(text).not.toContain(provider.doc.email);
    expect(res.body.data).toMatchObject({ description: 'Skis and boots', createdAt: expect.any(String) });

    await SkiHire.updateOne({ _id: created.id }, { isDeleted: true });
    expect((await api().get(`${BASE}/${created.id}`)).status).toBe(404);
    expect((await api().get(`${BASE}/${oid()}`)).status).toBe(404);
    expect((await api().get(`${BASE}/not-an-id`)).status).toBe(400);
  });
});

describe('update', () => {
  it('owner OK, other provider 403, admin OK, mass-assignment ignored', async () => {
    const created = await createListing();
    const intruder = await makeProvider('Ski_Hire');

    const denied = await api().patch(`${BASE}/${created.id}`).set(...intruder.auth).send({ title: 'Hacked' });
    expect(denied.status).toBe(403);

    const res = await api()
      .patch(`${BASE}/${created.id}`)
      .set(...provider.auth)
      .send({ title: 'Renamed', priceUnit: 'per_rental', owner: intruder.id, averageRating: 5, reviewCount: 99, isDeleted: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: 'Renamed', priceUnit: 'per_rental', price: { unit: 'per_rental' } });
    const db: any = await SkiHire.findById(created.id).lean();
    expect(String(db.owner)).toBe(provider.id);
    expect(db.averageRating).toBe(0);
    expect(db.reviewCount).toBe(0);
    expect(db.isDeleted).toBe(false);

    const admin = await makeAdmin();
    const byAdmin = await api().patch(`${BASE}/update/${created.id}`).set(...admin.auth).send({ serviceArea: 'Meribel' });
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.data.serviceArea).toBe('Meribel');
  });

  it('items keep their _id and booked stock; unsent items are kept; new items added', async () => {
    const created = await createListing();
    const skis = created.items[0];
    const boots = created.items[1];
    // 3 skis booked
    await SkiHire.updateOne({ _id: created.id, 'items._id': skis.id }, { $set: { 'items.$.availableQty': 7 } });

    const res = await api()
      .patch(`${BASE}/${created.id}`)
      .set(...provider.auth)
      .send({ items: [{ id: skis.id, quantity: 12 }, { name: 'Goggles', price: 9, quantity: 2 }] });
    expect(res.status).toBe(200);
    const items = res.body.data.items;
    expect(items.map((i: any) => i.name)).toEqual(['Skis', 'Boots', 'Goggles']);
    expect(items[0]).toMatchObject({ id: skis.id, price: 30, quantity: 12 });
    expect(items[1].id).toBe(boots.id);
    expect(res.body.data.price.amount).toBe(9);

    const db: any = await SkiHire.findById(created.id).lean();
    expect(db.items[0].availableQty).toBe(9);
    expect(db.items[2].availableQty).toBe(2);

    // old app: productItems without _id, matched by name; quantity below booked clamps at 0
    const old = await api()
      .patch(`${BASE}/update/${created.id}`)
      .set(...provider.auth)
      .send({ productItems: [{ productName: 'skis', price: 35, quantity: 1 }] });
    expect(old.status).toBe(200);
    expect(old.body.data.items[0]).toMatchObject({ id: skis.id, price: 35, quantity: 1 });
    const db2: any = await SkiHire.findById(created.id).lean();
    expect(db2.items[0].availableQty).toBe(0);

    // old app: the full list without ids and renamed -> matched by position
    const full = await api()
      .patch(`${BASE}/update/${created.id}`)
      .set(...provider.auth)
      .send({ productItems: [
        { productName: 'Race Skis', price: 35, quantity: 1 },
        { productName: 'Ski Boots', price: 15, quantity: 5 },
        { productName: 'Goggles', price: 9, quantity: 2 },
      ] });
    expect(full.status).toBe(200);
    expect(full.body.data.items.map((i: any) => [i.id, i.name])).toEqual([
      [skis.id, 'Race Skis'], [boots.id, 'Ski Boots'], [items[2].id, 'Goggles'],
    ]);

    // unknown id -> 400
    const bad = await api().patch(`${BASE}/${created.id}`).set(...provider.auth).send({ items: [{ id: oid(), price: 5 }] });
    expect(bad.status).toBe(400);
  });

  it('multipart update: photo by index (images / files[i] / itemPhoto_i), old photo kept', async () => {
    const created = await createListing();
    const [skis, boots] = created.items;
    const res = await api()
      .patch(`${BASE}/update/${created.id}`)
      .set(...provider.auth)
      .field('productItems', JSON.stringify([{ _id: skis.id }, { _id: boots.id }]))
      .attach('images[1]', PNG, 'boots.png');
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].photo).toBe('');
    expect(res.body.data.items[1].photo).toMatch(/boots\.png$/);

    const res2 = await api()
      .patch(`${BASE}/${created.id}`)
      .set(...provider.auth)
      .field('items', JSON.stringify([{ id: skis.id, price: '40' }]))
      .attach('itemPhoto_0', PNG, 'skis.png')
      .attach('thumbnail', PNG, 'thumb.png');
    expect(res2.status).toBe(200);
    expect(res2.body.data.items[0]).toMatchObject({ price: 40, photo: expect.stringMatching(/skis\.png$/) });
    expect(res2.body.data.items[1].photo).toMatch(/boots\.png$/);
    expect(res2.body.data.thumbnail).toMatch(/thumb\.png$/);
  });

  it('removeItemIds: 409 with an open booking on the item, removed otherwise', async () => {
    const created = await createListing();
    const [skis, boots] = created.items;
    const customer = await makeCustomer();
    await makeBooking(created.id, customer.id, 'Active', skis.id);

    const blocked = await api().patch(`${BASE}/${created.id}`).set(...provider.auth).send({ removeItemIds: [skis.id] });
    expect(blocked.status).toBe(409);

    const ok = await api().patch(`${BASE}/${created.id}`).set(...provider.auth).send({ removeItemIds: [boots.id] });
    expect(ok.status).toBe(200);
    expect(ok.body.data.items.map((i: any) => i.id)).toEqual([skis.id]);
  });
});

describe('status and delete', () => {
  it('toggles isActive (owner only)', async () => {
    const created = await createListing();
    const intruder = await makeProvider('Ski_Hire');
    expect((await api().patch(`${BASE}/${created.id}/status`).set(...intruder.auth).send({ isActive: false })).status).toBe(403);

    const res = await api().patch(`${BASE}/${created.id}/status`).set(...provider.auth).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: created.id, isActive: false });
    expect((await api().get(BASE)).body.meta.total).toBe(0);
    expect((await api().patch(`${BASE}/${created.id}/status`).set(...provider.auth).send({})).status).toBe(400);
  });

  it('soft delete; 409 with an open booking; admin can delete', async () => {
    const created = await createListing();
    const customer = await makeCustomer();
    const booking = await makeBooking(created.id, customer.id, 'Pending');

    const intruder = await makeProvider('Ski_Hire');
    expect((await api().delete(`${BASE}/${created.id}`).set(...intruder.auth)).status).toBe(403);
    expect((await api().delete(`${BASE}/${created.id}`).set(...provider.auth)).status).toBe(409);

    await Booking.updateOne({ _id: booking._id }, { bookingStatus: 'Completed' });
    const res = await api().delete(`${BASE}/delete/${created.id}`).set(...provider.auth);
    expect(res.status).toBe(200);
    const db: any = await SkiHire.findById(created.id).lean();
    expect(db).toMatchObject({ isDeleted: true, isActive: false });

    const second = await createListing();
    const admin = await makeAdmin();
    expect((await api().delete(`${BASE}/${second.id}`).set(...admin.auth)).status).toBe(200);
  });
});

describe('reviews', () => {
  it('403 without a completed booking, 201 with one, 409 duplicate, listed', async () => {
    const created = await createListing();
    const customer = await makeCustomer();
    const review = { rating: 4, comment: 'Great skis' };

    expect((await api().post(`${BASE}/${created.id}/review`).set(...customer.auth).send(review)).status).toBe(403);

    await makeBooking(created.id, customer.id, 'Completed');
    const ok = await api().post(`${BASE}/review/${created.id}`).set(...customer.auth).send(review);
    expect(ok.status).toBe(201);
    expect(ok.body.data.rating).toEqual({ average: 4, count: 1 });

    expect((await api().post(`${BASE}/${created.id}/review`).set(...customer.auth).send(review)).status).toBe(409);

    const list = await api().get(`${BASE}/${created.id}/reviews`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.rating).toEqual({ average: 4, count: 1 });
    expect(list.body.data[0]).toMatchObject({ rating: 4, comment: 'Great skis' });
    expect(JSON.stringify(list.body)).not.toContain(customer.doc.email);

    const card = (await api().get(BASE)).body.data[0];
    expect(card.rating).toEqual({ average: 4, count: 1 });

    expect((await api().post(`${BASE}/${created.id}/review`).set(...provider.auth).send(review)).status).toBe(403);
  });
});
