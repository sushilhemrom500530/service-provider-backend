import { z } from 'zod';

const createTransport = z.object({
  body: z.object({ 
    brand: z.string().trim().min(1, 'Brand ID is required'),
    title: z.string().trim().min(1, 'Title is required'),
    serviceArea: z.string().trim().min(1, 'Service area is required'),
    extraChargePerHours: z.coerce
      .number()
      .min(1, { message: 'Extra Time Per Hours must be greater than zero' }),

    milage: z.string().min(1, 'Milage cannot be empty'),
    power: z.string().min(1, 'Power cannot be empty'),
    personCount: z.coerce.number().min(1, 'Person cannot be empty'),

    insuranceFee: z.coerce
      .number()
      .min(1, { message: 'Insurance Fee must be greater than zero' }),
    maintainCharge: z.coerce
      .number()
      .min(1, { message: 'Maintain Charge must be greater than zero' }),
    amount: z.coerce
      .number()
      .min(1, { message: 'Amount must be greater than zero' }),
    description: z.string().trim().min(1, 'Description is required'),
  }),
});

const updateTransport = z.object({
  body: z.object({
    brand: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
    serviceArea: z.string().trim().min(1).optional(),
    extraChargePerHours: z.coerce.number().min(1).optional(),
    milage: z.string().trim().min(1).optional(),
    power: z.string().trim().min(1).optional(),
    personCount: z.coerce.number().min(1).optional(),
    insuranceFee: z.coerce.number().min(1).optional(),
    maintainCharge: z.coerce.number().min(1).optional(),
    amount: z.coerce.number().min(1).optional(),
    description: z.string().trim().optional(), 
  }),
});

export const TransportValidations = {
  createTransport,
  updateTransport,
};
