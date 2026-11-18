/**
 * Provider withdrawals.
 *
 *  request : the amount is RESERVED at once (taken from the wallet balance
 *            atomically), so several requests can never exceed the balance.
 *  accept  : admin paid the provider (bank transfer) -> status Paid.
 *  reject  : the reserved amount goes back to the provider's wallet.
 * The platform fee was already taken when the provider earned the money
 * (wallet/ledger.ts), so nothing is deducted here. The admin wallet holds
 * the platform's fees and is not used to pay providers.
 */
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errors/AppErro';
import { Wallet } from '../wallet/wallet.model';
import { User } from '../user/user.model';
import { WalletTransactionType } from '../wallet/wallet.interface';
import { changeBalance } from '../wallet/ledger';
import { generateTransactionId } from '../../utils/generateTransactionId';
import { Withdraw } from './withdraw.model';
import { notify } from '../notification/notify';
import { formatMoney } from '../booking/booking.rules';
import { buildMeta, getPagination, escapeRegex } from '../../shared/apiHelpers';

const round2 = (n: number) => Math.round(n * 100) / 100;
const mask = (card: unknown) => {
  const last4 = String(card ?? '').slice(-4);
  return last4 ? `•••• ${last4}` : '';
};

const toDto = (w: any) => ({
  id: String(w._id),
  amount: w.amount,
  status: w.status,
  card: mask(w.cardId),
  transactionId: w.transactionId,
  note: w.note || null,
  provider:
    w.user && typeof w.user === 'object' && w.user._id
      ? { id: String(w.user._id), name: w.user.fullName || '', email: w.user.email || '' }
      : undefined,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
});

/** POST /Withdraw/send-request { cardId, amount } (provider) */
const sendWithdrawRequest = async (user: JwtPayload, payload: any) => {
  if (user.role !== 'Provider')
    throw new AppError(StatusCodes.FORBIDDEN, 'Only providers can withdraw.');
  const amount = round2(Number(payload?.amount));
  if (!(amount >= 1)) throw new AppError(StatusCodes.BAD_REQUEST, 'amount must be at least 1.');

  const wallet: any = await Wallet.findOne({ user: user.userId }).select('walletAccounts balance').lean();
  if (!wallet) throw new AppError(StatusCodes.NOT_FOUND, 'Wallet not found.');
  const account = (wallet.walletAccounts || []).find(
    (a: any) =>
      String(a?._id) === String(payload?.cardId) || String(a?.cardNumber) === String(payload?.cardId),
  );
  if (!account) throw new AppError(StatusCodes.BAD_REQUEST, 'Choose one of your saved payout accounts (cardId).');

  // reserve the money atomically: fails if the balance is too low
  const reserved = await Wallet.updateOne(
    { user: user.userId, balance: { $gte: amount } },
    {
      $inc: { balance: -amount },
      $push: {
        transactions: {
          user: new Types.ObjectId(String(user.userId)),
          balance: amount,
          type: WalletTransactionType.WITHDRAW,
          createdAt: new Date(),
        },
      },
    },
  );
  if (!reserved.modifiedCount)
    throw new AppError(StatusCodes.BAD_REQUEST, `Insufficient balance (available ${round2(wallet.balance)}).`);

  const doc = await Withdraw.create({
    user: user.userId,
    wallet: wallet._id,
    cardId: String(account.cardNumber),
    amount,
    profitCharge: 0,
    transactionId: generateTransactionId('WD'),
  });

  const admins = await User.find({ role: 'Admin' }).select('_id').lean();
  for (const a of admins)
    await notify(a._id, {
      title: 'Withdrawal request',
      description: `A provider requested a withdrawal of ${formatMoney(amount)}.`,
      type: 'withdraw',
      senderId: user.userId,
      event: 'withdraw.requested',
    });
  return toDto(doc.toObject());
};

/** PATCH /Withdraw/accept-request { withdrawalId, status: 'accept' | 'reject', note? } (admin) */
const acceptWithdrawRequest = async (
  user: JwtPayload,
  withdrawId: string,
  decision: 'accept' | 'reject',
  note?: string,
) => {
  if (!Types.ObjectId.isValid(String(withdrawId)))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid withdrawalId.');
  if (!['accept', 'reject'].includes(decision))
    throw new AppError(StatusCodes.BAD_REQUEST, "status must be 'accept' or 'reject'.");

  const updated: any = await Withdraw.findOneAndUpdate(
    { _id: withdrawId, status: 'Pending' },
    {
      $set: {
        status: decision === 'accept' ? 'Paid' : 'Rejected',
        acceptStatus: decision,
        ...(note ? { note: String(note).slice(0, 300) } : {}),
      },
    },
    { new: true },
  ).lean();
  if (!updated) {
    const exists = await Withdraw.exists({ _id: withdrawId });
    throw new AppError(
      exists ? StatusCodes.CONFLICT : StatusCodes.NOT_FOUND,
      exists ? 'This request was already processed.' : 'Withdrawal request not found.',
    );
  }

  if (decision === 'reject')
    await changeBalance(updated.user, updated.amount, WalletTransactionType.RECEIVE, user.userId);

  await notify(updated.user, {
    title: decision === 'accept' ? 'Withdrawal paid' : 'Withdrawal rejected',
    description:
      decision === 'accept'
        ? `Your withdrawal of ${formatMoney(updated.amount)} has been paid.`
        : `Your withdrawal of ${formatMoney(updated.amount)} was rejected and returned to your balance.${note ? ` ${note}` : ''}`,
    type: 'withdraw',
    senderId: user.userId,
    event: decision === 'accept' ? 'withdraw.paid' : 'withdraw.rejected',
  });
  return toDto(updated);
};

/** GET /Withdraw/all (admin) ?status=&search=&page=&limit= */
const getAllFromDB = async (query: Record<string, any>) => {
  const { page, limit, skip } = getPagination(query);
  const filter: Record<string, any> = {};
  if (['Pending', 'Paid', 'Rejected'].includes(String(query.status))) filter.status = query.status;
  const s = escapeRegex(query.search);
  if (s) {
    const users = await User.find({
      $or: [{ email: { $regex: s, $options: 'i' } }, { fullName: { $regex: s, $options: 'i' } }],
    })
      .select('_id')
      .limit(200)
      .lean();
    filter.user = { $in: users.map(u => u._id) };
  }
  const [docs, total] = await Promise.all([
    Withdraw.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'fullName email').lean(),
    Withdraw.countDocuments(filter),
  ]);
  return { data: docs.map(toDto), meta: buildMeta(page, limit, total) };
};

/** GET /Withdraw/my (provider) */
const getMyWithdrawals = async (user: JwtPayload, query: Record<string, any>) => {
  const { page, limit, skip } = getPagination(query);
  const filter = { user: new Types.ObjectId(String(user.userId)) };
  const [docs, total] = await Promise.all([
    Withdraw.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Withdraw.countDocuments(filter),
  ]);
  return { data: docs.map(toDto), meta: buildMeta(page, limit, total) };
};

export const WithdrawService = {
  getAllFromDB,
  getMyWithdrawals,
  sendWithdrawRequest,
  acceptWithdrawRequest,
};
