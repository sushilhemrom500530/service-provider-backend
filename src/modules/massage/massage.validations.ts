import { z } from 'zod';

 const durationByAmountSchema = z.object({
  duration: z.string({ required_error: 'Duration is required' }),
  amount: z.coerce
      .number()
      .min(1, { message: 'Amount must be greater than zero' }),
});


 const createMassage = z.object({
  body: z.object({
    title: z.string({ required_error: 'Title is required' }),
    description: z.string().optional(), 
    serviceArea: z.string({ required_error: 'Service area is required' }),
    amount: z.coerce
      .number()
      .min(1, { message: 'Amount must be greater than zero' }),
    durationByAmount: z
      .array(durationByAmountSchema)
      .min(1, 'At least one duration/amount pair is required'),
    benefits: z.string({ required_error: 'Benefits are required' }),
    ourRecommendations: z.string({
      required_error: 'Our recommendations are required',
    }),
  }),
});


 const updateMassage = z.object({
  body: z.object({
   title: z.string().min(1, 'Title cannot be empty').optional(),
    description: z.string().optional(), 
    serviceArea:  z.string().optional(),
    amount:  z.string().optional(),
    durationByAmount: z
      .array(durationByAmountSchema)
      .optional(),
    benefits:  z.string().optional(),
    ourRecommendations: z.string().optional(),
  }),
});

export const MassageValidations = {
  createMassage,
  updateMassage
};
