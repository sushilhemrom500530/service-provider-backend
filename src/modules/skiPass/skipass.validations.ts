import { z } from 'zod';
import { SKI_PASS_TYPES } from './skipass.interface';

/**
 * Accepted input names (clean API name first, then the old one the app sends):
 *   passType | skiPassType   -> skiPassType
 *   price    | amount        -> amount (per person)
 */
const normalizeBody = (raw: unknown) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const body: Record<string, any> = { ...(raw as Record<string, any>) };

  if (body.skiPassType === undefined && body.passType !== undefined)
    body.skiPassType = body.passType;
  if (typeof body.skiPassType === 'string') {
    const match = SKI_PASS_TYPES.find(
      t => t.toLowerCase() === body.skiPassType.trim().toLowerCase(),
    );
    if (match) body.skiPassType = match;
  }

  if (
    (body.amount === undefined || body.amount === '') &&
    body.price !== undefined &&
    typeof body.price !== 'object'
  )
    body.amount = body.price;
  if (body.amount === '') delete body.amount;

  delete body.passType;
  delete body.price;
  return body;
};

const serviceSchema = z.object({
  title: z.string({ required_error: 'Service title is required' }).trim().min(1, 'Service title cannot be empty'),
  description: z
    .string({ required_error: 'Service description is required' })
    .trim()
    .min(1, 'Service description cannot be empty'),
});

const passType = z.enum(SKI_PASS_TYPES, {
  required_error: 'passType is required',
  invalid_type_error: `passType must be one of ${SKI_PASS_TYPES.join(', ')}`,
});

const amount = z.coerce
  .number({ required_error: 'price is required', invalid_type_error: 'price must be a number' })
  .finite('price must be a number')
  .positive('price must be greater than zero');

const booleanish = z.preprocess(
  v => (v === 'true' ? true : v === 'false' ? false : v),
  z.boolean({ invalid_type_error: 'isActive must be true or false' }),
);

const text = (label: string) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be a string` })
    .trim()
    .min(1, `${label} cannot be empty`);

const createSkiPassSchema = z.object({
  body: z.preprocess(
    normalizeBody,
    z.object({
      title: text('title').max(150),
      skiPassType: passType,
      services: z.array(serviceSchema, { required_error: 'services is required' }).min(1, 'At least one service is required'),
      serviceArea: text('serviceArea').max(150),
      amount,
      description: text('description').max(5000),
    }),
  ),
});

const updateSkiPassSchema = z.object({
  body: z.preprocess(
    normalizeBody,
    z.object({
      title: text('title').max(150).optional(),
      skiPassType: passType.optional(),
      services: z.array(serviceSchema).min(1, 'At least one service is required').optional(),
      serviceArea: text('serviceArea').max(150).optional(),
      amount: amount.optional(),
      description: text('description').max(5000).optional(),
      isActive: booleanish.optional(),
    }),
  ),
});

const statusSchema = z.object({
  body: z.object({ isActive: booleanish }),
});

export const SkipassValidations = {
  createSkiPassSchema,
  updateSkiPassSchema,
  statusSchema,
};
