import { z } from 'zod';

/**
 * Multipart sends everything as strings: numbers are coerced, empty strings
 * count as "not sent". Old field names are mapped to the API names first:
 *   personCount -> seats, milage -> mileage,
 *   extraChargePerHours -> extraChargePerHour
 *
 * `insuranceFee` / `maintenanceFee` (old: `maintainCharge`) no longer exist:
 * the trip price is all-inclusive. Older app versions still send them, so
 * they are accepted and ignored (never stored, never charged).
 */
const ALIASES: Record<string, string> = {
  personCount: 'seats',
  milage: 'mileage',
  extraChargePerHours: 'extraChargePerHour',
};

/** Removed fields: dropped silently (older app versions still send them) */
const REMOVED = ['insuranceFee', 'maintenanceFee', 'maintainCharge'];

const normalizeBody = (raw: unknown) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const body: Record<string, any> = { ...(raw as Record<string, any>) };
  for (const [oldName, apiName] of Object.entries(ALIASES)) {
    if (isBlank(body[apiName]) && !isBlank(body[oldName])) body[apiName] = body[oldName];
    delete body[oldName];
  }
  for (const k of REMOVED) delete body[k];
  for (const k of Object.keys(body)) if (isBlank(body[k])) delete body[k];
  return body;
};

const isBlank = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

const requiredNumber = (name: string) =>
  z.preprocess(
    v => (v === undefined || typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN),
    z.number({ invalid_type_error: `${name} must be a number`, required_error: `${name} is required` })
      .finite(`${name} must be a number`),
  );

const money = (name: string) => requiredNumber(name).pipe(z.number().min(0, `${name} cannot be negative`));
/** string field; a number is accepted and turned into a string ("15" / 15) */
const asString = (v: unknown) => (typeof v === 'number' ? String(v) : v);
const text = (name: string, max = 200) =>
  z.preprocess(
    asString,
    z.string({ required_error: `${name} is required`, invalid_type_error: `${name} must be text` })
      .trim()
      .min(1, `${name} is required`)
      .max(max),
  );

const fields = {
  category: z.string({ required_error: 'category is required' }).trim().min(1, 'category is required'),
  title: text('title', 150),
  serviceArea: text('serviceArea', 200),
  amount: requiredNumber('amount').pipe(z.number().gt(0, 'amount must be greater than 0')),
  seats: requiredNumber('seats').pipe(
    z.number().int('seats must be a whole number').min(1, 'seats must be at least 1').max(100),
  ),
  mileage: text('mileage', 50),
  power: z.preprocess(asString, z.string({ invalid_type_error: 'power must be text' }).trim().max(50)),
  extraChargePerHour: money('extraChargePerHour'),
  description: z.string().trim().max(5000),
};

const createBody = z.object({
  ...fields,
  power: fields.power.optional(),
  description: fields.description.optional(),
});

const updateBody = z.object({
  category: fields.category.optional(),
  title: fields.title.optional(),
  serviceArea: fields.serviceArea.optional(),
  amount: fields.amount.optional(),
  seats: fields.seats.optional(),
  mileage: fields.mileage.optional(),
  power: fields.power.optional(),
  extraChargePerHour: fields.extraChargePerHour.optional(),
  description: fields.description.optional(),
});

const createTransport = z.object({
  body: z.preprocess(normalizeBody, createBody),
});

const updateTransport = z.object({
  body: z.preprocess(normalizeBody, updateBody),
});

const updateStatus = z.object({
  body: z.object({
    isActive: z.union([z.boolean(), z.enum(['true', 'false']).transform(v => v === 'true')], {
      errorMap: () => ({ message: 'isActive must be true or false' }),
    }),
  }),
});

/** Parse a (merged) request body into clean API fields: used by the service */
export const parseCreateBody = (body: unknown) => createBody.parse(normalizeBody(body));
export const parseUpdateBody = (body: unknown) => updateBody.parse(normalizeBody(body));

export type TransportCreateInput = z.infer<typeof createBody>;
export type TransportUpdateInput = z.infer<typeof updateBody>;

export const TransportValidations = {
  createTransport,
  updateTransport,
  updateStatus,
};
