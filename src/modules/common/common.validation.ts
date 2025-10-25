import { z } from 'zod';

const reviewSchema = z.object({
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
});

const refundSchema = z.object({
  body: z.object({
    userId: z
      .string({
        required_error: 'User id is required',
        invalid_type_error: 'User id must be a string',
      })
      .min(1, 'User id cannot be empty'),
    reason: z
      .string({
        required_error: 'Comment is required',
        invalid_type_error: 'Comment must be a string',
      })
      .min(1, 'Comment cannot be empty'),
  }),
});
export const CommonValidations = {
  reviewSchema,
  refundSchema,
};
