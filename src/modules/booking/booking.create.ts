/**
 * Booking creation:  POST /booking/intent  ->  Stripe payment sheet  ->  POST /booking/create
 *
 * 1. /intent  validates the request, prices it ON THE SERVER, creates a Stripe
 *    PaymentIntent and stores a draft. Nothing is booked yet.
 * 2. The app shows the Stripe payment sheet with clientSecret + publishableKey.
 * 3. /create  verifies the payment with Stripe (server to server), re-checks
 *    availability and creates the booking. If anything fails after the card
 *    was charged, the payment is refunded automatically.
 * The Stripe webhook does step 3 too, in case the app was closed after paying.
 */
import crypto from 'crypto';
import Stripe from 'stripe';
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errors/AppErro';
import stripe from '../../utils/stripe';
import { config } from '../../config';
import { User } from '../user/user.model';
import { Payment } from '../payment/payment.model';
import { PaymentGateway, TransactionStatus } from '../payment/payment.interface';
import { Booking } from './booking.model';
import { BookingDraft } from './bookingDraft.model';
import { notify, emitBookingUpdated } from '../notification/notify';
import {
  POLICY,
  computeApprovalDeadline,
  computeSchedule,
  formatBookingWhen,
  FOREIGN_COMPLETION_FILTER,
  durationToMinutes,
  fitsOpeningHours,
  formatDuration,
  formatLocalDateTime,
  formatTime,
  isRental,
  timeToMinutes,
  toDayKey,
  startOfLocalDay,
} from './booking.rules';
import {
  assertRestaurantAvailable,
  assertMassageAvailable,
  assertNoOverbooking,
  assertSkiHireAvailable,
  findListingAnyCategory,
  transportBlocker,
  TRANSPORT_BLOCK_MESSAGES,
} from './booking.availability';

const round2 = (n: number) => Math.round(n * 100) / 100;
const toMinor = (amount: number) => Math.round(Number(amount) * 100);
const bad = (message: string) => new AppError(StatusCodes.BAD_REQUEST, message);

const INACTIVE_USER = ['Delete', 'Blocked', 'Banned', 'Inactive', 'Unverified'];

/* ------------------------------------------------------------------ */
/* Request normalisation                                               */
/* ------------------------------------------------------------------ */

/** A date-time with a clock time must carry a timezone ("…+01:00" or "Z") */
const assertHasTimezone = (field: string, v: unknown) => {
  if (typeof v === 'string' && /T\d{2}:\d{2}/.test(v) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(v.trim()))
    throw bad(`${field} must include a timezone, e.g. "2026-12-20T09:00:00+01:00" or "2026-12-20T08:00:00Z".`);
};

const parseItems = (raw: any): { itemId: string; quantity: number }[] => {
  const list = Array.isArray(raw) ? raw : [];
  const merged = new Map<string, number>();
  for (const it of list) {
    const itemId = String(it?.itemId ?? it?.id ?? '');
    const quantity = Number(it?.quantity);
    if (!Types.ObjectId.isValid(itemId)) throw bad('Each item needs a valid itemId.');
    if (!Number.isInteger(quantity) || quantity < 1)
      throw bad('Each item quantity must be a whole number of at least 1.');
    merged.set(itemId, (merged.get(itemId) || 0) + quantity);
  }
  return [...merged.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
};

const parseRange = (payload: any) => {
  assertHasTimezone('startDateAndTime', payload.startDateAndTime);
  assertHasTimezone('endDateAndTime', payload.endDateAndTime);
  const start = new Date(payload.startDateAndTime);
  const end = new Date(payload.endDateAndTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime()))
    throw bad('startDateAndTime and endDateAndTime are required.');
  if (end <= start) throw bad('End date/time must be after the start.');
  if (start.getTime() < Date.now() - 5 * 60 * 1000) throw bad('Start date/time cannot be in the past.');
  return { start, end };
};

const parseDay = (value: unknown) => {
  assertHasTimezone('date', value);
  const day = toDayKey(value);
  if (!day) throw bad('date (YYYY-MM-DD) is required.');
  return day;
};

/** personCount: whole number, at least 1, and at most `max` when the service has a limit */
const parseGuests = (value: unknown, fallback = 1, max?: { limit: number; message: string }) => {
  const n = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 1) throw bad('personCount must be a whole number of at least 1.');
  if (max && n > max.limit) throw bad(max.message);
  return n;
};

/**
 * Everything the booking will store, built from the request and the listing.
 * Only these fields are ever saved (no client-controlled status/approval/price).
 */
export type NormalizedBooking = {
  category: string;
  productModel: string;
  product: Types.ObjectId;
  personCount?: number;
  date?: Date;
  time?: string;
  duration?: string;
  startDateAndTime?: Date;
  endDateAndTime?: Date;
  bookingItems?: { itemId: Types.ObjectId; quantity: number }[];
  slots?: Types.ObjectId[];
  slotTime?: { startTime: string; endTime: string };
  phoneNumber?: string;
  address?: string;
  destination?: string;
  startAt: Date;
  endAt: Date;
  totalPrice: number;
  /** platform service fee included in totalPrice (Restaurant) */
  serviceFee?: number;
  priceBreakdown: Record<string, any>;
};

const textOrUndefined = (v: unknown, max = 300) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : undefined;
};

/**
 * Validate a booking request and price it. Read-only: safe for /intent.
 * Throws 400/404/409 with a message the app can show.
 */
export const prepareBooking = async (user: JwtPayload, payload: any) => {
  const dbUser: any = await User.findById(user?.userId);
  if (!dbUser) throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  if (INACTIVE_USER.includes(dbUser.status))
    throw new AppError(StatusCodes.FORBIDDEN, 'Your account is not active.');
  if (payload?.userId && String(payload.userId) !== String(dbUser._id))
    throw new AppError(StatusCodes.FORBIDDEN, 'userId does not match the logged-in user.');
  // an unpaid late fee must be paid before booking again
  const owing: any = await Booking.findOne({ user: dbUser._id, 'lateFee.status': 'due' })
    .select('_id lateFee.amount')
    .lean();
  if (owing)
    throw new AppError(
      StatusCodes.PAYMENT_REQUIRED,
      `Please pay your outstanding late fee of ${owing.lateFee?.amount} first (booking ${owing._id}).`,
    );

  const { listing, category, modelName } = await findListingAnyCategory(payload?.productId);
  if (listing.isDeleted || listing.isActive === false)
    throw new AppError(StatusCodes.NOT_FOUND, 'This listing is not available.');
  if (String(listing.owner) === String(dbUser._id))
    throw bad('You cannot book your own listing.');
  // bookings of this listing closed early by something outside the lifecycle
  // still hold their dates/units (see reopenForeignCompletions)
  await Booking.updateMany(
    { ...FOREIGN_COMPLETION_FILTER, product: listing._id },
    { $set: { bookingStatus: 'Active' } },
  );
  const owner: any = await User.findById(listing.owner).select('fullName email providerType status');
  if (!owner) throw new AppError(StatusCodes.NOT_FOUND, 'Provider not found.');

  const base = {
    category,
    productModel: modelName,
    product: listing._id as Types.ObjectId,
    phoneNumber: textOrUndefined(payload.phoneNumber, 40),
    address: textOrUndefined(payload.address),
  };

  let n: Omit<NormalizedBooking, 'startAt' | 'endAt' | 'totalPrice' | 'priceBreakdown'>;
  let totalPrice = 0;
  let priceBreakdown: Record<string, any> = {};

  switch (category) {
    case 'Ski_Pass': {
      const day = parseDay(payload.date);
      const guests = parseGuests(payload.personCount, 1, {
        limit: POLICY.SKI_PASS_MAX_PEOPLE,
        message: `A ski pass booking is for up to ${POLICY.SKI_PASS_MAX_PEOPLE} people. Make a second booking for more.`,
      });
      const unit = Number(listing.amount);
      if (!(unit > 0)) throw bad('This ski pass has no valid price.');
      n = { ...base, date: startOfLocalDay(day), personCount: guests };
      totalPrice = round2(unit * guests);
      priceBreakdown = { unitPrice: unit, persons: guests };
      break;
    }

    case 'Massage': {
      const day = parseDay(payload.date);
      const guests = parseGuests(payload.personCount);
      const time = textOrUndefined(payload.time, 20);
      if (!time || timeToMinutes(time) === null)
        throw bad('time is required, e.g. "10:30 AM" or "14:00".');
      const options: any[] = listing.priceByDuration || [];
      let unit = Number(listing.amount) || 0;
      let duration = textOrUndefined(payload.duration, 30);
      if (options.length) {
        const wanted = durationToMinutes(payload.duration);
        const option = options.find(o => durationToMinutes(o.duration) === wanted);
        if (!wanted || !option)
          throw bad(`Choose one of the durations: ${options.map(o => o.duration).join(', ')}.`);
        unit = Number(option.amount);
        duration = option.duration;
      }
      if (!(unit > 0)) throw bad('This massage has no valid price.');
      // the whole session inside opening hours (hours may cross midnight)
      const len = durationToMinutes(duration) ?? 60;
      if (!fitsOpeningHours(time, len, listing.openTime, listing.closeTime))
        throw bad(`Choose a time between ${listing.openTime} and ${listing.closeTime} (session ${len} min).`);
      // stored in one format: "10:30 AM", "60 min"
      n = {
        ...base,
        date: startOfLocalDay(day),
        time: formatTime(time)!,
        duration: formatDuration(duration) ?? undefined,
        personCount: guests,
      };
      totalPrice = round2(unit * guests);
      priceBreakdown = { unitPrice: unit, persons: guests, duration };
      break;
    }

    case 'Restaurant': {
      const day = parseDay(payload.date);
      const slotId = String(payload.slotId ?? (Array.isArray(payload.slots) ? payload.slots[0] : payload.slots) ?? '');
      const slot = (listing.slots || []).find((s: any) => String(s._id) === slotId);
      if (!slot) throw bad('Choose one of the restaurant time slots (slotId).');
      const items = parseItems(payload.bookingItems ?? payload.seats);
      if (!items.length) throw bad('Choose at least one seat (bookingItems).');
      await assertRestaurantAvailable(listing, day, slotId, items);
      let seatsTotal = 0;
      const lines = items.map(it => {
        const item = (listing.items || []).find((i: any) => String(i._id) === it.itemId);
        const price = Number(item?.price) || 0;
        seatsTotal += price * it.quantity;
        return { itemId: it.itemId, type: item?.seat, quantity: it.quantity, price };
      });
      const serviceFee = Number(listing.serviceFee) || 0;
      n = {
        ...base,
        date: startOfLocalDay(day),
        slots: [new Types.ObjectId(slotId)],
        slotTime: { startTime: slot.startTime, endTime: slot.endTime },
        bookingItems: items.map(i => ({ itemId: new Types.ObjectId(i.itemId), quantity: i.quantity })),
        personCount: items.reduce((s, i) => s + i.quantity, 0),
        // stored: the platform keeps it, the provider is paid on the seats only
        serviceFee: round2(serviceFee),
      };
      totalPrice = round2(seatsTotal + serviceFee);
      priceBreakdown = { seats: lines, serviceFee };
      break;
    }

    case 'Ski_Hire': {
      const { start, end } = parseRange(payload);
      const items = parseItems(payload.bookingItems);
      if (!items.length) throw bad('Choose at least one item (bookingItems).');
      await assertSkiHireAvailable(listing, start, end, items);
      const unit = listing.priceUnit || 'per_day';
      const ms = end.getTime() - start.getTime();
      const units =
        unit === 'per_hour'
          ? Math.max(1, Math.ceil(ms / 3600000))
          : unit === 'per_rental'
            ? 1
            : Math.max(1, Math.ceil(ms / 86400000));
      let sum = 0;
      const lines = items.map(it => {
        const item = (listing.items || []).find((i: any) => String(i._id) === it.itemId);
        const price = Number(item?.price) || 0;
        sum += price * it.quantity * units;
        return { itemId: it.itemId, name: item?.productName, quantity: it.quantity, price };
      });
      if (!(sum > 0)) throw bad('These items have no valid price.');
      n = {
        ...base,
        startDateAndTime: start,
        endDateAndTime: end,
        bookingItems: items.map(i => ({ itemId: new Types.ObjectId(i.itemId), quantity: i.quantity })),
      };
      totalPrice = round2(sum);
      priceBreakdown = { items: lines, priceUnit: unit, units };
      break;
    }

    case 'Transport': {
      const { start, end } = parseRange(payload);
      const guests = parseGuests(payload.personCount);
      const seats = Number(listing.personCount) || 0;
      if (seats && guests > seats) throw bad(`This vehicle takes up to ${seats} passengers.`);
      const blocked = await transportBlocker(listing._id, start, end);
      if (blocked) throw new AppError(StatusCodes.CONFLICT, TRANSPORT_BLOCK_MESSAGES[blocked]);
      const amount = Number(listing.amount);
      if (!(amount > 0)) throw bad('This transport has no valid price.');
      n = {
        ...base,
        startDateAndTime: start,
        endDateAndTime: end,
        personCount: guests,
        destination: textOrUndefined(payload.destination),
      };
      totalPrice = round2(amount);
      priceBreakdown = { amount };
      break;
    }

    default:
      throw bad('Unsupported category.');
  }

  const schedule = computeSchedule({ ...n });
  if (!schedule.startAt || !schedule.endAt) throw bad('Could not read the booking date/time.');
  if (schedule.endAt.getTime() <= Date.now())
    throw bad('This date/time is already over. Choose a later one.');
  if (category === 'Restaurant' && schedule.startAt.getTime() <= Date.now())
    throw bad('This time slot has already started. Choose a later one.');
  if (!isRental(category) && category === 'Massage' && schedule.startAt.getTime() <= Date.now())
    throw bad('This time has already passed. Choose a later one.');
  // one therapist (or `capacity`) per time: refuse a full time before payment
  if (category === 'Massage')
    await assertMassageAvailable(listing, schedule.startAt, schedule.endAt, Number(n.personCount) || 1);

  const normalized: NormalizedBooking = {
    ...(n as any),
    startAt: schedule.startAt,
    endAt: schedule.endAt,
    totalPrice,
    priceBreakdown,
  };
  return { dbUser, owner, listing, normalized };
};

/** Fingerprint of what was paid for (dates, items, people, slot…) */
const signatureOf = (n: NormalizedBooking) =>
  crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        p: String(n.product),
        s: n.startAt.toISOString(),
        e: n.endAt.toISOString(),
        i: (n.bookingItems || []).map(i => `${i.itemId}:${i.quantity}`).sort(),
        g: n.personCount ?? null,
        sl: (n.slots || []).map(String),
        d: n.duration ?? null,
        t: n.totalPrice,
      }),
    )
    .digest('hex')
    .slice(0, 40);

/* ------------------------------------------------------------------ */
/* Step 1: POST /booking/intent                                        */
/* ------------------------------------------------------------------ */
export const assertStripeConfigured = () => {
  if (!config.stripe.secretKey)
    throw new AppError(StatusCodes.SERVICE_UNAVAILABLE, 'Payments are not configured on the server.');
  if (!String(config.stripe.publishableKey || '').startsWith('pk_'))
    throw new AppError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'Payments are not configured on the server (publishable key missing).',
    );
};

export const createBookingIntent = async (user: JwtPayload, payload: any) => {
  assertStripeConfigured();
  const { dbUser, normalized } = await prepareBooking(user, payload);
  const amount = toMinor(normalized.totalPrice);
  const currency = config.stripe.currency;

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      description: `${normalized.category} booking`,
      metadata: {
        type: 'booking',
        userId: String(dbUser._id),
        productId: String(normalized.product),
        category: normalized.category,
        totalPrice: String(normalized.totalPrice),
        signature: signatureOf(normalized),
      },
    });
  } catch (error: any) {
    throw new AppError(StatusCodes.BAD_GATEWAY, error?.message || 'Could not start the payment.');
  }

  const { paymentIntentId: _a, transactionId: _b, ...body } = payload || {};
  await BookingDraft.create({
    paymentIntentId: intent.id,
    user: dbUser._id,
    userEmail: dbUser.email,
    payload: JSON.parse(JSON.stringify(body)),
  });

  return {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    publishableKey: config.stripe.publishableKey,
    amount: normalized.totalPrice,
    currency,
    category: normalized.category,
    breakdown: normalized.priceBreakdown,
  };
};

/* ------------------------------------------------------------------ */
/* Step 3: POST /booking/create  (and the webhook)                     */
/* ------------------------------------------------------------------ */

/** Booking already created for this payment (by the webhook or a retry)? */
const existingBookingFor = async (paymentIntentId: string, userId: string) => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const draft: any = await BookingDraft.findOne({ paymentIntentId }).lean();
    if (!draft || String(draft.user) !== String(userId)) return null;
    if (draft.status === 'completed' && draft.booking) return Booking.findById(draft.booking);
    if (draft.status === 'failed')
      throw bad(draft.error || 'This booking could not be created. The payment was refunded.');
    if (draft.status !== 'processing') return null;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new AppError(StatusCodes.CONFLICT, 'This booking is still being created. Refresh in a moment.');
};

const retrievePaidIntent = async (paymentIntentId: string) => {
  if (!paymentIntentId || !String(paymentIntentId).startsWith('pi_'))
    throw bad('A valid Stripe paymentIntentId is required.');
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    throw bad('Payment not found.');
  }
  if (intent.status !== 'succeeded')
    throw new AppError(StatusCodes.PAYMENT_REQUIRED, `Payment not completed (status: ${intent.status}).`);
  return intent;
};

const refundQuietly = async (paymentIntentId: string) => {
  try {
    await stripe.refunds.create(
      { payment_intent: paymentIntentId, metadata: { source: 'app' } },
      // a retry (job / webhook / app) never refunds this payment twice
      { idempotencyKey: `refund-unbooked-${paymentIntentId}` },
    );
    return true;
  } catch {
    return false;
  }
};

/**
 * Create the booking for a paid intent. The draft is claimed atomically,
 * so the app and the webhook can never create two bookings for one payment.
 * Any failure after this point refunds the payment.
 */
const bookPaidIntent = async (user: JwtPayload, payload: any, intent: Stripe.PaymentIntent) => {
  const meta = intent.metadata || {};
  if (meta.userId !== String(user.userId))
    throw new AppError(StatusCodes.FORBIDDEN, 'This payment belongs to another user.');

  if (await Payment.exists({ transactionId: intent.id })) {
    const existing = await existingBookingFor(intent.id, String(user.userId));
    if (existing) return existing;
    throw new AppError(StatusCodes.CONFLICT, 'This payment has already been used for a booking.');
  }

  const hasDraft = await BookingDraft.exists({ paymentIntentId: intent.id });
  if (hasDraft) {
    const claimed = await BookingDraft.findOneAndUpdate(
      { paymentIntentId: intent.id, status: 'pending' },
      { $set: { status: 'processing' } },
      { new: true },
    );
    if (!claimed) {
      const existing = await existingBookingFor(intent.id, String(user.userId));
      if (existing) return existing;
      throw new AppError(StatusCodes.CONFLICT, 'This payment has already been used for a booking.');
    }
  }

  let createdId: any = null;
  try {
    // validate again NOW (availability may have changed since /intent)
    const { dbUser, owner, listing, normalized } = await prepareBooking(user, payload);
    if (meta.productId !== String(normalized.product))
      throw bad('This payment was made for a different listing.');
    if (intent.amount_received !== toMinor(Number(meta.totalPrice)) ||
        toMinor(normalized.totalPrice) !== toMinor(Number(meta.totalPrice)))
      throw bad('The price changed after payment.');
    if (meta.signature && meta.signature !== signatureOf(normalized))
      throw bad('Booking details differ from the ones that were paid for.');

    const autoApprove = normalized.category === 'Ski_Pass';
    const { priceBreakdown: _pb, ...fields } = normalized;
    const booking: any = await Booking.create({
      ...fields,
      user: dbUser._id,
      bookingStatus: 'Active',
      isPermitted: autoApprove,
      isHandOver: false,
      ...(autoApprove
        ? { approvedAt: new Date(), ticketNumber: `TKT-${Math.floor(100000 + Math.random() * 900000)}` }
        : { approvalDeadline: computeApprovalDeadline(normalized.startAt) }),
      providerPayout: 'held',
    });
    createdId = booking._id;

    // two payments for the last unit at the same moment: the later one loses
    await assertNoOverbooking(booking, listing);

    await Payment.create({
      booking: booking._id,
      user: dbUser._id,
      transactionId: intent.id,
      amount: normalized.totalPrice,
      currency: config.stripe.currency,
      status: TransactionStatus.PAID,
      gateway: PaymentGateway.STRIPE,
      paymentMethodType: 'Card',
      purpose: 'booking',
    });

    if (hasDraft)
      await BookingDraft.updateOne(
        { paymentIntentId: intent.id },
        { $set: { status: 'completed', booking: booking._id } },
      );

    // every text names the listing and when it takes place
    // ("6-Day 3 Valleys Pass on Fri 20 Nov"), exact values in `data`
    const what = `${listing.title || 'your booking'}${(w => (w ? ` on ${w}` : ''))(formatBookingWhen(booking))}`;
    const customerName = dbUser.fullName || 'A customer';
    await notify(dbUser._id, {
      title: autoApprove ? 'Booking confirmed' : 'Booking requested',
      description: autoApprove
        ? `${what} is confirmed. Ticket ${booking.ticketNumber}.`
        : `Payment received for ${what}. The provider will confirm your booking soon.`,
      data: {
        startAt: booking.startAt ?? null,
        ...(autoApprove ? { ticketNumber: booking.ticketNumber } : { approveBy: booking.approvalDeadline ?? null }),
      },
      booking,
      senderId: owner._id,
      event: autoApprove ? 'booking.confirmed' : 'booking.requested',
    });
    await notify(owner._id, {
      title: autoApprove ? 'New booking' : 'New booking request',
      description: autoApprove
        ? `${customerName} booked ${what}.`
        : `${customerName} requested ${what}. Approve or reject it before ${formatLocalDateTime(booking.approvalDeadline)}.`,
      booking,
      senderId: dbUser._id,
      event: 'booking.new',
      data: {
        startAt: booking.startAt ?? null,
        ...(autoApprove ? { ticketNumber: booking.ticketNumber } : { approveBy: booking.approvalDeadline ?? null }),
      },
    });
    emitBookingUpdated([dbUser._id, owner._id], booking, autoApprove ? 'Confirmed' : 'Pending');

    return booking;
  } catch (error: any) {
    if (createdId) {
      await Booking.deleteOne({ _id: createdId }).catch(() => null);
      await Payment.deleteOne({ booking: createdId }).catch(() => null);
    }
    const refunded = await refundQuietly(intent.id);
    const message = refunded
      ? `${error?.message || 'Booking failed.'} Your payment has been refunded.`
      : `${error?.message || 'Booking failed.'} The automatic refund failed. Please contact support (payment ${intent.id}).`;
    if (hasDraft)
      await BookingDraft.updateOne(
        { paymentIntentId: intent.id },
        { $set: { status: 'failed', error: message } },
      );
    const code =
      error instanceof AppError && error.code < 500 ? error.code : StatusCodes.CONFLICT;
    throw new AppError(refunded ? code : StatusCodes.INTERNAL_SERVER_ERROR, message);
  }
};

export const createBookingFromPayment = async (user: JwtPayload, payload: any) => {
  const paymentIntentId = String(payload?.paymentIntentId || payload?.transactionId || '');
  const existing = await existingBookingFor(paymentIntentId, String(user.userId));
  if (existing) return existing;

  const intent = await retrievePaidIntent(paymentIntentId);
  if (intent.metadata?.type === 'late_fee')
    throw bad('This payment is a late fee, not a booking.');

  // the request body may be partial: fall back to what was sent to /intent
  const draft: any = await BookingDraft.findOne({ paymentIntentId }).lean();
  const body = { ...(draft?.payload || {}), ...(payload || {}) };
  return bookPaidIntent(user, body, intent);
};

/** Stripe webhook: create the booking from the draft if the app didn't */
export const bookFromWebhook = async (intent: Stripe.PaymentIntent) => {
  const draft: any = await BookingDraft.findOne({ paymentIntentId: intent.id }).lean();
  if (!draft || draft.status !== 'pending') return { handled: false };
  const user = { userId: String(draft.user), email: draft.userEmail } as JwtPayload;
  try {
    const fresh = await retrievePaidIntent(intent.id);
    await bookPaidIntent(user, draft.payload, fresh);
  } catch {
    /* bookPaidIntent refunds and marks the draft failed */
  }
  return { handled: true };
};

/* ------------------------------------------------------------------ */
/* Safety net: paid but never booked                                   */
/* ------------------------------------------------------------------ */
/**
 * A customer can pay and then lose the app before /booking/create runs. The
 * webhook normally books it; if the webhook is missing or failed, this job
 * (every run) checks recent unfinished drafts with Stripe:
 *  - paid      -> create the booking now (or refund if it can't be made)
 *  - stuck in "processing" (server crashed mid-way) -> retried
 * Money is never kept without a booking.
 */
export const reconcileDrafts = async (now = new Date()) => {
  const settle = new Date(now.getTime() - 5 * 60 * 1000); // give the app 5 min first
  const oldest = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  // crashed while creating: if no booking was written, try again
  const stuck: any[] = await BookingDraft.find({
    status: 'processing',
    updatedAt: { $lte: new Date(now.getTime() - 10 * 60 * 1000) },
  })
    .limit(50)
    .lean();
  for (const d of stuck) {
    const payment: any = await Payment.findOne({ transactionId: d.paymentIntentId }).lean();
    await BookingDraft.updateOne(
      { _id: d._id, status: 'processing' },
      payment
        ? { $set: { status: 'completed', booking: payment.booking } }
        : { $set: { status: 'pending' } },
    );
  }

  const drafts: any[] = await BookingDraft.find({
    status: 'pending',
    createdAt: { $lte: settle, $gte: oldest },
  })
    .sort({ createdAt: 1 })
    .limit(50)
    .lean();
  let booked = 0;
  for (const d of drafts) {
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.retrieve(d.paymentIntentId);
    } catch {
      continue;
    }
    if (intent.status !== 'succeeded') continue; // not paid: nothing to do
    await bookFromWebhook(intent);
    booked++;
  }
  return booked;
};
