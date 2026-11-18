/**
 * QA report of 17 Nov 2026 (16:50 BDT):
 *  S1  booking notifications name the listing and when it takes place
 *      (Ski Pass "confirmed", requests, provider "new booking", approval)
 *  S2  a Ski Pass booking is for up to 10 people (400 above)
 */
import { api, makeAdmin, makeCustomer, makeProvider, daysFromNow, isoDate, TestUser } from '../../test/factories';
import { payIntent } from '../../test/stripeMock';
import { makeMassageListing, makeSkiPassListing } from '../../test/listingFixtures';
import { Booking } from './booking.model';
import { Notification } from '../notification/notification.model';

const B = '/api/v1/booking';
const DAY = /\w{3} \d{1,2} \w{3}/; // "Fri 20 Nov"

const book = async (customer: TestUser, body: Record<string, any>) => {
  const intent = await api().post(`${B}/intent`).set(...customer.auth).send(body);
  expect(intent.status).toBe(200);
  payIntent(intent.body.data.paymentIntentId);
  const created = await api().post(`${B}/create`).set(...customer.auth)
    .send({ ...body, paymentIntentId: intent.body.data.paymentIntentId });
  expect(created.status).toBe(201);
  return created.body.data.id as string;
};

const textOf = async (receiver: TestUser, event: string) =>
  (await Notification.findOne({ receiverId: receiver.id, event }).lean()) as any;

beforeEach(async () => {
  await makeAdmin();
});

describe('S1: Ski Pass confirmation names the pass and the day', () => {
  it('customer: "<pass> on <day> is confirmed. Ticket TKT-…"; provider: "<name> booked <pass> on <day>."', async () => {
    const provider = await makeProvider('Ski_Pass');
    const customer = await makeCustomer();
    const pass = await makeSkiPassListing(provider.id, 79);
    const id = await book(customer, { productId: String(pass._id), date: isoDate(daysFromNow(3)), personCount: 2 });
    const b: any = await Booking.findById(id).lean();

    const mine = await textOf(customer, 'booking.confirmed');
    expect(mine.description).toBe(`Day pass on ${mine.description.match(DAY)[0]} is confirmed. Ticket ${b.ticketNumber}.`);
    expect(mine.description).not.toMatch(/\d{1,2}:\d{2}/); // a whole-day pass: no clock time
    expect(mine.data).toMatchObject({ ticketNumber: b.ticketNumber });
    expect(new Date(mine.data.startAt).getTime()).toBe(new Date(b.startAt).getTime());

    const theirs = await textOf(provider, 'booking.new');
    expect(theirs.description).toMatch(new RegExp(`^${customer.doc.fullName} booked Day pass on ${DAY.source}\\.$`));
    expect(theirs.data).toMatchObject({ ticketNumber: b.ticketNumber });
  });
});

describe('S1: the same for services the provider confirms', () => {
  it('request, new request and approval texts all name the service and the time', async () => {
    const provider = await makeProvider('Massage');
    const customer = await makeCustomer();
    const m = await makeMassageListing(provider.id);
    const id = await book(customer, { productId: String(m._id), date: isoDate(daysFromNow(3)), time: '11:00 AM', duration: '60 min' });
    const b: any = await Booking.findById(id).lean();
    const session = `Deep tissue on ${DAY.source}, 11:00 AM \\w+`;

    const requested = await textOf(customer, 'booking.requested');
    expect(requested.description).toMatch(new RegExp(`^Payment received for ${session}\\. The provider will confirm your booking soon\\.$`));
    expect(requested.data.approveBy).toBeTruthy();

    const request = await textOf(provider, 'booking.new');
    expect(request.description).toMatch(new RegExp(`^${customer.doc.fullName} requested ${session}\\. Approve or reject it before `));
    expect(new Date(request.data.startAt).getTime()).toBe(new Date(b.startAt).getTime());

    await api().patch(`${B}/${id}/approve`).set(...provider.auth);
    const approved = await textOf(customer, 'booking.approved');
    expect(approved.description).toMatch(new RegExp(`^${session} has been confirmed by the provider\\.$`));
    expect(new Date(approved.data.startAt).getTime()).toBe(new Date(b.startAt).getTime());
  });
});

describe('S2: Ski Pass booking is for up to 10 people', () => {
  it('10 is accepted, 11 is refused (intent and create), 0 is refused', async () => {
    const provider = await makeProvider('Ski_Pass');
    const customer = await makeCustomer();
    const pass = await makeSkiPassListing(provider.id, 79);
    const body = (personCount: any) => ({ productId: String(pass._id), date: isoDate(daysFromNow(3)), personCount });

    const ten = await api().post(`${B}/intent`).set(...customer.auth).send(body(10));
    expect([ten.status, ten.body.data.amount]).toEqual([200, 790]);

    const eleven = await api().post(`${B}/intent`).set(...customer.auth).send(body(11));
    expect(eleven.status).toBe(400);
    expect(eleven.body.message).toMatch(/A ski pass booking is for up to 10 people\. Make a second booking for more\./);

    // create re-checks the body even with a valid payment
    payIntent(ten.body.data.paymentIntentId);
    const sneaky = await api().post(`${B}/create`).set(...customer.auth)
      .send({ ...body(11), paymentIntentId: ten.body.data.paymentIntentId });
    expect(sneaky.status).toBe(400);
    expect(await Booking.countDocuments({ product: pass._id })).toBe(0);

    expect((await api().post(`${B}/intent`).set(...customer.auth).send(body(0))).status).toBe(400);
  });

  it('the listing tells the app the limit', async () => {
    const pass = await makeSkiPassListing((await makeProvider('Ski_Pass')).id);
    const res = await api().get(`/api/v1/ski-pass/${pass._id}`);
    expect(res.body.data.maxPeoplePerBooking).toBe(10);
  });

  it('other services keep their own limits (massage capacity, not 10)', async () => {
    const m: any = await makeMassageListing((await makeProvider('Massage')).id);
    const res = await api().post(`${B}/intent`).set(...(await makeCustomer()).auth)
      .send({ productId: String(m._id), date: isoDate(daysFromNow(3)), time: '11:00 AM', duration: '60 min', personCount: 11 });
    expect(res.body.message).toMatch(/takes up to 1 guest/);
  });
});
