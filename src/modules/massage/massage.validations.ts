import { z } from 'zod';
import {
  formatDuration,
  isValidDurationMinutes,
  isValidTime,
  parseDurationMinutes,
} from './massage.utils';
import { MAX_CAPACITY, MAX_DURATION_MINUTES, MIN_DURATION_MINUTES } from './massage.constant';

/** '' / null / undefined -> undefined, so optional numbers don't become 0 or NaN */
const blankToUndefined = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : v;

const positivePrice = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .finite(`${label} must be a number`)
    .positive(`${label} must be greater than zero`);

const optionalPrice = (label: string) =>
  z.preprocess(blankToUndefined, positivePrice(label).optional());

/** guests at the same time (therapists), 1..MAX_CAPACITY; multipart sends a string */
const capacityField = (label: string) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ invalid_type_error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(1, `${label} must be at least 1`)
      .max(MAX_CAPACITY, `${label} can be at most ${MAX_CAPACITY}`)
      .optional(),
  );

const text = (label: string) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .trim()
    .min(1, `${label} is required`);

const time = (label: string) =>
  text(label).refine(isValidTime, {
    message: `${label} must be a time like "9:00 AM" or "21:30"`,
  });

/**
 * One duration option. Accepts the API shape {duration, price, id?}
 * and the old shape {duration, amount, _id?}. Output (stored form):
 * {id?, duration: "60 min", minutes: 60, amount}
 */
const durationEntry = z
  .object({
    id: z.string().optional(),
    _id: z.string().optional(),
    duration: z.union([z.string(), z.number()], {
      required_error: 'duration is required',
    }),
    minutes: z.any().optional(), // ignored on input (derived from duration)
    price: optionalPrice('price'),
    amount: optionalPrice('amount'),
  })
  .superRefine((v, ctx) => {
    if (!isValidDurationMinutes(parseDurationMinutes(v.duration)))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['duration'],
        message: `duration must be like "60", "60 min", "1h" or "1 hour 30 min" (${MIN_DURATION_MINUTES}-${MAX_DURATION_MINUTES} minutes)`,
      });
    if (v.price === undefined && v.amount === undefined)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['price'], message: 'price is required' });
  })
  .transform(v => {
    const minutes = parseDurationMinutes(v.duration) as number;
    return {
      id: v.id || v._id,
      minutes,
      duration: formatDuration(minutes),
      amount: (v.price ?? v.amount) as number,
    };
  });

const durationList = z
  .array(durationEntry, { invalid_type_error: 'durations must be a list' })
  .min(1, 'At least one duration is required')
  .max(20, 'At most 20 durations')
  .superRefine((list, ctx) => {
    const seen = new Set<number>();
    list.forEach((d, i) => {
      if (seen.has(d.minutes))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, 'duration'],
          message: `Duration "${d.duration}" is listed twice`,
        });
      seen.add(d.minutes);
    });
  });

const objectId = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .regex(/^[a-f\d]{24}$/i, `${label} must be a valid id`);

/** Old + new names, both optional here; required-ness is checked per schema */
const bodyFields = {
  category: objectId('category').optional(),
  title: text('title').optional(),
  description: z.string().trim().max(5000).optional(),
  openTime: time('openTime').optional(),
  closeTime: time('closeTime').optional(),
  serviceArea: text('serviceArea').optional(),
  amount: optionalPrice('amount'),
  benefits: text('benefits').optional(),
  ourRecommendations: text('ourRecommendations').optional(),
  recommendations: text('recommendations').optional(),
  priceByDuration: durationList.optional(),
  durations: durationList.optional(),
  capacity: capacityField('capacity'),
  therapists: capacityField('therapists'), // alias of capacity
};

/** Map API aliases to stored names */
const toStored = (b: any) => {
  const out: Record<string, any> = { ...b };
  if (b.durations !== undefined) out.priceByDuration = b.durations;
  if (b.recommendations !== undefined) out.ourRecommendations = b.recommendations;
  if (b.capacity === undefined && b.therapists !== undefined) out.capacity = b.therapists;
  delete out.durations;
  delete out.recommendations;
  delete out.therapists;
  return out;
};

const requireFields = (b: any, ctx: z.RefinementCtx) => {
  const required: [string, unknown][] = [
    ['category', b.category],
    ['title', b.title],
    ['openTime', b.openTime],
    ['closeTime', b.closeTime],
    ['serviceArea', b.serviceArea],
    ['benefits', b.benefits],
    ['recommendations', b.recommendations ?? b.ourRecommendations],
    ['durations', b.durations ?? b.priceByDuration],
  ];
  for (const [field, value] of required)
    if (value === undefined)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} is required` });
};

const createMassage = z.object({
  body: z.object(bodyFields).superRefine(requireFields).transform(toStored),
});

const updateMassage = z.object({
  body: z.object(bodyFields).transform(toStored),
});

const statusMassage = z.object({
  body: z.object({
    isActive: z.union([z.boolean(), z.enum(['true', 'false'])], {
      required_error: 'isActive is required',
      invalid_type_error: 'isActive must be true or false',
    }),
  }),
});

export const MassageValidations = {
  createMassage,
  updateMassage,
  statusMassage,
};
