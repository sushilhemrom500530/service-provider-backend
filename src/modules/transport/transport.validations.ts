import { z } from 'zod';

const createTransport = z.object({
  body: z.object({
    category: z.string().trim().min(1).optional(),
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
    // category: z
    //   .string()
    //   .trim()
    //   .min(1, 'Category Brand ID is required')
    //   .optional(),

    // title: z.string().trim().min(1, 'Title is required').optional(),

    // serviceArea: z
    //   .string()
    //   .trim()
    //   .min(1, 'Service area is required')
    //   .optional(),

    // extraChargePerHours: z.coerce
    //   .number()
    //   .min(1, { message: 'Extra Time Per Hours must be greater than zero' })
    //   .optional(),

    // milage: z.string().min(1, 'Milage cannot be empty').optional(),
    // power: z.string().min(1, 'Power cannot be empty').optional(),
    // personCount: z.coerce.number().min(1, 'Person cannot be empty').optional(),

    // insuranceFee: z.coerce
    //   .number()
    //   .min(1, { message: 'Insurance Fee must be greater than zero' })
    //   .optional(),

    // maintainCharge: z.coerce
    //   .number()
    //   .min(1, { message: 'Maintain Charge must be greater than zero' })
    //   .optional(),

    // amount: z.coerce
    //   .number()
    //   .min(1, { message: 'Amount must be greater than zero' }),

    // description: z.string().trim().min(1, 'Description is required').optional(),
  }),
});

const updateTransport = z.object({
  body: z.object({
    category: z.string().trim().min(1).optional(),
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
