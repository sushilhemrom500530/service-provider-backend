/**
 * Account deletion (App Store requirement) and the auth answers from the
 * QA retest of 17 Nov 2026.
 */
import { api, makeAdmin, makeCustomer, makeProvider, daysFromNow, TestUser } from '../../test/factories';
import { payIntent } from '../../test/stripeMock';
import { makeSkiHireListing } from '../../test/listingFixtures';
import { User } from './user.model';
import { Wallet } from '../wallet/wallet.model';
import { Withdraw } from '../withdraw/withdraw.model';
import { Token } from '../token/token.model';
import { Notification } from '../notification/notification.model';
import { SkiHire } from '../skiHire/skihire.model';
import { Booking } from '../booking/booking.model';

const B = '/api/v1/booking';
const DEL = '/api/v1/users/me';

/** customer books the provider's ski hire (paid, Pending) */
const book = async (customer: TestUser, hire: any) => {
  const body = {
    productId: String(hire._id),
    startDateAndTime: daysFromNow(4, 9).toISOString(),
    endDateAndTime: daysFromNow(5, 9).toISOString(),
    bookingItems: [{ itemId: String(hire.items[0]._id), quantity: 1 }],
  };
  const intent = await api().post(`${B}/intent`).set(...customer.auth).send(body);
  payIntent(intent.body.data.paymentIntentId);
  const created = await api().post(`${B}/create`).set(...customer.auth)
    .send({ ...body, paymentIntentId: intent.body.data.paymentIntentId });
  expect(created.status).toBe(201);
  return created.body.data.id as string;
};

beforeEach(async () => {
  await makeAdmin();
});

describe('DELETE /users/me', () => {
  it('customer: refused with an open booking, deleted once it is cancelled', async () => {
    const provider = await makeProvider('Ski_Hire');
    const customer = await makeCustomer();
    const email = customer.doc.email;
    const hire = await makeSkiHireListing(provider.id);
    const id = await book(customer, hire);

    const refused = await api().delete(DEL).set(...customer.auth);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/1 upcoming or active booking/);

    await api().patch(`${B}/${id}/cancel`).set(...customer.auth);
    await Wallet.updateOne({ user: customer.id }, { $push: { walletAccounts: { accountType: 'Bank', cardNumber: 1234, cardHolderName: 'X' } } });

    const res = await api().delete(DEL).set(...customer.auth);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Your account has been deleted.');
    expect(res.body.data.deletedAt).toBeTruthy();

    // personal data gone, record kept anonymised for the booking history
    const u: any = await User.findById(customer.id).lean();
    expect(u).toMatchObject({ fullName: 'Deleted user', phoneNumber: '', address: '', status: 'Delete', isDeleted: true });
    expect(u.email).toBe(`deleted-${customer.id}@deleted.invalid`);
    expect(u.deletedAt).toBeTruthy();
    expect(await User.exists({ email })).toBeNull(); // the email can sign up again
    expect(((await Wallet.findOne({ user: customer.id }).lean()) as any).walletAccounts).toHaveLength(0);
    expect(await Token.countDocuments({ user: customer.id })).toBe(0);
    expect(await Notification.countDocuments({ receiverId: customer.id })).toBe(0);
    expect(await Booking.exists({ _id: id, user: customer.id })).toBeTruthy();

    // the old session ends (401: the app logs out), login with the old email fails
    expect((await api().get('/api/v1/users/profile/me').set(...customer.auth)).status).toBe(401);
    const login = await api().post('/api/v1/auth/login').send({ email, password: 'secret123' });
    expect(login.status).toBe(400);

    // the provider sees "Deleted user" on the booking
    const seen = await api().get(`${B}/${id}`).set(...provider.auth);
    expect(seen.body.data.customer.name).toBe('Deleted user');
  });

  it('customer: refused while a late fee is unpaid', async () => {
    const provider = await makeProvider('Ski_Hire');
    const customer = await makeCustomer();
    const hire = await makeSkiHireListing(provider.id);
    const id = await book(customer, hire);
    await Booking.updateOne({ _id: id }, { $set: { bookingStatus: 'Completed', completedAt: new Date(), lateFee: { hours: 1, amount: 10, status: 'due' } } });
    const res = await api().delete(DEL).set(...customer.auth);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/late fee/);
  });

  it('provider: refused with open bookings, money or a pending withdrawal; then listings are taken down', async () => {
    const provider = await makeProvider('Ski_Hire');
    const customer = await makeCustomer();
    const hire = await makeSkiHireListing(provider.id);
    const id = await book(customer, hire);
    await Wallet.updateOne({ user: provider.id }, { $set: { balance: 42.5 } });
    await Withdraw.create({ user: provider.id, cardId: 'c1', amount: 10, profitCharge: 0, transactionId: 'WD-1', status: 'Pending' } as any);

    const refused = await api().delete(DEL).set(...provider.auth);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/Your listings have 1 upcoming or active booking/);
    expect(refused.body.message).toMatch(/wallet still holds 42.5/);
    expect(refused.body.message).toMatch(/withdrawal is still being processed/);
    expect(((await User.findById(provider.id).lean()) as any).status).toBe('Active'); // nothing changed

    await api().patch(`${B}/${id}/reject`).set(...provider.auth);
    await Wallet.updateOne({ user: provider.id }, { $set: { balance: 0 } });
    await Withdraw.updateMany({ user: provider.id }, { $set: { status: 'Rejected' } });

    expect((await api().delete(DEL).set(...provider.auth)).status).toBe(200);
    expect(await SkiHire.findById(hire._id).lean()).toMatchObject({ isDeleted: true, isActive: false });
    expect((await api().get(`/api/v1/ski-hire/${hire._id}`)).status).toBe(404);
  });

  it('admin accounts are not deleted from the app; the old path still works', async () => {
    const admin = await makeAdmin();
    expect((await api().delete(DEL).set(...admin.auth)).status).toBe(403);

    const customer = await makeCustomer();
    // old path: the id in the URL is ignored, only the caller is deleted
    const other = await makeCustomer();
    expect((await api().delete(`/api/v1/users/delete/${other.id}`).set(...customer.auth)).status).toBe(200);
    expect(((await User.findById(customer.id).lean()) as any).status).toBe('Delete');
    expect(((await User.findById(other.id).lean()) as any).status).toBe('Active');
  });
});

describe('Auth answers', () => {
  it('change password with a wrong current password -> 400 (not 401: no logout)', async () => {
    const customer = await makeCustomer();
    const res = await api().post('/api/v1/auth/change-password').set(...customer.auth)
      .send({ currentPassword: 'wrong-pass', newPassword: 'another123' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Current password is incorrect.');
  });

  it('login with a wrong password -> 400 "Password is incorrect."', async () => {
    const customer = await makeCustomer();
    const res = await api().post('/api/v1/auth/login').send({ email: customer.doc.email, password: 'wrong-pass' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Password is incorrect.');
  });

  it('sign-up with an existing email -> 400 "User already exists." and the account is unchanged', async () => {
    const customer = await makeCustomer();
    const before: any = await User.findById(customer.id).select('+password').lean();
    const res = await api().post('/api/v1/auth/register').send({
      fullName: 'Someone Else',
      email: customer.doc.email,
      password: 'hijack123',
      role: 'User',
      phoneNumber: '+33600000000',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('User already exists.');
    const after: any = await User.findById(customer.id).select('+password').lean();
    expect(after.fullName).toBe(before.fullName);
    expect(after.password).toBe(before.password);
  });
});
