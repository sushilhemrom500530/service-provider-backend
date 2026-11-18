/**
 * Listing registry + availability per date.
 *
 * Availability is always computed from the bookings themselves (never from
 * counters stored on the listing), so it is correct per date:
 *  - Ski Hire  : per item, units booked by overlapping open rentals
 *  - Transport : one vehicle/service, no overlapping open booking
 *  Rentals: an item handed over and not returned after its end is still
 *  out, so it stays busy until it comes back (see `occupyingFilter`).
 *  - Restaurant: per day + slot, seats booked per seat type
 *  - Massage   : per listing, guests treated at the same time (the
 *                listing's `capacity` = therapists) at any moment of the session
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
  POLICY,
  atLocal,
  computeSchedule,
  durationToMinutes,
  fitsOpeningHours,
  formatDuration,
  formatTime,
  openWindowMinutes,
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
/* Rentals: what keeps an item / vehicle busy                          */
/* ------------------------------------------------------------------ */
/**
 * Handed over, past its end and not returned yet (still Active): the item is
 * still with the previous customer. It keeps the item busy for any booking
 * starting before the rental is closed for sure, which is when the provider
 * marks it returned or, at the latest, the automatic close
 * OVERDUE_AUTO_RETURN_HOURS after the end.
 */
export const stillOutFilter = (start: Date, now: Date = new Date()) => ({
  isHandOver: true,
  endDateAndTime: {
    $lte: now,
    $gt: new Date(start.getTime() - POLICY.OVERDUE_AUTO_RETURN_HOURS * 3600000),
  },
});

/** Open bookings of a rental that use it during [start, end) */
export const occupyingFilter = (productId: any, start: Date, end: Date, now: Date = new Date()) => ({
  product: productId,
  bookingStatus: { $in: OPEN_STATUSES },
  $or: [
    { startDateAndTime: { $lt: end }, endDateAndTime: { $gt: start } },
    stillOutFilter(start, now),
  ],
});

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
    ...occupyingFilter(productId, start, end),
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
export type TransportBlock = 'booked' | 'not_returned' | null;

export const TRANSPORT_BLOCK_MESSAGES: Record<Exclude<TransportBlock, null>, string> = {
  booked: 'This transport is already booked for that time.',
  not_returned:
    'This vehicle has not been returned by the previous customer yet. Please choose a later time or another vehicle.',
};

/** Why the vehicle can't be booked for [start, end), or null when it is free */
export const transportBlocker = async (productId: any, start: Date, end: Date): Promise<TransportBlock> => {
  const open = { product: productId, bookingStatus: { $in: OPEN_STATUSES } };
  if (await Booking.exists({ ...open, startDateAndTime: { $lt: end }, endDateAndTime: { $gt: start } }))
    return 'booked';
  if (await Booking.exists({ ...open, ...stillOutFilter(start) })) return 'not_returned';
  return null;
};

export const transportIsFree = async (productId: any, start: Date, end: Date) =>
  (await transportBlocker(productId, start, end)) === null;

/* ------------------------------------------------------------------ */
/* Massage                                                             */
/* ------------------------------------------------------------------ */
/**
 * A massage listing treats up to `capacity` guests at the same time (one
 * per therapist, default 1). A booking of N people takes N places for its
 * whole session. A time is full when, at some moment of the requested
 * session, the open bookings (waiting, confirmed, in progress) already use
 * every place. Sessions that only touch (11:00-12:00 and 12:00-13:00) don't
 * overlap.
 */
export const massageCapacityOf = (listing: any) =>
  Math.max(1, Math.floor(Number(listing?.capacity) || 1));

export const MASSAGE_FULL_MESSAGE = 'This time is already booked. Choose another time.';

/** open bookings of the listing overlapping [start, end) */
const massageBookingsBetween = (productId: any, start: Date, end: Date, extra: Record<string, any> = {}) =>
  Booking.find({
    product: productId,
    bookingStatus: { $in: OPEN_STATUSES },
    startAt: { $lt: end },
    endAt: { $gt: start },
    ...extra,
  })
    .select('startAt endAt personCount')
    .lean();

/** Most guests in session at the same moment within [start, end) */
export const peakGuests = (bookings: any[], start: Date, end: Date) => {
  const events: [number, number][] = [];
  for (const b of bookings) {
    const s = Math.max(new Date(b.startAt).getTime(), start.getTime());
    const e = Math.min(new Date(b.endAt).getTime(), end.getTime());
    if (!(e > s)) continue;
    const guests = Math.max(1, Number(b.personCount) || 1);
    events.push([s, guests], [e, -guests]);
  }
  // at the same instant, a session ending frees its place before the next starts
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let peak = 0;
  for (const [, delta] of events) {
    current += delta;
    peak = Math.max(peak, current);
  }
  return peak;
};

/** Places still free for the whole of [start, end) */
export const massagePlacesLeft = async (listing: any, start: Date, end: Date) => {
  const booked = await massageBookingsBetween(listing._id, start, end);
  return Math.max(0, massageCapacityOf(listing) - peakGuests(booked, start, end));
};

/** 400 when more guests than places at all; 409 when the time is (too) full */
export const assertMassageAvailable = async (listing: any, start: Date, end: Date, guests: number) => {
  const capacity = massageCapacityOf(listing);
  if (guests > capacity)
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `This massage takes up to ${capacity} guest${capacity === 1 ? '' : 's'} at the same time.`,
    );
  const left = await massagePlacesLeft(listing, start, end);
  if (guests > left)
    throw new AppError(
      StatusCodes.CONFLICT,
      left > 0
        ? `Only ${left} place${left === 1 ? '' : 's'} left at this time. Choose another time or fewer guests.`
        : MASSAGE_FULL_MESSAGE,
    );
};

/** The listing's duration option (minutes + "60 min"); 400 when it isn't offered */
export const massageDurationOf = (listing: any, duration: unknown) => {
  const options: any[] = listing.priceByDuration || [];
  if (!options.length) {
    const minutes = durationToMinutes(duration) ?? 60;
    return { minutes, duration: formatDuration(minutes) ?? `${minutes} min` };
  }
  const wanted = durationToMinutes(duration);
  const option = options.find(o => durationToMinutes(o.duration) === wanted);
  if (!wanted || !option)
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `duration is required: one of ${options.map(o => o.duration).join(', ')}.`,
    );
  return { minutes: wanted, duration: formatDuration(option.duration) ?? String(option.duration) };
};

const SLOT_STEPS = [15, 30, 60];

/** minutes after midnight -> "9:30 AM" */
const clock = (minutes: number) => formatTime(`${Math.floor((minutes % 1440) / 60)}:${String(minutes % 60).padStart(2, '0')}`);

/**
 * Every start time of a day for one duration, every `step` minutes inside
 * the opening hours, with the places left. One query for the whole day.
 */
export const massageDaySlots = async (listing: any, day: string, minutes: number, guests = 1, step = 30) => {
  const capacity = massageCapacityOf(listing);
  const open = timeToMinutes(listing.openTime);
  const window = openWindowMinutes(listing.openTime, listing.closeTime);
  if (open === null || window === null || minutes > window) return { capacity, slots: [] as any[] };

  const booked = await massageBookingsBetween(listing._id, atLocal(day, open), atLocal(day, open + window));
  const now = Date.now();
  const slots: any[] = [];
  for (let offset = 0; offset + minutes <= window; offset += step) {
    const start = atLocal(day, open + offset);
    const end = atLocal(day, open + offset + minutes);
    const left = Math.max(0, capacity - peakGuests(booked, start, end));
    const isPast = start.getTime() <= now;
    slots.push({ time: clock(open + offset), startAt: start, endAt: end, left, available: !isPast && left >= guests, isPast });
  }
  return { capacity, slots };
};

/** GET /booking/availability for a massage (see getAvailability) */
const massageAvailability = async (listing: any, query: Record<string, any>) => {
  const capacity = massageCapacityOf(listing);
  const day = toDayKey(query.date);
  if (!day) return { category: 'Massage', capacity, available: true }; // old app call, no date
  const { minutes, duration } = massageDurationOf(listing, query.duration);
  const guests = Math.max(1, Math.floor(Number(query.personCount ?? query.guests) || 1));

  if (query.time === undefined || query.time === '') {
    const step = SLOT_STEPS.includes(Number(query.step)) ? Number(query.step) : 30;
    const { slots } = await massageDaySlots(listing, day, minutes, guests, step);
    return { category: 'Massage', date: day, duration, personCount: guests, capacity, step, slots };
  }

  const t = timeToMinutes(query.time);
  if (t === null) throw new AppError(StatusCodes.BAD_REQUEST, 'time must be like "10:30 AM" or "14:00".');
  const start = atLocal(day, t);
  const end = atLocal(day, t + minutes);
  const base = { category: 'Massage', date: day, time: formatTime(query.time), duration, personCount: guests, capacity };
  if (!fitsOpeningHours(query.time, minutes, listing.openTime, listing.closeTime))
    return { ...base, available: false, left: 0, reason: 'closed' };
  if (start.getTime() <= Date.now()) return { ...base, available: false, left: 0, reason: 'past' };
  const left = await massagePlacesLeft(listing, start, end);
  if (guests > capacity) return { ...base, available: false, left, reason: 'too_many_guests' };
  return { ...base, available: left >= guests, left, reason: left >= guests ? null : 'booked' };
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
      ...occupyingFilter(booking.product, booking.startDateAndTime, booking.endDateAndTime),
    });
    if (earlier)
      throw new AppError(StatusCodes.CONFLICT, 'This transport was just booked by someone else for that time.');
    return;
  }

  if (category === 'Ski_Hire') {
    const overlapping: any[] = await Booking.find({
      ...notLater,
      ...occupyingFilter(booking.product, booking.startDateAndTime, booking.endDateAndTime),
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

  if (category === 'Massage') {
    // bookings saved no later than this one (it included): over capacity -> this later one loses
    const start = new Date(booking.startAt);
    const end = new Date(booking.endAt);
    const booked = await massageBookingsBetween(booking.product, start, end, notLater);
    if (peakGuests(booked, start, end) > massageCapacityOf(listing))
      throw new AppError(StatusCodes.CONFLICT, 'This time was just booked by someone else. Choose another time.');
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
 *   Transport : ?start=ISO&end=ISO       -> { available, reason: null | 'booked' | 'not_returned' }
 *   Massage   : ?date=YYYY-MM-DD&duration=60 min[&personCount=2][&step=30]
 *                 -> { capacity, slots: [{ time, startAt, endAt, left, available, isPast }] }
 *               ?date=...&time=11:00 AM&duration=60 min[&personCount=2]
 *                 -> { available, left, reason: null | 'booked' | 'closed' | 'past' | 'too_many_guests' }
 *   Ski Pass  : always bookable on a future date -> { available: true }
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
    if (category === 'Transport') {
      const reason = await transportBlocker(listing._id, start, end);
      return { category, start, end, available: reason === null, reason };
    }
    return { category, start, end, items: await skiHireAvailability(listing, start, end) };
  }

  if (category === 'Massage') return massageAvailability(listing, query);

  return { category, available: true };
};
