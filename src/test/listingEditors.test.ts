/**
 * What every listing editor screen in the app does:
 *   1. GET /<service>/:id          (load the form)
 *   2. change a field
 *   3. PATCH /<service>/:id with the loaded object sent back as it is
 * The server must accept its own detail shape (ids, nested objects,
 * read-only fields) and keep everything that wasn't changed.
 */
import { api, makeProvider, makeSubCategory } from './factories';
import {
  makeMassageListing,
  makeRestaurantListing,
  makeSkiHireListing,
  makeSkiPassListing,
  makeTransportListing,
} from './listingFixtures';

const cases = [
  { name: 'Ski Pass', base: '/api/v1/ski-pass', type: 'Ski_Pass', make: (o: string) => makeSkiPassListing(o, 40) },
  { name: 'Ski Hire', base: '/api/v1/ski-hire', type: 'Ski_Hire', make: (o: string) => makeSkiHireListing(o) },
  { name: 'Transport', base: '/api/v1/transport', type: 'Transport', make: (o: string) => makeTransportListing(o, 100) },
  { name: 'Restaurant', base: '/api/v1/restaurant', type: 'Restaurant', make: (o: string) => makeRestaurantListing(o) },
  { name: 'Massage', base: '/api/v1/massage', type: 'Massage', make: (o: string) => makeMassageListing(o) },
];

/** Drop the read-only values a form never changes, keep the rest */
const stable = (d: any) => {
  const { rating, createdAt, updatedAt, isOpenNow, provider, ...rest } = d;
  return rest;
};

describe.each(cases)('$name editor', ({ base, type, make }) => {
  it('send back the loaded detail unchanged except the title -> 200, nothing else changes', async () => {
    const provider = await makeProvider(type);
    const doc: any = await make(provider.id);
    const loaded = await api().get(`${base}/${doc._id}`);
    expect(loaded.status).toBe(200);
    const form = { ...loaded.body.data, title: 'Edited title' };

    const saved = await api().patch(`${base}/${doc._id}`).set(...provider.auth).send(form);
    if (saved.status !== 200) throw new Error(`${saved.status}: ${JSON.stringify(saved.body)}`);
    expect(saved.body.data.title).toBe('Edited title');
    expect(stable(saved.body.data)).toEqual(stable({ ...loaded.body.data, title: 'Edited title' }));

    // and the public detail shows the same
    const again = await api().get(`${base}/${doc._id}`);
    expect(stable(again.body.data)).toEqual(stable(saved.body.data));
  });

  it('send only the changed field -> 200, everything else kept', async () => {
    const provider = await makeProvider(type);
    const doc: any = await make(provider.id);
    const loaded = await api().get(`${base}/${doc._id}`);
    const saved = await api().patch(`${base}/${doc._id}`).set(...provider.auth).send({ description: 'New description' });
    expect(saved.status).toBe(200);
    expect(saved.body.data.description).toBe('New description');
    expect(stable({ ...saved.body.data, description: undefined })).toEqual(
      stable({ ...loaded.body.data, description: undefined }),
    );
  });

  it('the provider’s own list (/my) shows the edit; another provider cannot edit', async () => {
    const provider = await makeProvider(type);
    const doc: any = await make(provider.id);
    await api().patch(`${base}/${doc._id}`).set(...provider.auth).send({ title: 'Mine' });
    const mine = await api().get(`${base}/my`).set(...provider.auth);
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((x: any) => x.title)).toContain('Mine');
    const other = await makeProvider(type);
    expect((await api().patch(`${base}/${doc._id}`).set(...other.auth).send({ title: 'x' })).status).toBe(403);
  });
});

describe.each(cases.filter(c => c.type !== 'Ski_Pass'))('$name editor: sub-category', ({ base, type, make }) => {
  it('change it with subCategory { id } (JSON) or as a form-data field; read-only category ignored', async () => {
    const provider = await makeProvider(type);
    const doc: any = await make(provider.id);
    const loaded = await api().get(`${base}/${doc._id}`);
    const other = await makeSubCategory(type, `${type} other`);

    const json = await api().patch(`${base}/${doc._id}`).set(...provider.auth)
      .send({ ...loaded.body.data, subCategory: { id: other } });
    expect(json.status).toBe(200);
    expect(json.body.data.subCategory.id).toBe(other);
    expect(json.body.data.category).toBe(loaded.body.data.category);

    const form = await api().patch(`${base}/${doc._id}`).set(...provider.auth)
      .field('category', loaded.body.data.category)
      .field('subCategory', JSON.stringify(loaded.body.data.subCategory))
      .field('title', 'Form edit');
    expect(form.status).toBe(200);
    expect(form.body.data.subCategory.id).toBe(loaded.body.data.subCategory.id);
    expect(form.body.data.title).toBe('Form edit');

    // a sub-category of another service is still refused
    const wrong = await makeSubCategory('Ski_Pass', 'Wrong service');
    expect((await api().patch(`${base}/${doc._id}`).set(...provider.auth).send({ subCategory: { id: wrong } })).status).toBe(400);
  });
});
