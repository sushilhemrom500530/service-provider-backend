import { z } from 'zod';

const serviceSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty'),
  description: z.string().min(1, 'Description cannot be empty'),
});

const createSkiPassSchema = z.object({
  body: z.object({
    title: z
      .string({
        required_error: 'Title is required',
        invalid_type_error: 'Title must be a string',
      })
      .min(1, 'Title cannot be empty'),
 
    skiPassType: z.enum(['Basic', 'Vip', 'Premium'], {
      required_error: 'SkiPassType is required',
    }),

    services: z.array(serviceSchema).min(1, 'At least one service is required'),

    serviceArea: z
      .string({
        required_error: 'Service area is required',
        invalid_type_error: 'Service area must be a string',
      })
      .min(1, 'Service area cannot be empty'),

    amount: z.coerce
      .number()
      .min(1, { message: 'Amount must be greater than zero' }),

    description: z.string({
      required_error: 'Description is required',
      invalid_type_error: 'Description must be a string',
    }),
  }),
});

const updateSkiPassSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title cannot be empty').optional(),
    description: z.string().min(1, 'Description cannot be empty').optional(),
    skiPassType: z.enum(['Basic', 'Vip', 'Premium']).optional(),
    services: z
      .array(serviceSchema)
      .min(1, 'At least one service is required')
      .optional(),
    serviceArea: z.string().min(1, 'Service area cannot be empty').optional(),
    amount: z.coerce
      .number()
      .min(1, 'Amount must be greater than zero')
      .optional(),
  }),
});

export const SkipassValidations = {
  createSkiPassSchema,
  updateSkiPassSchema,
};
