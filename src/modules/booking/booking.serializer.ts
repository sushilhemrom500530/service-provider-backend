/**
 * The booking object the app receives. One shape for all categories; fields
 * that don't apply to a category are null. Internal fields (payout state,
 * drafts, __v…) are never sent.
 */
import { Types } from 'mongoose';
import { config } from '../../config';
import { User } from '../user/user.model';
import { LISTING_MODELS, MODEL_TO_CATEGORY, hourlyRateOf } from './booking.availability';
import {
  Viewer,
  allowedActions,
  computeSchedule,
  deriveStatus,
  formatDuration,
  formatTime,
  rentalTimer,
  toDayKey,
} from './booking.rules';
import { toContactUser } from '../../shared/apiHelpers';

type Ctx = {
  listings: Map<string, any>;
  users: Map<string, any>;
  /** listingId -> ids of the customers who already reviewed it */
  reviewers: Map<string, Set<string>>;
};

const categoryOf = (b: any) => b.category || MODEL_TO_CATEGORY[b.productModel];

/** Load the listings + users a page of bookings needs (a few queries, no N+1) */
export const loadContext = async (bookings: any[]): Promise<Ctx> => {
  const byCategory = new Map<string, Set<string>>();
  for (const b of bookings) {
    const c = categoryOf(b);
    if (!byCategory.has(c)) byCategory.set(c, new Set());
    byCategory.get(c)!.add(String(b.product));
  }
  const listings = new Map<string, any>();
  const reviewers = new Map<string, Set<string>>();
  const customerIds = [...new Set(bookings.map(b => String(b.user)))];
  await Promise.all(
    [...byCategory.entries()].map(async ([c, ids]) => {
      const entry = LISTING_MODELS[c];
      if (!entry) return;
      const [docs, reviewed]: [any[], any[]] = await Promise.all([
        entry.model.find({ _id: { $in: [...ids] } }).select('-reviews -refunds -__v').lean(),
        // only the reviewer ids of these bookings' customers (not the reviews)
        entry.model
          .aggregate([
            { $match: { _id: { $in: [...ids].map(id => new Types.ObjectId(id)) } } },
            { $project: { userIds: '$reviews.userId' } },
          ]),
      ]);
      for (const d of docs) listings.set(String(d._id), d);
      for (const r of reviewed) {
        const mine = (r.userIds || []).map(String).filter((u: string) => customerIds.includes(u));
        reviewers.set(String(r._id), new Set(mine));
      }
    }),
  );

  const userIds = new Set<string>();
  for (const b of bookings) userIds.add(String(b.user));
  for (const l of listings.values()) if (l.owner) userIds.add(String(l.owner));
  const users = new Map<string, any>();
  const docs: any[] = await User.find({ _id: { $in: [...userIds] } })
    .select('fullName profileUrl email phoneNumber')
    .lean();
  for (const u of docs) users.set(String(u._id), u);
  return { listings, users, reviewers };
};

const itemLines = (b: any, listing: any) => {
  if (!Array.isArray(b.bookingItems) || !b.bookingItems.length) return [];
  return b.bookingItems.map((bi: any) => {
    const item = (listing?.items || []).find((i: any) => String(i._id) === String(bi.itemId));
    return {
      id: String(bi.itemId),
      name: item?.productName ?? item?.seat ?? null,
      quantity: Number(bi.quantity) || 0,
      price: item ? Number(item.price) || 0 : null,
    };
  });
};

const slotOf = (b: any, listing: any) => {
  if (b.slotTime?.startTime) return { startTime: b.slotTime.startTime, endTime: b.slotTime.endTime || null };
  const id = b.slots?.[0];
  if (!id) return null;
  const s = (listing?.slots || listing?.availableSlots || []).find((x: any) => String(x._id) === String(id));
  return s ? { startTime: s.startTime, endTime: s.endTime } : null;
};

/** Provider side of a late fee: due -> pending, paid -> split into fee/net */
const lateFeeEarning = (b: any) => {
  const lf = b.lateFee;
  if (!lf || !(Number(lf.amount) > 0) || (lf.status !== 'due' && lf.status !== 'paid')) return null;
  const paid = lf.status === 'paid';
  return {
    gross: Number(lf.amount) || 0,
    platformFee: paid ? (lf.platformFee ?? null) : null,
    net: paid ? (lf.providerEarning ?? null) : null,
    status: paid ? 'paid' : 'pending',
  };
};

/** Booking card (lists) */
export const toBookingCard = (b: any, viewer: Viewer, ctx: Ctx, now = new Date()) => {
  const category = categoryOf(b);
  const listing = ctx.listings.get(String(b.product));
  const { startAt, endAt } = computeSchedule(b);
  const status = deriveStatus(b, now);
  const owner = listing ? ctx.users.get(String(listing.owner)) : null;
  const customer = ctx.users.get(String(b.user));

  return {
    id: String(b._id),
    category,
    status,
    actions: allowedActions(b, viewer, now, {
      reviewed: !!ctx.reviewers?.get(String(b.product))?.has(String(b.user)),
    }),
    listing: listing
      ? {
          id: String(listing._id),
          title: listing.title,
          thumbnail: listing.thumbnail || null,
          serviceArea: listing.serviceArea || null,
        }
      : { id: String(b.product), title: null, thumbnail: null, serviceArea: null },
    schedule: {
      date: toDayKey(b.date ?? startAt),
      startAt,
      endAt,
      time: formatTime(b.time),
      duration: formatDuration(b.duration),
      slot: category === 'Restaurant' ? slotOf(b, listing) : null,
    },
    people: b.personCount ?? null,
    items: itemLines(b, listing),
    price: { total: Number(b.totalPrice) || 0, currency: config.stripe.currency },
    ticketNumber: b.ticketNumber ?? null,
    approvalDeadline: status === 'Pending' ? (b.approvalDeadline ?? null) : null,
    timer: rentalTimer(b, hourlyRateOf(listing, category), now),
    lateFee:
      b.lateFee?.status && b.lateFee.status !== 'none'
        ? { hours: b.lateFee.hours, amount: b.lateFee.amount, status: b.lateFee.status }
        : null,
    // the other side of the booking
    provider: viewer === 'customer' ? toContactUser(owner) : undefined,
    customer: viewer !== 'customer' ? toContactUser(customer) : undefined,
    createdAt: b.createdAt,
  };
};

/** Booking detail (one booking) = card + history, cancellation, money */
export const toBookingDetail = (b: any, viewer: Viewer, ctx: Ctx, now = new Date()) => {
  const card = toBookingCard(b, viewer, ctx, now);
  const cancelled = card.status === 'Cancelled';
  return {
    ...card,
    contact: { phoneNumber: b.phoneNumber ?? null, address: b.address ?? null, destination: b.destination ?? null },
    timeline: {
      bookedAt: b.createdAt,
      approvedAt: b.approvedAt ?? null,
      handedOverAt: b.handedOverAt ?? null,
      returnedAt: b.returnedAt ?? null,
      completedAt: b.completedAt ?? (card.status === 'Completed' ? b.updatedAt : null),
      cancelledAt: cancelled ? (b.cancelledAt ?? b.updatedAt) : null,
    },
    cancellation: cancelled
      ? {
          by: b.cancelledBy ?? null,
          reason: b.cancelReason ?? null,
          refundAmount: b.refundAmount ?? null,
        }
      : null,
    noShow: !!b.noShow,
    refundedAmount: Number(b.refundAmount) || 0,
    dispute:
      viewer !== 'customer' && b.dispute?.status
        ? { status: b.dispute.status, amount: b.dispute.amount ?? null, reason: b.dispute.reason ?? null }
        : null,
    // provider / admin only: what the provider earns
    earning:
      viewer === 'customer'
        ? undefined
        : {
            gross: Number(b.totalPrice) || 0,
            // platform money the customer paid on top (restaurant service fee);
            // included in platformFee once paid out, never in net
            serviceFee: Number(b.serviceFee) || 0,
            platformFee: b.platformFee ?? null,
            net: b.providerEarning ?? null,
            status:
              b.providerPayout === 'paid'
                ? 'paid'
                : b.providerPayout === 'reversed'
                  ? 'none'
                  : b.providerPayout === 'held'
                    ? 'pending'
                    : 'paid',
            // late return fee (rentals): earned on top of the booking once the
            // customer pays it; gross/net above are the booking price only
            lateFee: lateFeeEarning(b),
          },
  };
};
