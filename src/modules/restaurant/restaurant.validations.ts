import { z } from 'zod';

const createSkiPassSchema = z.object({
  body: z.object({
    title: z
      .string({
        required_error: 'Title is required',
        invalid_type_error: 'Title must be a string',
      })
      .min(1, 'Title cannot be empty'),
    description: z
      .string({
        required_error: 'Description is required',
        invalid_type_error: 'Description must be a string',
      })
      .min(1, 'Description cannot be empty'),
    ownerId: z
      .string({
        required_error: 'OwnerId is required',
        invalid_type_error: 'OwnerId must be a string',
      })
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId'),
    skiPassType: z.enum(['Basic', 'Premium', 'Family', 'Night', 'Custom'], {
      required_error: 'SkiPassType is required',
    }),
    duration: z
      .string({
        required_error: 'Duration is required',
        invalid_type_error: 'Duration must be a string',
      })
      .min(1, 'Duration cannot be empty'),
    time: z
      .string({
        required_error: 'Time is required',
        invalid_type_error: 'Time must be a string',
      })
      .min(1, 'Time cannot be empty'),
    date: z
      .string({
        required_error: 'Date is required',
        invalid_type_error: 'Date must be a string',
      })
      .refine(val => !isNaN(Date.parse(val)), 'Invalid date format'),
    serviceArea: z
      .string({
        required_error: 'Service area is required',
        invalid_type_error: 'Service area must be a string',
      })
      .min(1, 'Service area cannot be empty'),
    amount: z.coerce
      .number()
      .min(1, { message: 'Amount must be greater than zero' }),
  }),
});

const reviewSkiPassSchema = z.object({
  body: z.object({
    userId: z
      .string({
        required_error: 'User id is required',
        invalid_type_error: 'User id must be a string',
      })
      .min(1, 'User id cannot be empty'),
    rating: z
      .number({
        required_error: 'Rating is required',
        invalid_type_error: 'Rating must be a number',
      })
      .min(1, 'Rating must be between 1 and 5')
      .max(5, 'Rating must be between 1 and 5'),
    comment: z
      .string({
        required_error: 'Comment is required',
        invalid_type_error: 'Comment must be a string',
      })
      .min(1, 'Comment cannot be empty'),
  }),
})

export const SkipassValidations = {
  createSkiPassSchema,
  reviewSkiPassSchema
};
