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
    skiPassType: z.enum(['Basic', 'Vip', 'Premium'], {
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
    extraTimePerHours: z
      .string({
        required_error: 'Extra Time is required',
        invalid_type_error: 'Extra Time must be a string',
      })
      .min(1, 'Extra Time cannot be empty'),

    benefits: z.object(
      {
        perkingCount: z.coerce.number().min(1, 'Perking cannot be empty'),
        eventCount: z.coerce.number().min(1, 'Event cannot be empty'),
        lessionCount: z.coerce.number().min(1, 'Lession cannot be empty'),
      },
      {
        required_error: 'Benefits are required',
        invalid_type_error: 'Benefits must be an object',
      }
    ),
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

const updateSkiPassSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title cannot be empty').optional(),
    description: z.string().optional(),
    skiPassType: z.string().optional(),
    duration: z.string().optional(),
    time: z.string().optional(),
    benefits: z
      .object(
        {
          perkingCount: z.coerce.number().min(1, 'Perking cannot be empty'),
          eventCount: z.coerce.number().min(1, 'Event cannot be empty'),
          lessionCount: z.coerce.number().min(1, 'Lession cannot be empty'),
        },
        {
          required_error: 'Benefits are required',
          invalid_type_error: 'Benefits must be an object',
        }
      )
      .optional(),
    date: z.string().optional(),
    serviceArea: z.string().optional(),
    amount: z.coerce.number().optional(),
  }),
});

export const SkipassValidations = {
  createSkiPassSchema,
  updateSkiPassSchema,
};
