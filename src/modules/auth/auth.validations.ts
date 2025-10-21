import { z } from 'zod';


export const registerProviderSchema = z.object({
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
    .enum(['user', 'provider', 'admin'], {
      required_error: 'Role is required',
      invalid_type_error: 'Role must be one of: user, provider, or admin',
    })
    .default('provider'),
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

const socialAuth = z.object({
  body: z.object({
    provider: z.enum(['google', 'twitter', 'facebook'], {
      required_error: 'Provider is required',
      invalid_type_error: 'Provider must be google, twitter, or facebook',
    }),
    userData: z.object({
      id: z.string({
        required_error: 'User ID is required',
        invalid_type_error: 'User ID must be a string',
      }).min(1, 'User ID cannot be empty'),
      email: z
        .string({
          required_error: 'Email is required',
          invalid_type_error: 'Email must be a string',
        })
        .email('Invalid email format')
        .toLowerCase(),
      name: z.string().optional(),
      displayName: z.string().optional(),
      username: z.string().optional(),
    }, {
      required_error: 'User data is required',
      invalid_type_error: 'User data must be an object',
    }),
  }),
});

const linkSocialAccount = z.object({
  body: z.object({
    provider: z.enum(['google', 'twitter', 'facebook'], {
      required_error: 'Provider is required',
      invalid_type_error: 'Provider must be google, twitter, or facebook',
    }),
    userData: z.object({
      id: z.string({
        required_error: 'User ID is required',
        invalid_type_error: 'User ID must be a string',
      }).min(1, 'User ID cannot be empty'),
      email: z
        .string({
          required_error: 'Email is required',
          invalid_type_error: 'Email must be a string',
        })
        .email('Invalid email format')
        .toLowerCase(),
      name: z.string().optional(),
      displayName: z.string().optional(),
      username: z.string().optional(),
    }, {
      required_error: 'User data is required',
      invalid_type_error: 'User data must be an object',
    }),
  }),
});

const unlinkSocialAccount = z.object({
  params: z.object({
    provider: z.enum(['google', 'twitter', 'facebook'], {
      required_error: 'Provider is required',
      invalid_type_error: 'Provider must be google, twitter, or facebook',
    }),
  }),
});

export const authValidations = {
  // register,
  login,
  verifyOTP,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
  socialAuth,
  linkSocialAccount,
  unlinkSocialAccount,
};
