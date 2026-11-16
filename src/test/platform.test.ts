/**
 * Money (withdrawals, wallet, payments), notifications and dashboards.
 */
import { api, makeAdmin, makeCustomer, makeProvider, daysFromNow, isoDate, TestUser } from './factories';
import { payIntent } from './stripeMock';
import { makeSkiPassListing } from './listingFixtures';
import { Wallet } from '../modules/wallet/wallet.model';
import { runBookingAutomation } from '../jobs/automaticUpdateJobService';

const bookSkiPass = async (customer: TestUser, productId: string, days = 1) => {
  const body = { productId, date: isoDate(daysFromNow(days)) };
  const intent = await api().post('/api/v1/booking/intent').set(...customer.auth).send(body);
  payIntent(intent.body.data.paymentIntentId);
  const res = await api().post('/api/v1/booking/create').set(...customer.auth)
    .send({ ...body, paymentIntentId: intent.body.data.paymentIntentId });
  return res.body.data;
};

describe('withdrawals', () => {
  it('reserves the amount, cannot overdraw, accept/reject only once', async () => {
    const admin = await makeAdmin();
    const provider = await makeProvider('Ski_Pass');
    await Wallet.updateOne({ user: provider.id }, { $set: { balance: 100 } });

    const added = await api().post('/api/v1/wallet/add').set(...provider.auth)
      .send({ accountType: 'Bank', cardNumber: 4242424242424242, cardHolderName: 'P' });
    expect(added.status).toBe(200);
    const account = added.body.data.accounts[0];
    expect(account.card).toBe('•••• 4242');
    expect(JSON.stringify(added.body)).not.toContain('4242424242424242');

    const w1 = await api().post('/api/v1/Withdraw/send-request').set(...provider.auth)
      .send({ cardId: account.id, amount: 70 });
    expect(w1.status).toBe(201);
    const w2 = await api().post('/api/v1/Withdraw/send-request').set(...provider.auth)
      .send({ cardId: account.id, amount: 40 });
    expect(w2.status).toBe(400); // only 30 left
    expect((await api().get('/api/v1/wallet/get-balance').set(...provider.auth)).body.data.balance).toBe(30);

    const rej = await api().patch('/api/v1/Withdraw/accept-request').set(...admin.auth)
      .send({ withdrawalId: w1.body.data.id, status: 'reject' });
    expect(rej.body.data.status).toBe('Rejected');
    expect((await api().get('/api/v1/wallet/get-balance').set(...provider.auth)).body.data.balance).toBe(100);
    const again = await api().patch('/api/v1/Withdraw/accept-request').set(...admin.auth)
      .send({ withdrawalId: w1.body.data.id, status: 'accept' });
    expect(again.status).toBe(409);

    const w3 = await api().post('/api/v1/Withdraw/send-request').set(...provider.auth)
      .send({ cardId: account.id, amount: 100 });
    const paid = await api().patch('/api/v1/Withdraw/accept-request').set(...admin.auth)
      .send({ withdrawalId: w3.body.data.id, status: 'accept' });
    expect(paid.body.data.status).toBe('Paid');
    expect((await api().get('/api/v1/wallet/get-balance').set(...provider.auth)).body.data.balance).toBe(0);

    const mine = await api().get('/api/v1/Withdraw/my').set(...provider.auth);
    expect(mine.body.meta.total).toBe(2);
  });
});

describe('payments, notifications, dashboards', () => {
  it('scopes payments, links notifications to bookings, computes dashboards', async () => {
    const admin = await makeAdmin();
    const provider = await makeProvider('Ski_Pass');
    const alice = await makeCustomer();
    const bob = await makeCustomer();
    const pass = await makeSkiPassListing(provider.id, 100);
    const booking = await bookSkiPass(alice, String(pass._id));
    await bookSkiPass(bob, String(pass._id), 2);

    // payments: a customer sees only theirs
    const alicePays = await api().get('/api/v1/payment/all').set(...alice.auth);
    expect(alicePays.body.meta.total).toBe(1);
    expect(alicePays.body.data[0]).toMatchObject({ bookingId: booking.id, amount: 100, status: 'Paid' });
    expect((await api().get('/api/v1/payment/all').set(...admin.auth)).body.meta.total).toBe(2);
    expect((await api().get('/api/v1/payment/all').set(...provider.auth)).status).toBe(403);

    // notifications: linked to the booking, unread count, mark read
    const list = await api().get('/api/v1/notifications').set(...alice.auth);
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ bookingId: booking.id, isRead: false, type: 'booking' });
    expect(list.body.meta.unread).toBeGreaterThan(0);
    const one = await api().patch(`/api/v1/notifications/${list.body.data[0].id}/read`).set(...alice.auth);
    expect(one.body.data.isRead).toBe(true);
    // can't read someone else's
    expect((await api().patch(`/api/v1/notifications/${list.body.data[0].id}/read`).set(...bob.auth)).status).toBe(404);
    await api().patch('/api/v1/notifications/read-all').set(...alice.auth);
    expect((await api().get('/api/v1/notifications/unread-count').set(...alice.auth)).body.data.unread).toBe(0);

    // dashboards after the first pass is used
    await runBookingAutomation(new Date(Date.now() + 2 * 86400000 + 60000));
    const dash = await api().get('/api/v1/dashboard/meta/provider').set(...provider.auth);
    expect(dash.status).toBe(200);
    expect(dash.body.data.bookings).toMatchObject({ total: 2, completed: 1 });
    expect(dash.body.data.earnings).toMatchObject({ balance: 80, earned: 80, platformFees: 20 });
    expect(dash.body.data.listings).toBe(1);

    const adminDash = await api().get('/api/v1/dashboard/meta/admin').set(...admin.auth);
    expect(adminDash.body.data.stats).toMatchObject({ customers: 2, providers: 1, bookings: 2, revenue: 200, platformFees: 20, platformBalance: 20 });
    expect(adminDash.body.data.charts.byCategory.find((c: any) => c.category === 'Ski_Pass').bookings).toBe(2);

    const summary = await api().get('/api/v1/wallet/get-summary').set(...admin.auth);
    expect(summary.body.data).toMatchObject({ platformFeePercent: 20, platformBalance: 20, providerBalances: 80 });
  });
});
