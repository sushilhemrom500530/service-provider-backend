import { z } from 'zod'; 

const createTransport = z.object({
  brandName: z.string().trim().min(1, 'Brand name is required'),
  brandPhoto: z.string().trim().url('Invalid brand photo URL'),
  thumbnail: z.string().trim().url('Invalid thumbnail URL'),
  title: z.string().trim().min(1, 'Title is required'),
  personCount: z.number().min(1, 'Person count must be at least 1'),
  serviceArea: z.string().trim().min(1, 'Service area is required'),
  amount: z.number().min(0, 'Amount must be a positive number'),
  ownerId: z.string().min(1, 'Owner ID is required'),
});

const updateTransport = z.object({
  brandName: z.string().trim().min(1).optional(),
  brandPhoto: z.string().trim().url().optional(),
  thumbnail: z.string().trim().url().optional(),
  title: z.string().trim().min(1).optional(),
  personCount: z.number().min(1).optional(),
  serviceArea: z.string().trim().min(1).optional(),
  amount: z.number().min(0).optional(),
  ownerId: z.string().optional(),
  description: z.string().trim().optional(),
  benefits: z.string().trim().optional(),
});

export const TransportValidations = {
  createTransport,
  updateTransport,
};
