/**
 * Wallet endpoints.
 *  - Provider wallet: what the platform owes the provider (earnings after the
 *    platform fee, minus withdrawals).
 *  - Admin wallet: the platform's fees.
 *  - profitCharge: platform fee % (set by the admin, stored on admin wallets).
 * Balance changes for bookings happen only in wallet/ledger.ts.
 */
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errors/AppErro';
import { Wallet } from './wallet.model';
import { User } from '../user/user.model';
import { Booking } from '../booking/booking.model';
import { Withdraw } from '../withdraw/withdraw.model';
import { getPlatformFeePercent } from '../../utils/platformFee';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const mask = (card: unknown) => {
  const last4 = String(card ?? '').slice(-4);
  return last4 ? `•••• ${last4}` : '';
};

const toAccount = (a: any) => ({
  id: a?._id ? String(a._id) : undefined,
  accountType: a?.accountType,
  cardHolderName: a?.cardHolderName,
  card: mask(a?.cardNumber),
  createdAt: a?.createdAt,
});

const walletOf = async (userId: string) => {
  const wallet: any = await Wallet.findOne({ user: userId }).select('-transactions -__v').lean();
  if (wallet) return wallet;
  // every user should have one (created at sign-up); create it if missing
  return (await Wallet.create({ user: userId, balance: 0 })).toObject();
};

/** PATCH /wallet/update-profit { profit } (admin): platform fee % */
const updateProfit = async (_user: JwtPayload, profit: unknown) => {
  const percent = Number(profit);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100)
    throw new AppError(StatusCodes.BAD_REQUEST, 'profit must be a percentage between 0 and 100.');
  const admins = await User.find({ role: 'Admin' }).select('_id').lean();
  if (!admins.length) throw new AppError(StatusCodes.NOT_FOUND, 'Admin user not found.');
  for (const a of admins)
    await Wallet.updateOne({ user: a._id }, { $set: { profitCharge: percent } }, { upsert: true });
  return { platformFeePercent: percent };
};

/** POST /wallet/add: save a payout account (provider) */
const addWallet = async (user: JwtPayload, payload: any) => {
  const cardNumber = String(payload?.cardNumber ?? '').replace(/\s+/g, '');
  if (!/^\d{4,34}$/.test(cardNumber))
    throw new AppError(StatusCodes.BAD_REQUEST, 'cardNumber must contain digits only.');
  const wallet: any = await walletOf(String(user.userId));
  if ((wallet.walletAccounts || []).some((a: any) => String(a.cardNumber) === cardNumber))
    throw new AppError(StatusCodes.CONFLICT, 'This payout account already exists.');
  await Wallet.updateOne(
    { _id: wallet._id },
    {
      $push: {
        walletAccounts: {
          accountType: String(payload.accountType || 'Card'),
          cardNumber: Number(cardNumber),
          cardHolderName: String(payload.cardHolderName || ''),
          createdAt: new Date(),
        },
      },
    },
  );
  return getMyWalletAccount(user);
};

/** GET /wallet/get-my-account: balance + payout accounts (masked) */
const getMyWalletAccount = async (user: JwtPayload) => {
  const wallet: any = await walletOf(String(user.userId));
  const accounts = [...(wallet.walletAccounts || [])].sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return { balance: round2(wallet.balance), accounts: accounts.map(toAccount) };
};

/** GET /wallet/get-balance */
const getBalanceById = async (user: JwtPayload) => {
  const wallet: any = await walletOf(String(user.userId));
  return { balance: round2(wallet.balance) };
};

/** GET /wallet/get-summary (admin): platform money overview */
const getWalletSummary = async (_user: JwtPayload) => {
  const admins = await User.find({ role: 'Admin' }).select('_id').lean();
  const adminIds = admins.map(a => a._id);
  const [adminWallets, providerOwed, fees, pending, paid] = await Promise.all([
    Wallet.find({ user: { $in: adminIds } }).select('balance').lean(),
    Wallet.aggregate([
      { $match: { user: { $nin: adminIds } } },
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]),
    Booking.aggregate([
      {
        $group: {
          _id: null,
          bookingFees: { $sum: { $ifNull: ['$platformFee', 0] } },
          lateFees: { $sum: { $ifNull: ['$lateFee.platformFee', 0] } },
          held: {
            $sum: {
              $cond: [{ $eq: ['$providerPayout', 'held'] }, { $ifNull: ['$totalPrice', 0] }, 0],
            },
          },
        },
      },
    ]),
    Withdraw.aggregate([{ $match: { status: 'Pending' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Withdraw.aggregate([{ $match: { status: 'Paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  const f = fees[0] || {};
  return {
    platformFeePercent: await getPlatformFeePercent(),
    platformBalance: round2(adminWallets.reduce((s: number, w: any) => s + (Number(w.balance) || 0), 0)),
    platformFeesEarned: round2((f.bookingFees || 0) + (f.lateFees || 0)),
    providerBalances: round2(providerOwed[0]?.total || 0),
    heldForUpcomingBookings: round2(f.held || 0),
    pendingWithdrawals: round2(pending[0]?.total || 0),
    paidWithdrawals: round2(paid[0]?.total || 0),
  };
};

export const WalletService = {
  updateProfit,
  addWallet,
  getMyWalletAccount,
  getBalanceById,
  getWalletSummary,
};


