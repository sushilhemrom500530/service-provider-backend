import { z } from 'zod';

const createTransport = z.object({
  body: z.object({
    brandName: z.string().trim().min(1, 'Brand name is required'),
    title: z.string().trim().min(1, 'Title is required'),
    personCount: z.coerce
      .number()
      .min(1, { message: 'Person count must be at least 1' }),
    serviceArea: z.string().trim().min(1, 'Service area is required'),
    amount: z.coerce
      .number()
      .min(1, { message: 'Amount must be greater than zero' }),
    description: z.string().trim().min(1, 'Description is required'),
  }),
});

const updateTransport = z.object({
  body: z.object({
    brandName: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
    personCount: z.coerce.number().min(1).optional(),
    serviceArea: z.string().trim().min(1).optional(),
    amount: z.coerce.number().min(1).optional(),
    description: z.string().trim().optional(),
    benefits: z.string().trim().optional(),
  }),
});

export const TransportValidations = {
  createTransport,
  updateTransport,
};
