import { z } from 'zod';

const menuItemSchema = z.object({
  name: z.string({
    required_error: 'Menu item name is required',
  }),
  menuType: z.string({
    required_error: 'Menu type is required',
  }),
  price: z.coerce
    .number()
    .min(1, { message: 'Amount must be greater than zero' }),

  menuPhoto: z
    .string({
      required_error: 'Menu image is required',
    })
    .optional(),
  description: z.string({
    required_error: 'Description is required',
  }),
  
  quantity: z.coerce
    .number()
    .min(1, { message: 'Quantity must be greater than zero' })
    .max(25, { message: 'Quantity must be less than or equal to 25' }),
});

const createRestaurant = z.object({
  body: z.object({
    title: z
      .string({
        required_error: 'Title is required',
        invalid_type_error: 'Title must be a string',
      })
      .min(1, 'Title cannot be empty'),

    openTime: z.string({
      required_error: 'Open time is required',
    }),

    closeTime: z.string({
      required_error: 'Close time is required',
    }),

    serviceArea: z.string({
      required_error: 'Service area is required',
    }),

    menuItems: z
      .array(menuItemSchema, {
        required_error: 'Menu items are required',
      })
      .min(1, 'At least one menu item is required'),
  }),
});

const updateRestaurant = z.object({
  body: z.object({
    title: z.string().min(1, 'Title cannot be empty').optional(),

    ownerId: z.string().optional(),

    thumbnail: z.string().optional(),

    openTime: z.string().optional(),

    closeTime: z.string().optional(),

    serviceArea: z.string().optional(),

    totalPrice: z
      .number({
        invalid_type_error: 'Total price must be a number',
      })
      .min(0, 'Total price must be non-negative')
      .optional(),

    items: z
      .array(menuItemSchema)
      .min(1, 'At least one menu item is required')
      .optional(),
  }),
});

export const RestaurantValidations = {
  createRestaurant,
  updateRestaurant,
};
