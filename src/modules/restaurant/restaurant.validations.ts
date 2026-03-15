import { z } from 'zod';

const slotSchema = z.object({
  startTime: z
    .string({
      required_error: 'Start time is required',
    })
    .min(1, 'Start time cannot be empty'),
  endTime: z
    .string({
      required_error: 'End time is required',
    })
    .min(1, 'End time cannot be empty'),
});

// Category Item Detail Schema
const categoryItemDetailSchema = z.object({
  seat: z.enum(['VIP', 'Normal'], {
    required_error: 'Seat type is required',
    invalid_type_error: 'Seat must be either VIP or Normal',
  }),
  photo: z
    .string({
      required_error: 'Photo is required',
    })
    .url('Photo must be a valid URL')
    .optional(),
  totalQty: z.coerce
    .number({
      required_error: 'Total quantity is required',
      invalid_type_error: 'Total quantity must be a number',
    })
    .min(0, 'Total quantity cannot be negative'),
  price: z.coerce
    .number({
      required_error: 'Price is required',
      invalid_type_error: 'Price must be a number',
    })
    .min(1, 'Price must be at least 1'),
  description: z.string().optional(),
});

// Main Restaurant Validation
export const createRestaurant = z.object({
  body: z.object({
    title: z
      .string({
        required_error: 'Title is required',
        invalid_type_error: 'Title must be a string',
      })
      .min(1, 'Title cannot be empty'),

    category: z
      .string({
        required_error: 'Category ID is required',
      })
      .min(1, 'Category cannot be empty'),

    openTime: z.string({
      required_error: 'Open time is required',
    }),

    closeTime: z.string({
      required_error: 'Close time is required',
    }),

    serviceArea: z
      .string({
        required_error: 'Service area is required',
      })
      .min(1, 'Service area cannot be empty'),

    foodType: z
      .string({
        required_error: 'Food type is required',
      })
      .min(1, 'Food type cannot be empty')
      .optional(),

    items: z
      .array(categoryItemDetailSchema, {
        required_error: 'Items are required',
        invalid_type_error: 'Items must be an array',
      })
      .nonempty('At least one item is required'),

    // description: z
    //   .string({
    //     required_error: 'Description is required',
    //   })
    //   .min(1, 'Description cannot be empty'),

    slots: z
      .array(slotSchema, {
        required_error: 'Slots are required',
        invalid_type_error: 'Slots must be an array',
      })
      .nonempty('At least one slot is required'),
  }),
});

const updateRestaurant = z.object({
  body: z.object({
    title: z.string().min(1, 'Title cannot be empty').optional(),
    thumbnail: z.string().url('Thumbnail must be a valid URL').optional(),
    category: z.string().min(1, 'Category ID cannot be empty').optional(),
    owner: z.string().min(1, 'Owner ID cannot be empty').optional(),
  }),
});

const updateServiceFee = z.object({
  body: z.object({
    serviceFee: z.coerce
      .number({
        required_error: 'Service fee is required',
        invalid_type_error: 'Service fee must be a number',
      })
      .min(1, 'Service fee must be at least 1'),
  }),
});

export const RestaurantValidations = {
  createRestaurant,
  updateRestaurant,
  updateServiceFee,
};
