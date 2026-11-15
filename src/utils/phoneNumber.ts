// Values people type when they have no phone number
const PHONE_PLACEHOLDERS = ['n/a', 'na', 'none', 'null', 'undefined', '-', '--', '0'];

/**
 * Cleans a phone number before it is saved.
 *  - placeholders ("N/A", "-", "null", ...) -> ''   (empty = not set)
 *  - removes spaces, dashes, dots and brackets
 *  - "00" international prefix -> "+"            ("0033..." -> "+33...")
 * It does NOT guess a country code for numbers without one;
 * use `npm run fix:phone-numbers` for old records.
 */
export const normalizePhoneNumber = (value: unknown): unknown => {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed || PHONE_PLACEHOLDERS.includes(trimmed.toLowerCase())) return '';

  let cleaned = trimmed.replace(/[\s\-.()]/g, '');
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;

  return cleaned;
};

// "+" followed by 7 to 15 digits (E.164)
export const hasCountryCode = (phone: string) => /^\+[1-9]\d{6,14}$/.test(phone);
