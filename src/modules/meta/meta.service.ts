/**
 * Dashboards, computed from bookings with MongoDB aggregations
 * (never by loading every booking into memory).
 *
 *  GET /dashboard/meta/provider : provider home (counts, earnings, today, recent)
 *  GET /dashboard/meta/admin    : platform overview (+ ?year= chart)
 *  GET /dashboard/meta/common-service | restaurant-service : admin booking lists
 *  GET /dashboard/meta/service/:id : one booking (admin)
 */
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errors/AppErro';
import { Booking } from '../booking/booking.model';
import { User } from '../user/user.model';
import { Wallet } from '../wallet/wallet.model';
import { listingIdsOfOwner, LISTING_MODELS } from '../booking/booking.availability';
import { loadContext, toBookingCard } from '../booking/booking.serializer';
import { BookingService } from '../booking/booking.service';
import { OPEN_STATUSES, startOfLocalDay, endOfLocalDay, toDayKey } from '../booking/booking.rules';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const getProviderDashboard = async (user: JwtPayload, query: Record<string, any> = {}) => {
  const ownerId = String(query.providerId && user.role === 'Admin' ? query.providerId : user.userId);
  const ids = await listingIdsOfOwner(ownerId);
  const now = new Date();
  const today = toDayKey(now)!;

  const [counts, money, todays, recent, wallet, listings] = await Promise.all([
    Booking.aggregate([
      { $match: { product: { $in: ids } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          requests: {
            $sum: { $cond: [{ $and: [{ $in: ['$bookingStatus', OPEN_STATUSES] }, { $ne: ['$isPermitted', true] }] }, 1, 0] },
          },
          upcoming: {
            $sum: {
              $cond: [
                { $and: [{ $in: ['$bookingStatus', OPEN_STATUSES] }, { $eq: ['$isPermitted', true] }, { $gt: ['$startAt', now] }] },
                1,
                0,
              ],
            },
          },
          inProgress: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$bookingStatus', OPEN_STATUSES] },
                    { $eq: ['$isPermitted', true] },
                    { $or: [{ $eq: ['$isHandOver', true] }, { $lte: ['$startAt', now] }] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          completed: { $sum: { $cond: [{ $eq: ['$bookingStatus', 'Completed'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $in: ['$bookingStatus', ['Cancelled', 'Deleted', 'Cancel']] }, 1, 0] } },
        },
      },
    ]),
    Booking.aggregate([
      { $match: { product: { $in: ids } } },
      {
        $group: {
          _id: null,
          earned: { $sum: { $add: [{ $ifNull: ['$providerEarning', 0] }, { $ifNull: ['$lateFee.providerEarning', 0] }] } },
          fees: { $sum: { $add: [{ $ifNull: ['$platformFee', 0] }, { $ifNull: ['$lateFee.platformFee', 0] }] } },
          // money still to be paid out for these bookings (before commission), service fee excluded
          pending: {
            $sum: {
              $cond: [
                { $eq: ['$providerPayout', 'held'] },
                { $subtract: [{ $ifNull: ['$totalPrice', 0] }, { $ifNull: ['$serviceFee', 0] }] },
                0,
              ],
            },
          },
          lateFeesDue: { $sum: { $cond: [{ $eq: ['$lateFee.status', 'due'] }, { $ifNull: ['$lateFee.amount', 0] }, 0] } },
        },
      },
    ]),
    Booking.find({
      product: { $in: ids },
      bookingStatus: { $in: [...OPEN_STATUSES, 'Completed'] },
      startAt: { $lte: endOfLocalDay(today) },
      endAt: { $gte: startOfLocalDay(today) },
    })
      .sort({ startAt: 1 })
      .limit(20)
      .lean(),
    Booking.find({ product: { $in: ids } }).sort({ createdAt: -1 }).limit(5).lean(),
    Wallet.findOne({ user: ownerId }).select('balance').lean(),
    Promise.all(
      Object.values(LISTING_MODELS).map(({ model }) =>
        model.countDocuments({ owner: new Types.ObjectId(ownerId), isDeleted: { $ne: true } }),
      ),
    ),
  ]);

  const ctx = await loadContext([...todays, ...recent]);
  const c = counts[0] || {};
  const m = money[0] || {};
  return {
    bookings: {
      total: c.total || 0,
      requests: c.requests || 0,
      upcoming: c.upcoming || 0,
      inProgress: c.inProgress || 0,
      completed: c.completed || 0,
      cancelled: c.cancelled || 0,
    },
    earnings: {
      balance: round2((wallet as any)?.balance),
      earned: round2(m.earned),
      platformFees: round2(m.fees),
      pending: round2(m.pending),
      lateFeesDue: round2(m.lateFeesDue),
    },
    listings: listings.reduce((s: number, n: number) => s + n, 0),
    today: todays.map(b => toBookingCard(b, 'provider', ctx, now)),
    recent: recent.map(b => toBookingCard(b, 'provider', ctx, now)),
  };
};

const getAdminDashboard = async (_user: JwtPayload, query: Record<string, any> = {}) => {
  const year = Number(query?.year) || new Date().getFullYear();
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const paidStatuses = ['Active', 'Pending', 'Completed'];

  const [users, providers, byMonth, byCategory, totals, adminWallets] = await Promise.all([
    User.countDocuments({ role: 'User', isDeleted: { $ne: true } }),
    User.countDocuments({ role: 'Provider', isDeleted: { $ne: true } }),
    Booking.aggregate([
      { $match: { createdAt: { $gte: from, $lt: to }, bookingStatus: { $in: paidStatuses } } },
      {
        $group: {
          _id: { $month: '$createdAt' },
          revenue: { $sum: '$totalPrice' },
          fees: { $sum: { $ifNull: ['$platformFee', 0] } },
          bookings: { $sum: 1 },
        },
      },
    ]),
    Booking.aggregate([
      { $match: { createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: '$category', bookings: { $sum: 1 }, revenue: { $sum: { $cond: [{ $in: ['$bookingStatus', paidStatuses] }, '$totalPrice', 0] } } } },
    ]),
    Booking.aggregate([
      {
        $group: {
          _id: null,
          bookings: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $in: ['$bookingStatus', paidStatuses] }, '$totalPrice', 0] } },
          fees: { $sum: { $add: [{ $ifNull: ['$platformFee', 0] }, { $ifNull: ['$lateFee.platformFee', 0] }] } },
          refunds: { $sum: { $ifNull: ['$refundAmount', 0] } },
        },
      },
    ]),
    Wallet.find({ user: { $in: (await User.find({ role: 'Admin' }).select('_id').lean()).map(a => a._id) } })
      .select('balance')
      .lean(),
  ]);

  const t = totals[0] || {};
  return {
    stats: {
      customers: users,
      providers,
      bookings: t.bookings || 0,
      revenue: round2(t.revenue),
      platformFees: round2(t.fees),
      refunds: round2(t.refunds),
      platformBalance: round2(adminWallets.reduce((s: number, w: any) => s + (Number(w.balance) || 0), 0)),
    },
    charts: {
      year,
      monthly: MONTHS.map((month, i) => {
        const r = byMonth.find((x: any) => x._id === i + 1) || {};
        return { month, revenue: round2(r.revenue), platformFees: round2(r.fees), bookings: r.bookings || 0 };
      }),
      byCategory: ['Ski_Pass', 'Ski_Hire', 'Transport', 'Restaurant', 'Massage'].map(category => {
        const r = byCategory.find((x: any) => x._id === category) || {};
        return { category, bookings: r.bookings || 0, revenue: round2(r.revenue) };
      }),
    },
  };
};

/** Admin booking lists (web panel): all non-restaurant / restaurant bookings */
const getCommonService = async (_user: JwtPayload, query: Record<string, any> = {}) =>
  BookingService.getAllBookingsAdmin(query);

const getRestaurantManagement = async (_user: JwtPayload, query: Record<string, any> = {}) =>
  BookingService.getAllBookingsAdmin({ ...query, category: 'Restaurant' });

const getSingleService = async (user: JwtPayload, bookingId: string) => {
  if (!Types.ObjectId.isValid(String(bookingId)))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid booking id.');
  return BookingService.getBookingById(bookingId, user);
};

export const MetaService = {
  getProviderDashboard,
  getAdminDashboard,
  getCommonService,
  getRestaurantManagement,
  getSingleService,
};
