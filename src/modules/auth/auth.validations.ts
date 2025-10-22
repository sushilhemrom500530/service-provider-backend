import { z } from 'zod';

const registerProviderSchema = z.object({
  body: z.object({
    email: z
      .string({
        required_error: 'Email is required',
        invalid_type_error: 'Email must be a string',
      })
      .email('Invalid email format')
      .toLowerCase(),
    password: z
      .string({
        required_error: 'Password is required',
        invalid_type_error: 'Password must be a string',
      })
      .min(8, 'Password must be at least 8 characters long'),

    providerType: z.enum(
      ['Ski_Pass', 'Ski_Hire', 'Transport', 'Restaurant_Booking', 'Massage'],
      {
        required_error: 'Provider Type is required',
        invalid_type_error:
          'Provider Type must be one of Ski_Pass, Ski_Hire, Transport, Restaurant_Booking, or Massage',
      }
    ),
    role: z
      .enum(['User', 'Provider', 'Admin'], {
        required_error: 'Role is required',
        invalid_type_error: 'Role must be one of: User, Provider, or Admin',
      }) 
  }),
});

export const updateUserSchema = z.object({
  fullName: z.string({
    required_error: 'Full name is required',
    invalid_type_error: 'Full name must be a string',
  }),
  email: z
    .string({
      required_error: 'Email is required',
      invalid_type_error: 'Email must be a string',
    })
    .email('Invalid email format')
    .toLowerCase(),
  password: z
    .string({
      required_error: 'Password is required',
      invalid_type_error: 'Password must be a string',
    })
    .min(8, 'Password must be at least 8 characters long'),
  phoneNumber: z.string({
    required_error: 'Phone number is required',
    invalid_type_error: 'Phone number must be a string',
  }), 
  service: z.object({
    serviceType: z.string({
      required_error: 'Service type is required',
      invalid_type_error: 'Service type must be a string',
    }),
    category: z
      .array(
        z.string({
          required_error: 'Category must contain strings',
          invalid_type_error: 'Category must be a string',
        })
      )
      .min(1, 'At least one category is required'),
  }),
  address: z.string({
    required_error: 'Address is required',
    invalid_type_error: 'Address must be a string',
  }),
  isDeleted: z.boolean().optional().default(false),
  role: z
    .enum(['User', 'Provider', 'Admin'], {
      required_error: 'Role is required',
      invalid_type_error: 'Role must be one of: User, Provider, or Admin',
    })
    .default('Provider'),
});
export const registerUserSchema = z.object({
  body: z.object({
    fullName: z.string({
      required_error: 'Full name is required',
      invalid_type_error: 'Full name must be a string',
    }),

    email: z
      .string({
        required_error: 'Email is required',
        invalid_type_error: 'Email must be a string',
      })
      .email('Invalid email format')
      .toLowerCase(),

    password: z
      .string({
        required_error: 'Password is required',
        invalid_type_error: 'Password must be a string',
      })
      .min(8, 'Password must be at least 8 characters long'),

    phoneNumber: z.string({
      required_error: 'Phone number is required',
      invalid_type_error: 'Phone number must be a string',
    }),

    address: z.string({
      required_error: 'Address is required',
      invalid_type_error: 'Address must be a string',
    }),

    isDeleted: z.boolean().optional().default(false),

    role: z
      .enum(['user', 'provider', 'admin'], {
        required_error: 'Role is required',
        invalid_type_error: 'Role must be one of: user, provider, or admin',
      })
      .default('user'),
  }),
});

export const registerSchema = z.object({
  body: z.object({
    fullName: z.string({
      required_error: 'Full name is required',
      invalid_type_error: 'Full name must be a string',
    }),

    email: z
      .string({
        required_error: 'Email is required',
        invalid_type_error: 'Email must be a string',
      })
      .email('Invalid email format')
      .toLowerCase(),

    password: z
      .string({
        required_error: 'Password is required',
        invalid_type_error: 'Password must be a string',
      })
      .min(8, 'Password must be at least 8 characters long'),

    phoneNumber: z.string({
      required_error: 'Phone number is required',
      invalid_type_error: 'Phone number must be a string',
    }),

    profileUrl: z
      .string({
        required_error: 'Profile URL is required',
        invalid_type_error: 'Profile URL must be a string',
      })
      .url('Profile URL must be a valid URL'),

    service: z.object({
      serviceType: z.string({
        required_error: 'Service type is required',
        invalid_type_error: 'Service type must be a string',
      }),
      category: z
        .array(
          z.string({
            required_error: 'Category must contain strings',
            invalid_type_error: 'Category must be a string',
          })
        )
        .min(1, 'At least one category is required'),
    }),

    address: z.string({
      required_error: 'Address is required',
      invalid_type_error: 'Address must be a string',
    }),

    isDeleted: z.boolean().optional().default(false),

    role: z
      .enum(['user', 'provider', 'admin'], {
        required_error: 'Role is required',
        invalid_type_error: 'Role must be one of: user, provider, or admin',
      })
      .default('provider'),
  }),
});

const login = z.object({
  body: z.object({
    email: z
      .string({
        required_error: 'Email is required',
        invalid_type_error: 'Email must be a string',
      })
      .email('Invalid email format')
      .toLowerCase(),
    password: z
      .string({
        required_error: 'Password is required',
        invalid_type_error: 'Password must be a string',
      })
      .min(1, 'Password is required'),
  }),
});

const verifyOTP = z.object({
  body: z.object({
    otp: z
      .string({
        required_error: 'OTP is required',
        invalid_type_error: 'OTP must be a string',
      })
      .length(6, 'OTP must be 6 digits'),
    email: z
      .string({
        required_error: 'Email is required',
        invalid_type_error: 'Email must be a string',
      })
      .email('Invalid email format')
      .toLowerCase(),
  }),
});

const forgotPassword = z.object({
  body: z.object({
    email: z
      .string({
        required_error: 'Email is required',
        invalid_type_error: 'Email must be a string',
      })
      .email('Invalid email format')
      .toLowerCase(),
  }),
});

const resetPassword = z.object({
  body: z.object({
    newPassword: z
      .string({
        required_error: 'New password is required',
        invalid_type_error: 'New password must be a string',
      })
      .min(8, {
        message: 'New password must be at least 8 characters',
      }),
    email: z
      .string({
        required_error: 'Email is required',
        invalid_type_error: 'Email must be a string',
      })
      .email('Invalid email format')
      .toLowerCase(),
  }),
});

const refreshToken = z.object({
  body: z.object({
    refreshToken: z.string({
      required_error: 'Refresh Toke is required',
      invalid_type_error: 'Refresh Token must be string',
    }),
  }),
});

const logout = z.object({
  body: z.object({
    refreshToken: z.string({
      required_error: 'Refresh Toke is required',
      invalid_type_error: 'Refresh Token must be string',
    }),
  }),
});

export const authValidations = {
  // register,
  registerProviderSchema,
  login,
  verifyOTP,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
};
