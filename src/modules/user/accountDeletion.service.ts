/**
 * Account deletion (DELETE /users/me), required by the App Store for apps
 * with sign-up.
 *
 * Refused (409, with every reason) while something still needs the account:
 *  - customer: an upcoming / active booking, or an unpaid late fee
 *  - provider: an upcoming / active booking on one of their listings,
 *    money in the wallet, or a withdrawal still being processed
 * Admin accounts are not deleted from the app.
 *
 * What happens:
 *  - personal data is removed: name, email, phone, address, photo, bank
 *    accounts, notifications, sessions. The email is freed (sign-up again works).
 *  - provider listings are taken down (soft delete).
 *  - the user record stays, anonymised, with status "Delete": bookings,
 *    payments and reviews are financial / public history and keep pointing
 *    to it (shown as "Deleted user"). Old tokens stop working at once.
 */
import crypto from 'crypto';
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import AppError from '../../errors/AppErro';
import { User } from './user.model';
import { UserStatus } from './user.interface';
import { Booking } from '../booking/booking.model';
import { OPEN_STATUSES } from '../booking/booking.rules';
import { LISTING_MODELS } from '../booking/booking.availability';
import { Wallet } from '../wallet/wallet.model';
import { Withdraw } from '../withdraw/withdraw.model';
import { Token } from '../token/token.model';
import { Notification } from '../notification/notification.model';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Ids of every listing the user owns (all services) */
const listingIdsOf = async (userId: Types.ObjectId) => {
  const ids: Types.ObjectId[] = [];
  for (const { model } of Object.values(LISTING_MODELS)) {
    const docs: any[] = await model.find({ owner: userId }).select('_id').lean();
    ids.push(...docs.map(d => d._id));
  }
  return ids;
};

/** Why the account can't be deleted yet (empty = it can) */
export const deletionBlockers = async (user: any): Promise<string[]> => {
  const reasons: string[] = [];
  const open = await Booking.countDocuments({ user: user._id, bookingStatus: { $in: OPEN_STATUSES } });
  if (open)
    reasons.push(`You have ${open} upcoming or active booking(s). Cancel them or wait until they are finished.`);
  if (await Booking.exists({ user: user._id, 'lateFee.status': 'due' }))
    reasons.push('Please pay your outstanding late fee first.');

  if (user.role === 'Provider') {
    const listings = await listingIdsOf(user._id);
    const onListings = listings.length
      ? await Booking.countDocuments({ product: { $in: listings }, bookingStatus: { $in: OPEN_STATUSES } })
      : 0;
    if (onListings)
      reasons.push(`Your listings have ${onListings} upcoming or active booking(s). Finish or reject them first.`);
    const wallet: any = await Wallet.findOne({ user: user._id }).select('balance').lean();
    const balance = round2(wallet?.balance);
    if (balance > 0) reasons.push(`Your wallet still holds ${balance}. Withdraw it first.`);
    if (await Withdraw.exists({ user: user._id, status: 'Pending' }))
      reasons.push('A withdrawal is still being processed. Wait until it is paid or rejected.');
  }
  return reasons;
};

export const deleteMyAccount = async (userId: string) => {
  if (!Types.ObjectId.isValid(String(userId))) throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid user.');
  const user: any = await User.findById(userId).select('+password');
  if (!user || user.isDeleted || user.status === UserStatus.Delete)
    throw new AppError(StatusCodes.NOT_FOUND, 'Account not found.');
  if (user.role === 'Admin')
    throw new AppError(StatusCodes.FORBIDDEN, 'Admin accounts cannot be deleted from the app.');

  const reasons = await deletionBlockers(user);
  if (reasons.length) throw new AppError(StatusCodes.CONFLICT, reasons.join(' '));

  const id = user._id as Types.ObjectId;
  const deletedAt = new Date();

  // 1. the account itself: anonymised and locked (email freed)
  user.fullName = 'Deleted user';
  user.email = `deleted-${String(id)}@deleted.invalid`;
  user.phoneNumber = '';
  user.address = '';
  user.profileUrl = (User.schema.path('profileUrl') as any)?.defaultValue ?? '';
  user.password = crypto.randomBytes(32).toString('hex'); // hashed by the model
  user.status = UserStatus.Delete;
  user.isDeleted = true;
  user.deletedAt = deletedAt;
  user.service = undefined;
  await user.save();

  // 2. what hangs on it
  if (user.role === 'Provider')
    for (const { model } of Object.values(LISTING_MODELS))
      await model.updateMany({ owner: id }, { $set: { isDeleted: true, isActive: false } });
  await Promise.all([
    Wallet.updateOne({ user: id }, { $set: { walletAccounts: [] } }),
    Token.deleteMany({ user: id }),
    Notification.deleteMany({ receiverId: id }),
  ]);

  return { deletedAt };
};
