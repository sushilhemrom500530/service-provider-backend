import { z } from 'zod';

const processPayPalPayment = z.object({
  body: z.object({
    bookingId: z.string({
      required_error: 'Booking ID is required',
      invalid_type_error: 'Booking ID must be a string',
    }).min(1, 'Booking ID is required'),
    
    paypalOrderId: z.string({
      required_error: 'PayPal Order ID is required',
      invalid_type_error: 'PayPal Order ID must be a string',
    }).min(1, 'PayPal Order ID is required'),
    
    transactionId: z.string({
      required_error: 'Transaction ID is required',
      invalid_type_error: 'Transaction ID must be a string',
    }).min(1, 'Transaction ID is required'),
  }),
});

const processZellePayment = z.object({
  body: z.object({
    bookingId: z.string({
      required_error: 'Booking ID is required',
      invalid_type_error: 'Booking ID must be a string',
    }).min(1, 'Booking ID is required'),
    
    zelleReference: z.string({
      required_error: 'Zelle Reference is required',
      invalid_type_error: 'Zelle Reference must be a string',
    }).min(1, 'Zelle Reference is required'),
  }),
});

const processRefund = z.object({
  params: z.object({
    id: z.string({
      required_error: 'Payment ID is required',
      invalid_type_error: 'Payment ID must be a string',
    }).min(1, 'Payment ID is required'),
  }),
  body: z.object({
    refundAmount: z.number({
      invalid_type_error: 'Refund amount must be a number',
    }).min(0, 'Refund amount must be positive').optional(),
  }),
});

const getPaymentById = z.object({
  params: z.object({
    id: z.string({
      required_error: 'Payment ID is required',
      invalid_type_error: 'Payment ID must be a string',
    }).min(1, 'Payment ID is required'),
  }),
});

export const paymentValidations = {
  processPayPalPayment,
  processZellePayment,
  processRefund,
  getPaymentById,
};