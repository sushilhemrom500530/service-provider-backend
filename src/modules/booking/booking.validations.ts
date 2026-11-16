import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a valid id');

const bookingItem = z.object({
  itemId: objectId,
  quantity: z.coerce.number().int().min(1),
});

/**
 * One request body for every category (fields that don't apply are ignored):
 *  Ski_Pass   : productId, date, personCount
 *  Massage    : productId, date, time, duration, personCount
 *  Restaurant : productId, date, slotId, bookingItems[{itemId (seat type), quantity}]
 *  Ski_Hire   : productId, startDateAndTime, endDateAndTime, bookingItems[{itemId, quantity}]
 *  Transport  : productId, startDateAndTime, endDateAndTime, personCount, address, destination
 */
const bookingRequest = z.object({
  productId: objectId,
  userId: objectId.optional(),
  date: z.string().optional(),
  time: z.string().max(20).optional(),
  duration: z.union([z.string(), z.number()]).optional(),
  personCount: z.coerce.number().int().min(1).max(100).optional(),
  startDateAndTime: z.string().optional(),
  endDateAndTime: z.string().optional(),
  bookingItems: z.array(bookingItem).max(20).optional(),
  slotId: objectId.optional(),
  slots: z.array(objectId).max(1).optional(),
  phoneNumber: z.string().max(40).optional(),
  address: z.string().max(300).optional(),
  destination: z.string().max(300).optional(),
});

const createPaymentIntentSchema = z.object({ body: bookingRequest });

const createBookingSchema = z.object({
  body: bookingRequest.partial().extend({
    paymentIntentId: z.string().startsWith('pi_').optional(),
    transactionId: z.string().optional(),
  }).refine(b => !!(b.paymentIntentId || b.transactionId), {
    message: 'paymentIntentId is required',
    path: ['paymentIntentId'],
  }),
});

const reasonSchema = z.object({
  body: z.object({ reason: z.string().trim().max(500).optional() }).optional().default({}),
});

const lateFeeConfirmSchema = z.object({
  body: z.object({ paymentIntentId: z.string().startsWith('pi_') }),
});

export const BookingRoutesValidations = {
  createPaymentIntentSchema,
  createBookingSchema,
  reasonSchema,
  lateFeeConfirmSchema,
};
