/**
 * Booking business rules in one place: schedule, status, allowed actions,
 * cancellation refund and late fee. Pure functions (no database), so they
 * are easy to test and the same rule is used by the API, the jobs and the
 * responses.
 */
import moment from 'moment-timezone';
import { config } from '../../config';

/* ------------------------------------------------------------------ */
/* Policy (change here, documented in the integration guide)           */
/* ------------------------------------------------------------------ */
export const POLICY = {
  /** provider must approve within this many hours (or before the start) */
  APPROVAL_TIMEOUT_HOURS: 24,
  /** customer cancel: full refund until this many hours before the start */
  FREE_CANCEL_HOURS: 24,
  /** customer cancel inside the window: this % goes back to the card */
  LATE_CANCEL_REFUND_PERCENT: 90,
  /** rentals: minutes after the end before a late fee starts */
  LATE_FEE_GRACE_MINUTES: 15,
  /** rentals handed over and never returned: auto-closed after this */
  OVERDUE_AUTO_RETURN_HOURS: 48,
  /** most people on one Ski Pass booking (the app shows "Up to 10 per booking") */
  SKI_PASS_MAX_PEOPLE: 10,
};

export const RENTAL_CATEGORIES = ['Ski_Hire', 'Transport'];
export const OPEN_STATUSES = ['Active', 'Pending'];
export const CLOSED_CANCELLED = ['Cancelled', 'Deleted', 'Cancel'];

const MS_MIN = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const isRental = (category?: string) => RENTAL_CATEGORIES.includes(String(category));

/* ------------------------------------------------------------------ */
/* Time helpers (resort time zone)                                     */
/* ------------------------------------------------------------------ */
const TZ = () => config.booking?.timezone || 'Europe/Paris';
const TIME_FORMATS = ['h:mm A', 'hh:mm A', 'h:mmA', 'hh:mmA', 'H:mm', 'HH:mm', 'h A', 'hA'];

/** "2026-11-20", "2026-11-20T00:00:00+05:30", Date -> "2026-11-20" (calendar day as sent) */
export const toDayKey = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value.trim()))
    return value.trim().slice(0, 10);
  const d = new Date(value as any);
  if (isNaN(d.getTime())) return null;
  return moment(d).tz(TZ()).format('YYYY-MM-DD');
};

/** Minutes after midnight of "7:00 PM" / "19:00", or null */
export const timeToMinutes = (time: unknown): number | null => {
  const m = moment(String(time ?? '').trim(), TIME_FORMATS, true);
  return m.isValid() ? m.hours() * 60 + m.minutes() : null;
};

/** A local day + minutes after midnight in the resort zone -> Date */
export const atLocal = (dayKey: string, minutes: number) =>
  moment.tz(dayKey, 'YYYY-MM-DD', TZ()).startOf('day').add(minutes, 'minutes').toDate();

export const startOfLocalDay = (dayKey: string) => atLocal(dayKey, 0);
export const endOfLocalDay = (dayKey: string) =>
  moment.tz(dayKey, 'YYYY-MM-DD', TZ()).endOf('day').toDate();

/** Date -> "Tue 17 Nov, 4:13 AM CET" in the resort zone (for notification texts) */
export const formatLocalDateTime = (value: unknown): string | null => {
  if (!value) return null;
  const d = new Date(value as any);
  if (isNaN(d.getTime())) return null;
  return moment(d).tz(TZ()).format('ddd D MMM, h:mm A z');
};

/** Money for texts in the booking currency: 45 -> "€45.00", 378.5 -> "€378.50" */
export const formatMoney = (amount: unknown, currency: string = config.stripe?.currency || 'eur'): string => {
  const n = round2(Number(amount) || 0);
  const code = String(currency || 'eur').toUpperCase();
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${code}`; // unknown currency code
  }
};

/** A delay for texts: 15 -> "15 min", 60 -> "1 h", 75 -> "1 h 15 min" */
export const formatMinutes = (minutes: unknown): string => {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};

/** "60 min", "60", "1h", "1 hour 30 min", "90min" -> minutes (or null) */
export const durationToMinutes = (value: unknown): number | null => {
  const s = String(value ?? '').toLowerCase().trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  let total = 0;
  let matched = false;
  const h = s.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/);
  const m = s.match(/(\d+)\s*(m|min|mins|minute|minutes)\b/);
  if (h) {
    total += Number(h[1]) * 60;
    matched = true;
  }
  if (m) {
    total += Number(m[1]);
    matched = true;
  }
  return matched && total > 0 ? Math.round(total) : null;
};

/** Display form for a duration: "1 hrs" / "60mins" / "60" -> "60 min" (unreadable -> as is) */
export const formatDuration = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const minutes = durationToMinutes(value);
  return minutes ? `${minutes} min` : String(value);
};

/** Display form for a time of day: "14:00" / "2:00pm" -> "2:00 PM" (unreadable -> as is) */
export const formatTime = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const minutes = timeToMinutes(value);
  if (minutes === null) return String(value);
  return moment.utc(0).add(minutes, 'minutes').format('h:mm A');
};

/**
 * Length of opening hours in minutes; hours may cross midnight
 * ("8:45 PM"-"3:30 AM" -> 405). Same open and close = open 24 h. null if unreadable.
 */
export const openWindowMinutes = (openTime: unknown, closeTime: unknown): number | null => {
  const o = timeToMinutes(openTime);
  const c = timeToMinutes(closeTime);
  if (o === null || c === null) return null;
  return (c - o + 1440) % 1440 || 1440;
};

/** True when a session [time, time + length] fits inside the opening hours (midnight-safe) */
export const fitsOpeningHours = (time: unknown, length: number, openTime: unknown, closeTime: unknown) => {
  const window = openWindowMinutes(openTime, closeTime);
  const o = timeToMinutes(openTime);
  const s = timeToMinutes(time);
  if (window === null || o === null || s === null) return true; // unknown hours: don't block
  const offset = (s - o + 1440) % 1440;
  return offset + length <= window;
};

/* ------------------------------------------------------------------ */
/* Schedule                                                            */
/* ------------------------------------------------------------------ */
export type Schedule = { startAt: Date | null; endAt: Date | null };

/**
 * When a booking starts and ends, for every category:
 *  Ski Pass   : the whole local day of `date`
 *  Massage    : date + time (or the whole day) + duration
 *  Restaurant : the booked slot on `date` (slot may end after midnight)
 *  Ski Hire / Transport : startDateAndTime -> endDateAndTime
 */
export const computeSchedule = (b: any): Schedule => {
  if (b?.startAt && b?.endAt) return { startAt: new Date(b.startAt), endAt: new Date(b.endAt) };

  const category = String(b?.category);
  if (isRental(category)) {
    const s = b?.startDateAndTime ? new Date(b.startDateAndTime) : null;
    const e = b?.endDateAndTime ? new Date(b.endDateAndTime) : null;
    return {
      startAt: s && !isNaN(s.getTime()) ? s : null,
      endAt: e && !isNaN(e.getTime()) ? e : null,
    };
  }

  const day = toDayKey(b?.date);
  if (!day) return { startAt: null, endAt: null };

  if (category === 'Restaurant') {
    const s = timeToMinutes(b?.slotTime?.startTime);
    let e = timeToMinutes(b?.slotTime?.endTime);
    if (s === null) return { startAt: startOfLocalDay(day), endAt: endOfLocalDay(day) };
    if (e === null) e = s + 120;
    if (e <= s) e += 24 * 60;
    return { startAt: atLocal(day, s), endAt: atLocal(day, e) };
  }

  if (category === 'Massage') {
    const s = timeToMinutes(b?.time);
    const len = durationToMinutes(b?.duration) ?? 60;
    if (s === null) return { startAt: startOfLocalDay(day), endAt: endOfLocalDay(day) };
    return { startAt: atLocal(day, s), endAt: atLocal(day, s + len) };
  }

  // Ski Pass (and anything date-only)
  return { startAt: startOfLocalDay(day), endAt: endOfLocalDay(day) };
};

/** Provider must approve before this (24 h after booking, or the start if sooner) */
export const computeApprovalDeadline = (startAt: Date | null, now = new Date()) => {
  const limit = new Date(now.getTime() + POLICY.APPROVAL_TIMEOUT_HOURS * MS_HOUR);
  if (startAt && startAt.getTime() > now.getTime() && startAt < limit) return startAt;
  return limit;
};

/**
 * When a booking takes place, for notification texts (resort time zone):
 *  Ski Pass (whole day)      -> "Tue 17 Nov"
 *  others (a start time)     -> "Tue 17 Nov, 12:00 PM CET"
 * null when the booking has no readable date.
 */
export const formatBookingWhen = (b: any): string | null => {
  const { startAt } = computeSchedule(b);
  if (!startAt) return null;
  if (String(b?.category) === 'Ski_Pass') return moment(startAt).tz(TZ()).format('ddd D MMM');
  return formatLocalDateTime(startAt);
};

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */
export type ApiStatus = 'Pending' | 'Confirmed' | 'InProgress' | 'Completed' | 'Cancelled';

/**
 * One status for the app, derived from the stored fields:
 *  Pending    paid, waiting for the provider
 *  Confirmed  approved, not started
 *  InProgress rental handed over, or the service time has started
 *  Completed  finished
 *  Cancelled  cancelled / rejected / expired / refunded
 */
/**
 * A booking of the current flow (payout `held`) marked Completed WITHOUT
 * `completedAt` was closed by something outside this lifecycle, e.g. an old
 * server version still running its timer against the same database (it
 * completes rentals at their end time, ignoring hand-over/return). Every
 * completion in this code writes `completedAt`, so such a status is not
 * trusted: the booking is treated as still open and gets reopened by the jobs.
 */
export const isForeignCompletion = (b: any) =>
  String(b?.bookingStatus) === 'Completed' &&
  !b?.completedAt &&
  !b?.cancelledAt &&
  b?.providerPayout === 'held';

/** Mongo filter for the same condition */
export const FOREIGN_COMPLETION_FILTER = {
  bookingStatus: 'Completed',
  completedAt: { $exists: false },
  cancelledAt: { $exists: false },
  providerPayout: 'held',
};

/**
 * A CANCELLED booking that something outside this lifecycle (the same old
 * timer) later overwrote to Completed: it still has `cancelledAt` and never got
 * `completedAt`. The cancellation (and its refund) is the truth: it is shown as
 * Cancelled and put back to Cancelled by the jobs.
 */
export const isOverwrittenCancel = (b: any) =>
  String(b?.bookingStatus) === 'Completed' && !b?.completedAt && !!b?.cancelledAt;

/** Mongo filter for the same condition */
export const OVERWRITTEN_CANCEL_FILTER = {
  bookingStatus: 'Completed',
  completedAt: { $exists: false },
  cancelledAt: { $exists: true },
};

export const deriveStatus = (b: any, now = new Date()): ApiStatus => {
  const stored = String(b?.bookingStatus);
  if (CLOSED_CANCELLED.includes(stored) || isOverwrittenCancel(b)) return 'Cancelled';
  if (stored === 'Completed' && !isForeignCompletion(b)) return 'Completed';
  if (!b?.isPermitted) return 'Pending';
  if (isRental(b?.category)) return b?.isHandOver ? 'InProgress' : 'Confirmed';
  const { startAt } = computeSchedule(b);
  return startAt && startAt.getTime() <= now.getTime() ? 'InProgress' : 'Confirmed';
};

/* ------------------------------------------------------------------ */
/* Actions: what the viewer may do now (buttons in the app)            */
/* ------------------------------------------------------------------ */
export type Viewer = 'customer' | 'provider' | 'admin';

export const allowedActions = (
  b: any,
  viewer: Viewer,
  now = new Date(),
  opts: { reviewed?: boolean } = {},
): string[] => {
  const status = deriveStatus(b, now);
  const { startAt, endAt } = computeSchedule(b);
  const started = !!startAt && startAt.getTime() <= now.getTime();
  const actions: string[] = [];

  if (viewer === 'customer') {
    if ((status === 'Pending' || status === 'Confirmed') && !started && !b?.isHandOver)
      actions.push('cancel');
    if (b?.lateFee?.status === 'due') actions.push('pay_late_fee');
    // one review per customer per listing: hide it once written
    if (status === 'Completed' && !b?.noShow && !opts.reviewed) actions.push('review');
    return actions;
  }

  // provider / admin
  if (status === 'Pending') actions.push('approve', 'reject');
  if (status === 'Confirmed' && !started && !b?.isHandOver) actions.push('reject');
  if (isRental(b?.category)) {
    if (status === 'Confirmed' && (!endAt || endAt.getTime() > now.getTime()))
      actions.push('hand_over');
    if (status === 'InProgress') actions.push('return');
  } else if (status === 'InProgress') {
    actions.push('complete');
  }
  return actions;
};

/* ------------------------------------------------------------------ */
/* Money rules                                                         */
/* ------------------------------------------------------------------ */

/**
 * Customer cancellation refund (to the card):
 *  - not approved yet, or more than 24 h before the start -> 100 %
 *  - within 24 h of the start -> 90 % (provider keeps 10 %)
 */
export const customerCancelRefund = (b: any, now = new Date()) => {
  const total = round2(Number(b?.totalPrice) || 0);
  const { startAt } = computeSchedule(b);
  const hoursLeft = startAt ? (startAt.getTime() - now.getTime()) / MS_HOUR : Infinity;
  const full = !b?.isPermitted || hoursLeft > POLICY.FREE_CANCEL_HOURS;
  const percent = full ? 100 : POLICY.LATE_CANCEL_REFUND_PERCENT;
  const refund = round2((total * percent) / 100);
  return { percent, refund, kept: round2(total - refund), total };
};

/**
 * Service fee of a booking (Restaurant): platform money, included in
 * totalPrice. Stored on the booking at creation; a Restaurant booking made
 * before it was stored falls back to its listing's fee. Never more than
 * the price.
 */
export const serviceFeeOf = (b: any, listing?: any): number => {
  const total = round2(Number(b?.totalPrice) || 0);
  const stored = b?.serviceFee;
  const fee =
    stored !== undefined && stored !== null
      ? Number(stored) || 0
      : String(b?.category) === 'Restaurant'
        ? Number(listing?.serviceFee) || 0
        : 0;
  return round2(Math.min(Math.max(fee, 0), total));
};

/**
 * Split money the platform keeps from a booking (all of it, or the part
 * not refunded) into the platform service fee and the provider's gross
 * (on which the platform commission is taken). A partial amount carries
 * the service fee pro rata: 10 % kept of a 65 booking with a 5 fee ->
 * 0.50 service fee + 6.00 provider gross.
 */
export const splitServiceFee = (b: any, amount: number, listing?: any) => {
  const total = round2(Number(b?.totalPrice) || 0);
  const value = round2(Math.max(0, Number(amount) || 0));
  const fee = serviceFeeOf(b, listing);
  const serviceFee = total > 0 ? round2(Math.min(value, (value * fee) / total)) : 0;
  return { serviceFee, providerGross: round2(value - serviceFee) };
};

/**
 * Late return fee of a rental:
 *  15 min free, then every started hour × the listing's hourly charge,
 *  never more than the booking price.
 */
export const computeLateFee = (
  endAt: Date | null,
  returnedAt: Date,
  hourlyRate: number,
  cap: number,
) => {
  if (!endAt) return { hours: 0, amount: 0 };
  const lateMs = returnedAt.getTime() - endAt.getTime();
  if (lateMs <= POLICY.LATE_FEE_GRACE_MINUTES * MS_MIN) return { hours: 0, amount: 0 };
  const hours = Math.ceil(lateMs / MS_HOUR);
  const rate = Math.max(0, Number(hourlyRate) || 0);
  const amount = round2(Math.min(hours * rate, Math.max(0, Number(cap) || 0)));
  return { hours, amount };
};

/** Live timer for rental cards: time to start / to return / late so far */
export const rentalTimer = (b: any, hourlyRate: number, now = new Date()) => {
  if (!isRental(b?.category)) return null;
  const status = deriveStatus(b, now);
  if (status !== 'Confirmed' && status !== 'InProgress') return null;
  const { startAt, endAt } = computeSchedule(b);
  if (!startAt || !endAt) return null;

  if (status === 'Confirmed') {
    const ms = startAt.getTime() - now.getTime();
    return ms > 0
      ? { state: 'starts_in', minutes: Math.ceil(ms / MS_MIN), lateFee: 0 }
      : { state: 'pickup_due', minutes: Math.floor(-ms / MS_MIN), lateFee: 0 };
  }
  const ms = endAt.getTime() - now.getTime();
  if (ms >= 0) return { state: 'return_in', minutes: Math.ceil(ms / MS_MIN), lateFee: 0 };
  const fee = computeLateFee(endAt, now, hourlyRate, Number(b?.totalPrice) || 0);
  return { state: 'overdue', minutes: Math.floor(-ms / MS_MIN), lateFee: fee.amount };
};

export const MS = { MIN: MS_MIN, HOUR: MS_HOUR, DAY: MS_DAY };
