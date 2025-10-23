import { z } from 'zod';

 
const bookingStatusEnum = z.enum(['Active', 'Complete', 'Cancel', 'Delete']);

const categoryEnum = z.enum([
  'Ski_Pass',
  'Ski_Hire',
  'Transport',
  'Restaurant_Booking',
  'Massage',
]).optional();

const productModelEnum = z.enum([
  'SkiPass',
  'SkiHire',
  'Transport',
  'Restaurant',
  'Massage',
]).optional();

 
const bookingItemSchema = z.object({
  productId: z
    .string({
      required_error: 'Product ID is required in items',
      invalid_type_error: 'Product ID must be a string',
    })
    .min(1),
  quantity: z
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
      .preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date())
      .optional(),

    time: z.string().optional(),

    startDateAndTime: z
      .preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date())
      .optional(),

    endDateAndTime: z
      .preprocess((arg) => (arg ? new Date(arg as string) : undefined), z.date())
      .optional(),

    items: z.array(bookingItemSchema).optional(),
    orderType: z.string().optional(),
    itemCount: z.number().optional(),
    duration: z.string().optional(),
    bookingAgentText: z.string().optional(),

    bookingStatus: bookingStatusEnum.optional().default('Active'),
  }),
});

 
export const BookingRoutesValidations = {
  createBookingSchema,
};
