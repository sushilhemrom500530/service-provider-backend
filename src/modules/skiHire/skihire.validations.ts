import { z } from 'zod';

/** multipart sends '' for empty fields: treat them as "not sent" */
const blankToUndefined = (v: unknown) =>
  v === '' || v === null || v === 'null' || v === 'undefined' ? undefined : v;

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(blankToUndefined, schema.optional());

const priceUnitEnum = z.enum(['per_rental', 'per_day', 'per_hour'], {
  errorMap: () => ({ message: 'priceUnit must be per_rental, per_day or per_hour' }),
});

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'must be a valid id');

const itemName = z
  .string({ invalid_type_error: 'Item name must be a string' })
  .trim()
  .min(2, 'Item name must be at least 2 characters')
  .regex(/\p{L}/u, 'Item name must contain letters');

/**
 * One item. Accepts the clean API names { id, name, photo, price, quantity }
 * and the old app names { _id, productName, productPhoto, price, quantity }.
 */
const itemSchema = z.object({
  id: z.preprocess(blankToUndefined, objectId.optional()),
  _id: z.preprocess(blankToUndefined, objectId.optional()),
  name: z.preprocess(blankToUndefined, itemName.optional()),
  productName: z.preprocess(blankToUndefined, itemName.optional()),
  photo: z.string().optional(),
  productPhoto: z.string().optional(),
  price: optionalNumber(z.coerce.number().positive('Item price must be greater than zero')),
  quantity: optionalNumber(
    z.coerce
      .number()
      .int('Item quantity must be a whole number')
      .min(1, 'Item quantity must be at least 1'),
  ),
});

const newItemSchema = itemSchema.superRefine((item, ctx) => {
  if (!item.name && !item.productName)
    ctx.addIssue({ code: 'custom', path: ['name'], message: 'Item name is required' });
  if (item.price === undefined)
    ctx.addIssue({ code: 'custom', path: ['price'], message: 'Item price is required' });
  if (item.quantity === undefined)
    ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Item quantity is required' });
});

const extraChargePerHour = optionalNumber(
  z.coerce.number().min(0, 'extraChargePerHour cannot be negative'),
);

const createSkiHireSchema = z.object({
  body: z
    .object({
      category: z
        .string({ required_error: 'category is required' })
        .trim()
        .min(1, 'category is required'),
      title: z
        .string({ required_error: 'title is required' })
        .trim()
        .min(1, 'title is required')
        .max(150),
      description: z.string().trim().max(5000).optional(),
      thumbnail: z.string().trim().url('thumbnail must be a URL').optional(),
      extraChargePerHour,
      priceUnit: z.preprocess(blankToUndefined, priceUnitEnum.optional()),
      serviceArea: z
        .string({ required_error: 'serviceArea is required' })
        .trim()
        .min(1, 'serviceArea is required'),
      items: z.array(newItemSchema).min(1, 'At least one item is required').optional(),
      productItems: z
        .array(newItemSchema)
        .min(1, 'At least one item is required')
        .optional(),
    })
    .superRefine((body, ctx) => {
      if (!body.items && !body.productItems)
        ctx.addIssue({
          code: 'custom',
          path: ['items'],
          message: 'items is required (at least one item)',
        });
    }),
});

const updateSkiHireSchema = z.object({
  body: z.object({
    category: z.string().trim().min(1, 'category cannot be empty').optional(),
    title: z.string().trim().min(1, 'title cannot be empty').max(150).optional(),
    description: z.string().trim().max(5000).optional(),
    thumbnail: z.string().trim().url('thumbnail must be a URL').optional(),
    extraChargePerHour,
    priceUnit: z.preprocess(blankToUndefined, priceUnitEnum.optional()),
    serviceArea: z.string().trim().min(1, 'serviceArea cannot be empty').optional(),
    items: z.array(itemSchema).optional(),
    productItems: z.array(itemSchema).optional(),
    removeItemIds: z.preprocess(
      v => (typeof v === 'string' ? (v.trim() ? v.split(',') : undefined) : v),
      z.array(objectId).optional(),
    ),
  }),
});

const statusSchema = z.object({
  body: z.object({
    isActive: z.preprocess(
      v => (v === 'true' ? true : v === 'false' ? false : v),
      z.boolean({
        required_error: 'isActive is required',
        invalid_type_error: 'isActive must be true or false',
      }),
    ),
  }),
});

export const SkiHireValidations = {
  createSkiHireSchema,
  updateSkiHireSchema,
  statusSchema,
};
