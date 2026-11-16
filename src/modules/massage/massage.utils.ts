import moment from 'moment-timezone';
import { MAX_DURATION_MINUTES, MIN_DURATION_MINUTES } from './massage.constant';

// units: m, mn, min, mins, minute, minutes / h, hr, hrs, hour, hours
const RE_MINUTES = /^(\d+(?:[.,]\d+)?)\s*(?:m|mn|min|mins|minute|minutes)?$/i;
const RE_HOURS = /^(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours)$/i;
const RE_HOURS_MINUTES =
  /^(\d+)\s*(?:h|hr|hrs|hour|hours)\s*(?:and\s*)?(\d+)\s*(?:m|mn|min|mins|minute|minutes)?$/i;

/**
 * Duration text -> whole minutes, or null when it can't be read.
 *  60, "60", "60 min", "60mins" -> 60
 *  "1h", "1 hour", "1.5 hours"  -> 60, 60, 90
 *  "1h 30", "1 hour 30 min"     -> 90
 */
export const parseDurationMinutes = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  const s = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return null;
  let minutes: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(RE_HOURS_MINUTES))) minutes = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = s.match(RE_HOURS))) minutes = Number(m[1].replace(',', '.')) * 60;
  else if ((m = s.match(RE_MINUTES))) minutes = Number(m[1].replace(',', '.'));
  if (minutes === null || !Number.isFinite(minutes) || !Number.isInteger(minutes)) return null;
  return minutes;
};

export const isValidDurationMinutes = (minutes: number | null): minutes is number =>
  minutes !== null && minutes >= MIN_DURATION_MINUTES && minutes <= MAX_DURATION_MINUTES;

/** Stored form for new data: "60 min" (booking's normalizeDuration -> "60min") */
export const formatDuration = (minutes: number) => `${minutes} min`;

// Same formats as src/utils/slotTime.ts (its parser isn't exported)
const TIME_FORMATS = ['h:mm A', 'hh:mm A', 'h:mmA', 'hh:mmA', 'H:mm', 'HH:mm'];

/** "9:00 AM", "09:00", "21:30" are valid; "25:00", "9am" are not */
export const isValidTime = (value: unknown) =>
  moment(String(value ?? '').trim(), TIME_FORMATS, true).isValid();
