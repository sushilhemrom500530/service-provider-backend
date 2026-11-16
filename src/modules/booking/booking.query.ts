/**
 * Reading bookings: customer tabs, provider tabs, one booking, admin list.
 * Filtering happens in MongoDB (never "load everything then filter").
 */
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errors/AppErro';
import { Booking } from './booking.model';
import { buildMeta, getPagination } from '../../shared/apiHelpers';
import { listingIdsOfOwner } from './booking.availability';
import { listingOfBooking } from './booking.lifecycle';
import { loadContext, toBookingCard, toBookingDetail } from './booking.serializer';
import { OPEN_STATUSES, Viewer, startOfLocalDay, endOfLocalDay, toDayKey } from './booking.rules';

const CATEGORIES = ['Ski_Pass', 'Ski_Hire', 'Transport', 'Restaurant', 'Massage'];
const CANCELLED = ['Cancelled', 'Deleted', 'Cancel'];

/**
 * Tab filters (both sides):
 *  requests  : waiting for provider approval (provider side)
 *  upcoming  : open, not started yet
 *  active    : open and started (in progress / overdue rentals)
 *  past      : completed
 *  cancelled : cancelled / rejected / expired
 */
const tabFilter = (tab: unknown, now = new Date()): Record<string, any> => {
  switch (String(tab || '')) {
    case 'requests':
      return { bookingStatus: { $in: OPEN_STATUSES }, isPermitted: { $ne: true } };
    case 'upcoming':
      return { bookingStatus: { $in: OPEN_STATUSES }, startAt: { $gt: now }, isHandOver: { $ne: true } };
    case 'active':
      return {
        bookingStatus: { $in: OPEN_STATUSES },
        $or: [{ startAt: { $lte: now } }, { isHandOver: true }],
      };
    case 'past':
      return { bookingStatus: 'Completed' };
    case 'cancelled':
      return { bookingStatus: { $in: CANCELLED } };
    case 'open':
      return { bookingStatus: { $in: OPEN_STATUSES } };
    default:
      return {};
  }
};

const sortFor = (tab: unknown): Record<string, 1 | -1> =>
  ['upcoming', 'active', 'requests'].includes(String(tab)) ? { startAt: 1, createdAt: 1 } : { createdAt: -1 };

const commonFilter = (query: Record<string, any>) => {
  const f: Record<string, any> = {};
  if (query.category && CATEGORIES.includes(String(query.category))) f.category = String(query.category);
  const day = query.date ? toDayKey(query.date) : null;
  if (day) {
    // bookings running on that local day
    f.startAt = { ...(f.startAt || {}), $lte: endOfLocalDay(day) };
    f.endAt = { $gte: startOfLocalDay(day) };
  }
  return f;
};

const page = async (filter: Record<string, any>, query: Record<string, any>, viewer: Viewer) => {
  const { page: p, limit, skip } = getPagination(query);
  const [docs, total] = await Promise.all([
    Booking.find(filter).sort(sortFor(query.tab)).skip(skip).limit(limit).lean(),
    Booking.countDocuments(filter),
  ]);
  const ctx = await loadContext(docs);
  const now = new Date();
  return {
    data: docs.map(b => toBookingCard(b, viewer, ctx, now)),
    meta: buildMeta(p, limit, total),
  };
};

/** GET /booking/my?tab=&category=&date=  (customer) */
export const getMyBookings = async (user: JwtPayload, query: Record<string, any>) => {
  const filter = and({ user: new Types.ObjectId(String(user.userId)) }, tabFilter(query.tab), commonFilter(query));
  return page(filter, query, 'customer');
};

/** GET /booking/provider?tab=&category=&date=  (provider: bookings of my listings) */
export const getProviderBookings = async (user: JwtPayload, query: Record<string, any>) => {
  const ids = await listingIdsOfOwner(user.userId);
  const filter = and({ product: { $in: ids } }, tabFilter(query.tab), commonFilter(query));
  return page(filter, query, 'provider');
};

/** GET /booking/all  (admin) ?tab=&category=&userId=&productId= */
export const getAllBookingsAdmin = async (query: Record<string, any>) => {
  const filter: Record<string, any> = {};
  if (query.userId && Types.ObjectId.isValid(String(query.userId)))
    filter.user = new Types.ObjectId(String(query.userId));
  if (query.productId && Types.ObjectId.isValid(String(query.productId)))
    filter.product = new Types.ObjectId(String(query.productId));
  return page(and(filter, tabFilter(query.tab), commonFilter(query)), query, 'admin');
};

/** tab + date filters can both set startAt: combine them with $and */
const and = (...parts: Record<string, any>[]) => {
  const list = parts.filter(p => p && Object.keys(p).length);
  return list.length ? { $and: list } : {};
};

/** GET /booking/:id: the customer, the listing's provider or an admin */
export const getBookingById = async (bookingId: string, user: JwtPayload) => {
  if (!Types.ObjectId.isValid(String(bookingId)))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid booking id.');
  const booking: any = await Booking.findById(bookingId).lean();
  if (!booking) throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');

  let viewer: Viewer;
  if (user.role === 'Admin') viewer = 'admin';
  else if (String(booking.user) === String(user.userId)) viewer = 'customer';
  else {
    const listing: any = await listingOfBooking(booking);
    if (!listing || String(listing.owner) !== String(user.userId))
      throw new AppError(StatusCodes.FORBIDDEN, 'You do not have access to this booking.');
    viewer = 'provider';
  }
  const ctx = await loadContext([booking]);
  return toBookingDetail(booking, viewer, ctx);
};
