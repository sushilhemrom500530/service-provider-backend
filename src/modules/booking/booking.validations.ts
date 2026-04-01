import { z } from 'zod';

const bookingStatusEnum = z.enum(
  ['Active', 'Pending', 'Completed', 'Cancelled', 'Delete'],
  {
    required_error: 'Booking Status is required',
    invalid_type_error: 'Booking Status must be one of the allowed strings',
  },
);

const categoryEnum = z
  .enum(['Ski_Pass', 'Ski_Hire', 'Transport', 'Restaurant', 'Massage'])
  .optional();

const productModelEnum = z
  .enum(['SkiPass', 'SkiHire', 'Transport', 'Restaurant', 'Massage'])
  .optional();

const bookingItemSchema = z.object({
  itemId: z
    .string({
      required_error: 'Product ID is required in items',
      invalid_type_error: 'Product ID must be a string',
    })
    .min(1),
  quantity: z.coerce
    .number({
      required_error: 'Quantity is required',
      invalid_type_error: 'Quantity must be a number',
    })
    .positive(),
});

const createBookingSchema = z.object({
  body: z.object({
    userId: z
      .string({
        required_error: 'User ID is required',
        invalid_type_error: 'User ID must be a string',
      })
      .min(1),

    productId: z
      .string({
        invalid_type_error: 'Product ID must be a string',
      })
      .optional(),

    productModel: productModelEnum,
    category: categoryEnum,

    personCount: z
      .number({
        invalid_type_error: 'Person count must be a number',
      })
      .optional(),

    date: z
      .preprocess(arg => (arg ? new Date(arg as string) : undefined), z.date())
      .optional(),

    time: z.string().optional(),

    startDateAndTime: z
      .preprocess(arg => (arg ? new Date(arg as string) : undefined), z.date())
      .optional(),

    endDateAndTime: z
      .preprocess(arg => (arg ? new Date(arg as string) : undefined), z.date())
      .optional(),

    bookingItems: z.array(bookingItemSchema).optional(),
    orderType: z.string().optional(),
    itemCount: z.number().optional(),
    duration: z.string().optional(),
    bookingAgentText: z.string().optional(),

    bookingStatus: bookingStatusEnum.optional().default('Pending'),
  }),
});

export const updateBookingSchema = z.object({
  body: z.object({
    bookingStatus: bookingStatusEnum.optional(),
    isPermitted: z.boolean().optional(),
  }),
});

export const updatePermitBookingSchema = z.object({
  body: z.object({
    isPermitted: z.boolean({
      required_error: 'Permitted is required',
      invalid_type_error: 'Permitted must be a boolean',
    }),
  }),
});

export const BookingRoutesValidations = {
  createBookingSchema,
  updateBookingSchema,
  updatePermitBookingSchema,
};
