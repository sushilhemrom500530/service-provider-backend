/**
 * The booking object the app receives. One shape for all categories; fields
 * that don't apply to a category are null. Internal fields (payout state,
 * drafts, __v…) are never sent.
 */
import { config } from '../../config';
import { User } from '../user/user.model';
import { LISTING_MODELS, MODEL_TO_CATEGORY, hourlyRateOf } from './booking.availability';
import {
  Viewer,
  allowedActions,
  computeSchedule,
  deriveStatus,
  rentalTimer,
  toDayKey,
} from './booking.rules';
import { toContactUser } from '../../shared/apiHelpers';

type Ctx = {
  listings: Map<string, any>;
  users: Map<string, any>;
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
  await Promise.all(
    [...byCategory.entries()].map(async ([c, ids]) => {
      const entry = LISTING_MODELS[c];
      if (!entry) return;
      const docs: any[] = await entry.model
        .find({ _id: { $in: [...ids] } })
        .select('-reviews -refunds -__v')
        .lean();
      for (const d of docs) listings.set(String(d._id), d);
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
  return { listings, users };
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
    actions: allowedActions(b, viewer, now),
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
      time: b.time ?? null,
      duration: b.duration ?? null,
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
          },
  };
};
