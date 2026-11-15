import { z } from 'zod';

const priceUnitEnum = z.enum(['per_rental', 'per_day', 'per_hour'], {
  invalid_type_error: 'Price unit must be per_rental, per_day or per_hour',
});

const productItemSchema = z.object({
  productName: z
    .string({
      required_error: 'Menu item name is required',
    })
    .trim()
    .min(2, 'Item name must be at least 2 characters')
    .regex(/\p{L}/u, 'Item name must contain letters'),
  productPhoto: z
    .string({
      required_error: 'Product Photo is required',
    })
    .optional(),
  price: z.coerce
    .number()
    .min(1, { message: 'Amount must be greater than zero' }),

  quantity: z.coerce
    .number()
    .min(1, { message: 'Quantity must be greater than zero' }),
});

const createSkiHireSchema = z.object({
  body: z.object({
    category: z
      .string({
        required_error: 'Category is required',
        invalid_type_error: 'Category must be a string',
      })
      .min(1, 'Category cannot be empty'),
    title: z
      .string({
        required_error: 'Title is required',
        invalid_type_error: 'Title must be a string',
      })
      .min(1, 'Title cannot be empty'),

    extraChargePerHour: z.coerce
      .number()
      .min(1, { message: 'Extra Charge Per Hour must be greater than zero' })
      .optional(),

    priceUnit: priceUnitEnum.optional(),

    serviceArea: z.string({
      required_error: 'Service area is required',
    }),

    productItems: z
      .array(productItemSchema, {
        required_error: 'Product items are required',
      })
      .min(1, 'At least one menu item is required'),
  }),
});

const updateProductItemSchema = z.object({
  // _id: z.string({ required_error: 'Item _id is required' }),
  productName: z
    .string()
    .trim()
    .min(2, 'Item name must be at least 2 characters')
    .regex(/\p{L}/u, 'Item name must contain letters')
    .optional(),
  productPhoto: z.string().optional(),
  price: z.coerce.number().min(1).optional(),
  quantity: z.coerce.number().min(1).optional(),
});

const updateSkiHireSchema = z.object({
  body: z.object({
    category: z.string().min(1, 'Category cannot be empty').optional(),

    title: z.string().min(1, 'Title cannot be empty').optional(),

    owner: z.string().optional(),

    thumbnail: z.string().optional(),

    extraChargePerHour: z.coerce
      .number()
      .min(1, { message: 'Amount must be greater than zero' })
      .optional(),

    priceUnit: priceUnitEnum.optional(),

    serviceArea: z.string().optional(),

    productItems: z.array(updateProductItemSchema).optional(),
  }),
});

export const SkiHireValidations = {
  createSkiHireSchema,
  updateSkiHireSchema,
};
