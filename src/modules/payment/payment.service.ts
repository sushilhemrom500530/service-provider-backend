/**
 * Payments are a financial record: one per Stripe payment (booking or late
 * fee). Customers see their own; the admin sees all. They are never deleted.
 */
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errors/AppErro';
import { Payment } from './payment.model';
import { User } from '../user/user.model';
import { buildMeta, escapeRegex, getPagination } from '../../shared/apiHelpers';

const toDto = (p: any, admin: boolean) => ({
  id: String(p._id),
  bookingId: p.booking ? String(p.booking?._id ?? p.booking) : null,
  purpose: p.purpose || 'booking',
  amount: p.amount,
  refundedAmount: p.refundedAmount || 0,
  currency: p.currency,
  status: p.status,
  method: p.paymentMethodType,
  transactionId: p.transactionId,
  customer:
    admin && p.user && typeof p.user === 'object' && p.user._id
      ? { id: String(p.user._id), name: p.user.fullName || '', email: p.user.email || '' }
      : undefined,
  createdAt: p.createdAt,
  refundedAt: p.refundedAt || null,
});

/** GET /payment/all  ?status=&purpose=&search=(admin)&page=&limit= */
const getAllPayment = async (user: JwtPayload, query: Record<string, any>) => {
  const admin = user.role === 'Admin';
  const { page, limit, skip } = getPagination(query);
  const filter: Record<string, any> = {};
  if (!admin) filter.user = new Types.ObjectId(String(user.userId));
  if (query.status) filter.status = String(query.status);
  if (['booking', 'late_fee'].includes(String(query.purpose))) filter.purpose = query.purpose;
  const s = escapeRegex(query.search);
  if (admin && s) {
    const users = await User.find({
      $or: [{ email: { $regex: s, $options: 'i' } }, { fullName: { $regex: s, $options: 'i' } }],
    })
      .select('_id')
      .limit(200)
      .lean();
    filter.$or = [{ user: { $in: users.map(u => u._id) } }, { transactionId: { $regex: s, $options: 'i' } }];
  }
  const [docs, total] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(admin ? { path: 'user', select: 'fullName email' } : [])
      .lean(),
    Payment.countDocuments(filter),
  ]);
  return { data: docs.map(p => toDto(p, admin)), meta: buildMeta(page, limit, total) };
};

/** GET /payment/:id (admin) */
const paymentFindById = async (paymentId: string) => {
  if (!Types.ObjectId.isValid(String(paymentId)))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid payment id.');
  const doc: any = await Payment.findById(paymentId).populate('user', 'fullName email').lean();
  if (!doc) throw new AppError(StatusCodes.NOT_FOUND, 'Payment not found.');
  return toDto(doc, true);
};

export const PaymentService = {
  getAllPayment,
  paymentFindById,
};
