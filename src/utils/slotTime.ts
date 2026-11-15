import moment from 'moment-timezone';
import AppError from '../errors/AppErro';
import { StatusCodes } from 'http-status-codes';

// Longest restaurant slot accepted (a slot may cross midnight: 10:30 PM - 12:30 AM)
export const MAX_SLOT_HOURS = 6;

const TIME_FORMATS = ['h:mm A', 'hh:mm A', 'h:mmA', 'hh:mmA', 'H:mm', 'HH:mm'];

const toMinutes = (time: string): number | null => {
  const m = moment(String(time ?? '').trim(), TIME_FORMATS, true);
  return m.isValid() ? m.hours() * 60 + m.minutes() : null;
};

/**
 * Length of a slot in minutes (crossing midnight allowed),
 * or null when a time can't be read.
 *  "7:00 PM" - "9:00 PM"   -> 120
 *  "10:30 PM" - "12:30 AM" -> 120
 *  "10:30 PM" - "12:30 PM" -> 840  (14 h: too long, a typo for AM)
 */
export const slotLengthMinutes = (start: string, end: string): number | null => {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null) return null;
  const diff = e - s;
  return diff > 0 ? diff : diff + 24 * 60;
};

export const isValidSlot = (start: string, end: string) => {
  const len = slotLengthMinutes(start, end);
  return len !== null && len > 0 && len < 24 * 60 && len <= MAX_SLOT_HOURS * 60;
};

// Throws a 400 for the first invalid slot in the list
export const assertValidSlots = (slots: { startTime: string; endTime: string }[] = []) => {
  for (const slot of slots) {
    if (!isValidSlot(slot?.startTime, slot?.endTime))
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Invalid slot "${slot?.startTime} - ${slot?.endTime}". Use times like "7:00 PM"; the end must be after the start and the slot at most ${MAX_SLOT_HOURS} hours long.`,
      );
  }
};
