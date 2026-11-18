/**
 * QA report of 17 Nov 2026 (17:50 BDT), M4:
 * "You can now leave a review" must only be sent when the customer can
 * actually review (one review per customer per listing). The notification
 * follows the same rule as the booking's `review` action and says so in
 * `data.canReview`.
 */
import { api, makeAdmin, makeCustomer, makeProvider, daysFromNow, isoDate, TestUser } from '../../test/factories';
import { payIntent } from '../../test/stripeMock';
import { makeMassageListing, makeSkiPassListing } from '../../test/listingFixtures';
import { Booking } from './booking.model';
import { Notification } from '../notification/notification.model';
import { runBookingAutomation } from '../../jobs/automaticUpdateJobService';
import { canReviewAfter } from './booking.lifecycle';

const B = '/api/v1/booking';

const book = async (customer: TestUser, body: Record<string, any>) => {
  const intent = await api().post(`${B}/intent`).set(...customer.auth).send(body);
  expect(intent.status).toBe(200);
  payIntent(intent.body.data.paymentIntentId);
  const created = await api().post(`${B}/create`).set(...customer.auth)
    .send({ ...body, paymentIntentId: intent.body.data.paymentIntentId });
  expect(created.status).toBe(201);
  return created.body.data.id as string;
};

const completedNote = async (bookingId: string) =>
  (await Notification.findOne({ booking: bookingId, event: 'booking.completed' }).lean()) as any;

beforeEach(async () => {
  await makeAdmin();
});

describe('M4: completion text offers a review only when one is possible', () => {
  it('automatic completion: invitation before the review, none after it', async () => {
    const provider = await makeProvider('Ski_Pass');
    const customer = await makeCustomer();
    const pass = await makeSkiPassListing(provider.id, 40);
    const first = await book(customer, { productId: String(pass._id), date: isoDate(daysFromNow(1)) });
    await runBookingAutomation(daysFromNow(3));

    const n1 = await completedNote(first);
    expect(n1.description).toBe('We hope you enjoyed Day pass. You can now leave a review.');
    expect(n1.data).toMatchObject({ canReview: true });

    const review = await api().post(`/api/v1/ski-pass/${pass._id}/review`).set(...customer.auth)
      .send({ rating: 5, comment: 'Great' });
    expect(review.status).toBe(201);

    const second = await book(customer, { productId: String(pass._id), date: isoDate(daysFromNow(4)) });
    await runBookingAutomation(daysFromNow(6));
    const n2 = await completedNote(second);
    expect(n2.description).toBe('We hope you enjoyed Day pass.');
    expect(n2.data).toMatchObject({ canReview: false });

    // the text agrees with the booking's actions
    const view = await api().get(`${B}/${second}`).set(...customer.auth);
    expect(view.body.data.actions).not.toContain('review');
  });

  it('provider "Mark as done": same rule ("Thanks for visiting X.")', async () => {
    const provider = await makeProvider('Massage');
    const customer = await makeCustomer();
    const m: any = await makeMassageListing(provider.id);
    const session = (day: number) => ({ productId: String(m._id), date: isoDate(daysFromNow(day)), time: '11:00 AM', duration: '60 min' });
    const done = async (id: string) => {
      await api().patch(`${B}/${id}/approve`).set(...provider.auth);
      await Booking.updateOne({ _id: id }, { $set: { startAt: new Date(Date.now() - 60000), endAt: new Date(Date.now() + 3600000) } });
      expect((await api().patch(`${B}/${id}/complete`).set(...provider.auth)).status).toBe(200);
    };

    const first = await book(customer, session(2));
    await done(first);
    expect((await completedNote(first)).description).toBe('Thanks for visiting Deep tissue. You can now leave a review.');

    expect((await api().post(`/api/v1/massage/${m._id}/review`).set(...customer.auth)
      .send({ rating: 4, comment: 'Nice' })).status).toBe(201);

    const second = await book(customer, session(3));
    await done(second);
    const n2 = await completedNote(second);
    expect(n2.description).toBe('Thanks for visiting Deep tissue.');
    expect(n2.data).toMatchObject({ canReview: false });
  });

  it('another customer who has not reviewed is still invited', async () => {
    const provider = await makeProvider('Ski_Pass');
    const pass = await makeSkiPassListing(provider.id, 40);
    const a = await makeCustomer();
    await book(a, { productId: String(pass._id), date: isoDate(daysFromNow(1)) });
    await runBookingAutomation(daysFromNow(3));
    await api().post(`/api/v1/ski-pass/${pass._id}/review`).set(...a.auth).send({ rating: 5, comment: 'Great' });

    const b = await makeCustomer();
    const theirs = await book(b, { productId: String(pass._id), date: isoDate(daysFromNow(4)) });
    await runBookingAutomation(daysFromNow(6));
    expect((await completedNote(theirs)).data).toMatchObject({ canReview: true });
  });

  it('canReviewAfter: no-show and unknown listing are never reviewable', async () => {
    expect(await canReviewAfter({ noShow: true, category: 'Ski_Pass' })).toBe(false);
    expect(await canReviewAfter({ category: 'Unknown' })).toBe(false);
    expect(await canReviewAfter(null)).toBe(false);
  });
});
