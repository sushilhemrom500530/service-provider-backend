/**
 * Wallet ledger: the only place that changes wallet balances for bookings.
 * Every change is one atomic update ($inc + $push), so concurrent requests
 * can't lose money, and every change leaves a transaction line.
 *
 * Money model
 *  - The customer pays the PLATFORM (Stripe).
 *  - When a booking is completed the provider earns: price − platform fee.
 *    The platform fee (admin profitCharge %) is credited to the admin wallet.
 *  - Providers withdraw their balance (withdraw module); the admin wallet is
 *    what the platform owes nobody: its earnings.
 */
import { Types } from 'mongoose';
import { Wallet } from './wallet.model';
import { WalletTransactionType } from './wallet.interface';
import { User } from '../user/user.model';
import { splitPlatformFee } from '../../utils/platformFee';

const round2 = (n: number) => Math.round(n * 100) / 100;
const toId = (v: any) => new Types.ObjectId(String(v?._id ?? v));

/** Add (or with a negative amount, remove) money from a user's wallet */
export const changeBalance = async (
  userId: any,
  amount: number,
  type: WalletTransactionType,
  counterpart: any,
) => {
  const value = round2(Number(amount) || 0);
  if (!userId || value === 0) return;
  await Wallet.updateOne(
    { user: toId(userId) },
    {
      $inc: { balance: value },
      $push: {
        transactions: {
          user: toId(counterpart || userId),
          balance: Math.abs(value),
          type,
          createdAt: new Date(),
        },
      },
    },
    { upsert: true },
  );
};

/** The platform (admin) user id, or null when there is no admin */
export const getAdminUserId = async (): Promise<Types.ObjectId | null> => {
  const admins = await User.find({ role: 'Admin' }).select('_id').lean();
  if (!admins.length) return null;
  // prefer the admin that already has a wallet
  const wallet: any = await Wallet.findOne({ user: { $in: admins.map(a => a._id) } })
    .select('user')
    .lean();
  return (wallet?.user as Types.ObjectId) ?? (admins[0]._id as Types.ObjectId);
};

/**
 * Pay a provider for a booking (or a late fee): net to the provider; the
 * platform commission (a % of `gross`) plus any `serviceFee` (platform
 * money the customer paid on top, e.g. the restaurant service fee) to the
 * admin wallet.
 * Returns { net, fee: everything the platform keeps, commission, serviceFee, percent }.
 */
export const payProvider = async (
  providerId: any,
  gross: number,
  customerId: any,
  serviceFee = 0,
) => {
  const split = await splitPlatformFee(gross);
  const extra = Math.max(0, Math.round((Number(serviceFee) || 0) * 100) / 100);
  if (split.net > 0) await changeBalance(providerId, split.net, WalletTransactionType.EARN, customerId);
  const platform = Math.round((split.fee + extra) * 100) / 100;
  if (platform > 0) {
    const adminId = await getAdminUserId();
    if (adminId) await changeBalance(adminId, platform, WalletTransactionType.EARN, providerId);
  }
  return { net: split.net, fee: platform, commission: split.fee, serviceFee: extra, percent: split.percent };
};

/** Undo payProvider (booking cancelled after the provider was paid) */
export const reverseProviderPayment = async (
  providerId: any,
  net: number,
  fee: number,
  customerId: any,
) => {
  await changeBalance(providerId, -Math.abs(net), WalletTransactionType.SEND, customerId);
  if (fee > 0) {
    const adminId = await getAdminUserId();
    if (adminId) await changeBalance(adminId, -Math.abs(fee), WalletTransactionType.SEND, providerId);
  }
};
