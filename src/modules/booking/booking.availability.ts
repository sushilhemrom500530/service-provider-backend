/**
 * Listing registry + availability per date.
 *
 * Availability is always computed from the bookings themselves (never from
 * counters stored on the listing), so it is correct per date:
 *  - Ski Hire  : per item, units booked by overlapping open rentals
 *  - Transport : one vehicle/service, no overlapping open booking
 *  - Restaurant: per day + slot, seats booked per seat type
 */
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import AppError from '../../errors/AppErro';
import { Booking } from './booking.model';
import { SkiPass } from '../skiPass/skipass.model';
import { SkiHire } from '../skiHire/skihire.model';
import { Transport } from '../transport/transport.model';
import { Restaurant } from '../restaurant/restaurant.model';
import { Massage } from '../massage/massage.model';
import {
  OPEN_STATUSES,
  computeSchedule,
  endOfLocalDay,
  startOfLocalDay,
  timeToMinutes,
  toDayKey,
} from './booking.rules';

export const LISTING_MODELS: Record<string, { model: any; modelName: string }> = {
  Ski_Pass: { model: SkiPass, modelName: 'SkiPass' },
  Ski_Hire: { model: SkiHire, modelName: 'SkiHire' },
  Transport: { model: Transport, modelName: 'Transport' },
  Restaurant: { model: Restaurant, modelName: 'Restaurant' },
  Massage: { model: Massage, modelName: 'Massage' },
};

export const MODEL_TO_CATEGORY: Record<string, string> = {
  SkiPass: 'Ski_Pass',
  SkiHire: 'Ski_Hire',
  Transport: 'Transport',
  Restaurant: 'Restaurant',
  Massage: 'Massage',
};

/** Find a listing by id in any of the 5 collections */
export const findListingAnyCategory = async (productId: unknown) => {
  const id = String(productId ?? '');
  if (!Types.ObjectId.isValid(id))
    throw new AppError(StatusCodes.BAD_REQUEST, 'A valid productId is required.');
  for (const [category, { model, modelName }] of Object.entries(LISTING_MODELS)) {
    const doc = await model.findById(id);
    if (doc) return { listing: doc as any, category, modelName, model };
  }
  throw new AppError(StatusCodes.NOT_FOUND, 'Listing not found.');
};

/** ids of every listing a provider owns (all categories, incl. deleted) */
export const listingIdsOfOwner = async (ownerId: unknown) => {
  const owner = new Types.ObjectId(String(ownerId));
  const groups = await Promise.all(
    Object.values(LISTING_MODELS).map(({ model }) =>
      model.find({ owner }).select('_id').lean(),
    ),
  );
  return groups.flat().map((d: any) => d._id as Types.ObjectId);
};

/** Hourly late charge of a rental listing (Ski Hire / Transport) */
export const hourlyRateOf = (listing: any, category: string) =>
  Number(
    category === 'Transport'
      ? (listing?.extraChargePerHours ?? listing?.extraChargePerHour)
      : (listing?.extraChargePerHour ?? listing?.extraChargePerHours),
  ) || 0;

const sameId = (a: unknown, b: unknown) => String(a ?? '') === String(b ?? '');

/* ------------------------------------------------------------------ */
/* Ski Hire                                                            */
/* ------------------------------------------------------------------ */
export const skiHireBookedUnits = async (
  productId: any,
  start: Date,
  end: Date,
  excludeBookingId?: any,
) => {
  const overlapping: any[] = await Booking.find({
    product: productId,
    bookingStatus: { $in: OPEN_STATUSES },
    startDateAndTime: { $lt: end },
    endDateAndTime: { $gt: start },
    ...(excludeBookingId && { _id: { $ne: excludeBookingId } }),
  })
    .select('bookingItems')
    .lean();
  const booked = new Map<string, number>();
  for (const b of overlapping)
    for (const bi of b.bookingItems || [])
      booked.set(String(bi.itemId), (booked.get(String(bi.itemId)) || 0) + Number(bi.quantity || 0));
  return booked;
};

export const skiHireAvailability = async (listing: any, start: Date, end: Date) => {
  const booked = await skiHireBookedUnits(listing._id, start, end);
  return (listing.items || []).map((i: any) => ({
    itemId: String(i._id),
    name: i.productName,
    price: Number(i.price) || 0,
    quantity: Number(i.totalQty) || 0,
    available: Math.max(0, (Number(i.totalQty) || 0) - (booked.get(String(i._id)) || 0)),
  }));
};

export const assertSkiHireAvailable = async (
  listing: any,
  start: Date,
  end: Date,
  items: { itemId: string; quantity: number }[],
) => {
  const booked = await skiHireBookedUnits(listing._id, start, end);
  for (const req of items) {
    const item = (listing.items || []).find((i: any) => sameId(i._id, req.itemId));
    if (!item) throw new AppError(StatusCodes.BAD_REQUEST, `Unknown item: ${req.itemId}`);
    const free = (Number(item.totalQty) || 0) - (booked.get(String(item._id)) || 0);
    if (req.quantity > free)
      throw new AppError(
        StatusCodes.CONFLICT,
        `${item.productName} is not available for these dates. Only ${Math.max(free, 0)} left.`,
      );
  }
};

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */
export const transportIsFree = async (productId: any, start: Date, end: Date) => {
  const clash = await Booking.exists({
    product: productId,
    bookingStatus: { $in: OPEN_STATUSES },
    startDateAndTime: { $lt: end },
    endDateAndTime: { $gt: start },
  });
  return !clash;
};

/* ------------------------------------------------------------------ */
/* Restaurant                                                          */
/* ------------------------------------------------------------------ */
const slotRange = (startTime: unknown, endTime: unknown) => {
  const s = timeToMinutes(startTime);
  let e = timeToMinutes(endTime);
  if (s === null) return null;
  if (e === null) e = s + 120;
  if (e <= s) e += 24 * 60;
  return [s, e] as const;
};
const overlaps = (a: readonly [number, number] | null, b: readonly [number, number] | null) =>
  !!a && !!b && a[0] < b[1] && b[0] < a[1];

/** Open bookings of a restaurant on a local day (new + legacy bookings) */
const restaurantBookingsOnDay = async (productId: any, day: string) => {
  const dayStart = startOfLocalDay(day);
  const dayEnd = endOfLocalDay(day);
  const pad = 14 * 60 * 60 * 1000;
  const docs: any[] = await Booking.find({
    product: productId,
    bookingStatus: { $in: OPEN_STATUSES },
    date: { $gte: new Date(dayStart.getTime() - pad), $lte: new Date(dayEnd.getTime() + pad) },
  })
    .select('date slots slotTime bookingItems')
    .lean();
  return docs.filter(d => toDayKey(d.date) === day);
};

/** Seats left per seat type for every slot of the day */
export const restaurantAvailability = async (listing: any, day: string) => {
  const bookings = await restaurantBookingsOnDay(listing._id, day);
  const slotsById = new Map<string, any>(
    (listing.slots || []).map((s: any) => [String(s._id), s]),
  );
  const rangeOfBooking = (b: any) => {
    if (b.slotTime?.startTime) return slotRange(b.slotTime.startTime, b.slotTime.endTime);
    const s = slotsById.get(String(b.slots?.[0] ?? ''));
    return s ? slotRange(s.startTime, s.endTime) : null;
  };

  return (listing.slots || []).map((slot: any) => {
    const range = slotRange(slot.startTime, slot.endTime);
    const used = new Map<string, number>();
    for (const b of bookings) {
      const sameSlot = sameId(b.slots?.[0], slot._id);
      if (!sameSlot && !overlaps(range, rangeOfBooking(b))) continue;
      for (const bi of b.bookingItems || [])
        used.set(String(bi.itemId), (used.get(String(bi.itemId)) || 0) + Number(bi.quantity || 0));
    }
    return {
      slotId: String(slot._id),
      startTime: slot.startTime,
      endTime: slot.endTime,
      seats: (listing.items || []).map((i: any) => ({
        itemId: String(i._id),
        type: i.seat,
        price: Number(i.price) || 0,
        available: Math.max(0, (Number(i.totalQty) || 0) - (used.get(String(i._id)) || 0)),
      })),
    };
  });
};

export const assertRestaurantAvailable = async (
  listing: any,
  day: string,
  slotId: string,
  items: { itemId: string; quantity: number }[],
) => {
  const all = await restaurantAvailability(listing, day);
  const slot = all.find((s: any) => s.slotId === String(slotId));
  if (!slot) throw new AppError(StatusCodes.BAD_REQUEST, 'This time slot does not exist.');
  for (const req of items) {
    const seat = slot.seats.find((s: any) => s.itemId === String(req.itemId));
    if (!seat) throw new AppError(StatusCodes.BAD_REQUEST, `Unknown seat type: ${req.itemId}`);
    if (req.quantity > seat.available)
      throw new AppError(
        StatusCodes.CONFLICT,
        `Only ${seat.available} ${seat.type} seat(s) left for ${slot.startTime} on ${day}.`,
      );
  }
};

/* ------------------------------------------------------------------ */
/* Race guard: re-check AFTER the booking is saved                     */
/* ------------------------------------------------------------------ */
/**
 * Two customers can pay for the last unit at the same moment: both pass the
 * check before saving. After saving, count again including only bookings
 * created no later than this one (ObjectIds grow with time): the earlier
 * booking wins, the later one throws (its caller deletes it and refunds).
 */
export const assertNoOverbooking = async (booking: any, listing: any) => {
  const notLater = { _id: { $lte: booking._id } };
  const category = booking.category;

  if (category === 'Transport') {
    const earlier = await Booking.exists({
      _id: { $lt: booking._id },
      product: booking.product,
      bookingStatus: { $in: OPEN_STATUSES },
      startDateAndTime: { $lt: booking.endDateAndTime },
      endDateAndTime: { $gt: booking.startDateAndTime },
    });
    if (earlier)
      throw new AppError(StatusCodes.CONFLICT, 'This transport was just booked by someone else for that time.');
    return;
  }

  if (category === 'Ski_Hire') {
    const overlapping: any[] = await Booking.find({
      ...notLater,
      product: booking.product,
      bookingStatus: { $in: OPEN_STATUSES },
      startDateAndTime: { $lt: booking.endDateAndTime },
      endDateAndTime: { $gt: booking.startDateAndTime },
    })
      .select('bookingItems')
      .lean();
    for (const mine of booking.bookingItems || []) {
      const item = (listing.items || []).find((i: any) => sameId(i._id, mine.itemId));
      const used = overlapping.reduce((s, b) => {
        const bi = (b.bookingItems || []).find((x: any) => sameId(x.itemId, mine.itemId));
        return s + (bi ? Number(bi.quantity) || 0 : 0);
      }, 0);
      if (item && used > (Number(item.totalQty) || 0))
        throw new AppError(StatusCodes.CONFLICT, `${item.productName} was just booked by someone else for these dates.`);
    }
    return;
  }

  if (category === 'Restaurant') {
    const day = toDayKey(booking.date);
    if (!day) return;
    const mySlot = slotRange(booking.slotTime?.startTime, booking.slotTime?.endTime);
    const slotsById = new Map<string, any>((listing.slots || []).map((s: any) => [String(s._id), s]));
    const sameDay = (await restaurantBookingsOnDay(booking.product, day)).filter(
      (b: any) => String(b._id) <= String(booking._id),
    );
    const used = new Map<string, number>();
    for (const b of sameDay) {
      const range = b.slotTime?.startTime
        ? slotRange(b.slotTime.startTime, b.slotTime.endTime)
        : (() => {
            const s = slotsById.get(String(b.slots?.[0] ?? ''));
            return s ? slotRange(s.startTime, s.endTime) : null;
          })();
      if (!sameId(b.slots?.[0], booking.slots?.[0]) && !overlaps(mySlot, range)) continue;
      for (const bi of b.bookingItems || [])
        used.set(String(bi.itemId), (used.get(String(bi.itemId)) || 0) + Number(bi.quantity || 0));
    }
    for (const mine of booking.bookingItems || []) {
      const item = (listing.items || []).find((i: any) => sameId(i._id, mine.itemId));
      if (item && (used.get(String(mine.itemId)) || 0) > (Number(item.totalQty) || 0))
        throw new AppError(StatusCodes.CONFLICT, `The last ${item.seat} seats were just booked by someone else.`);
    }
  }
};

/* ------------------------------------------------------------------ */
/* Public availability endpoint                                        */
/* ------------------------------------------------------------------ */
/**
 * GET /booking/availability/:productId
 *   Restaurant: ?date=YYYY-MM-DD        -> slots with seats left
 *   Ski Hire  : ?start=ISO&end=ISO       -> items with units left
 *   Transport : ?start=ISO&end=ISO       -> { available }
 *   Massage / Ski Pass: always bookable on a future date -> { available: true }
 */
export const getAvailability = async (productId: string, query: Record<string, any>) => {
  const { listing, category } = await findListingAnyCategory(productId);
  if (listing.isDeleted || listing.isActive === false)
    throw new AppError(StatusCodes.NOT_FOUND, 'Listing not found.');

  if (category === 'Restaurant') {
    const day = toDayKey(query.date);
    if (!day) throw new AppError(StatusCodes.BAD_REQUEST, 'date (YYYY-MM-DD) is required.');
    const slots = await restaurantAvailability(listing, day);
    const now = Date.now();
    return {
      category,
      date: day,
      slots: slots.map((s: any) => {
        const { startAt } = computeSchedule({
          category: 'Restaurant',
          date: day,
          slotTime: { startTime: s.startTime, endTime: s.endTime },
        });
        return { ...s, isPast: !!startAt && startAt.getTime() <= now };
      }),
    };
  }

  if (category === 'Ski_Hire' || category === 'Transport') {
    const start = new Date(query.start ?? query.startDateAndTime);
    const end = new Date(query.end ?? query.endDateAndTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start)
      throw new AppError(StatusCodes.BAD_REQUEST, 'start and end (ISO date-time) are required, end after start.');
    if (category === 'Transport')
      return { category, start, end, available: await transportIsFree(listing._id, start, end) };
    return { category, start, end, items: await skiHireAvailability(listing, start, end) };
  }

  return { category, available: true };
};
