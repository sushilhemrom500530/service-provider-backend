import { z } from 'zod';

//  const durationByAmountSchema = z.object({
//   duration: z.string({ required_error: 'Duration is required' }),
//   amount: z.coerce
//       .number()
//       .min(1, { message: 'Amount must be greater than zero' }),
// });

const createMassage = z.object({
  body: z.object({
    category: z.string({ required_error: 'Category ID is required' }),
    title: z.string({ required_error: 'Title is required' }),
    openTime: z.string({ required_error: 'Open Time is required' }),
    closeTime: z.string({ required_error: 'Close Time is required' }),

    serviceArea: z.string({ required_error: 'Service area is required' }),
    amount: z.coerce
      .number()
      .min(1, { message: 'Amount must be greater than zero' }), 
     
    benefits: z.string({ required_error: 'Benefits are required' }),
    ourRecommendations: z.string({
      required_error: 'Our recommendations are required',
    }),
  }),
});

const updateMassage = z.object({
  body: z.object({
    category: z.string().min(1, 'Category ID cannot be empty').optional(),
    title: z.string().min(1, 'Title cannot be empty').optional(),
    openTime: z.string().optional(),
    closeTime: z.string().optional(), 
    serviceArea: z.string().optional(),
    amount: z.string().optional(), 
    benefits: z.string().optional(),
    ourRecommendations: z.string().optional(),
  }),
});

export const MassageValidations = {
  createMassage,
  updateMassage,
};
