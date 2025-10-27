import { z } from 'zod';

const createTransport = z.object({
  body: z.object({
    brandName: z.string().trim().min(1, 'Brand name is required'),
    title: z.string().trim().min(1, 'Title is required'),
    serviceArea: z.string().trim().min(1, 'Service area is required'),
    extraTimePerHours: z.coerce
      .number()
      .min(1, { message: 'Extra Time Per Hours must be greater than zero' }),
    specific: z.object(
      {
        milageCount: z.coerce.string().min(1, 'Milage cannot be empty'),
        powerCount: z.coerce.string().min(1, 'Power cannot be empty'),
        personCount: z.coerce.string().min(1, 'Person cannot be empty'),
      },
      {
        required_error: 'Specific is required',
        invalid_type_error: 'Specific must be an object',
      }
    ),
    // specific: z.object(
    //  {
    //   milageCount: z.coerce.number().min(1, 'Milage cannot be empty'),
    //   powerCount: z.coerce.number().min(1, 'Power cannot be empty'),
    //   personCount: z.coerce.number().min(1, 'Person cannot be empty'),
    // },
    //   {
    //     required_error: 'Specific is required',
    //     invalid_type_error: 'Specific must be an object',
    //   }
    // ),
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
