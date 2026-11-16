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
export const deriveStatus = (b: any, now = new Date()): ApiStatus => {
  const stored = String(b?.bookingStatus);
  if (CLOSED_CANCELLED.includes(stored)) return 'Cancelled';
  if (stored === 'Completed') return 'Completed';
  if (!b?.isPermitted) return 'Pending';
  if (isRental(b?.category)) return b?.isHandOver ? 'InProgress' : 'Confirmed';
  const { startAt } = computeSchedule(b);
  return startAt && startAt.getTime() <= now.getTime() ? 'InProgress' : 'Confirmed';
};

/* ------------------------------------------------------------------ */
/* Actions: what the viewer may do now (buttons in the app)            */
/* ------------------------------------------------------------------ */
export type Viewer = 'customer' | 'provider' | 'admin';

export const allowedActions = (b: any, viewer: Viewer, now = new Date()): string[] => {
  const status = deriveStatus(b, now);
  const { startAt, endAt } = computeSchedule(b);
  const started = !!startAt && startAt.getTime() <= now.getTime();
  const actions: string[] = [];

  if (viewer === 'customer') {
    if ((status === 'Pending' || status === 'Confirmed') && !started && !b?.isHandOver)
      actions.push('cancel');
    if (b?.lateFee?.status === 'due') actions.push('pay_late_fee');
    if (status === 'Completed' && !b?.noShow) actions.push('review');
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
