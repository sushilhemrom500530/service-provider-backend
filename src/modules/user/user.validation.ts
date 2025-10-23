import { z } from 'zod';


const completeProfileValidationSchema = z.object({
  body: z.object({
    gender: z.enum(['Male', 'Female'], {
      errorMap: () => ({
        message: 'Invalid gender. Valid options: Male, Female',
      }),
    }),
    age: z.string({
      required_error: 'Age is required.',
      invalid_type_error: 'Age must be a number.',
    }),
    fullName: z.string({
      required_error: 'Full name is required.',
      invalid_type_error: 'Full name must be a string.',
    }),
    religion: z.string({
      required_error: 'Religion is required.',
      invalid_type_error: 'Religion must be a string.',
    }),
    kids: z.enum(['Yes', 'No'], {
      errorMap: () => ({
        message: 'Invalid kids status. Valid options: Yes, NO',
      }),
    }),
    maritalStatus: z.enum(['Single', 'Divorced', 'Separated', 'Widowed'], {
      errorMap: () => ({
        message:
          'Invalid marital status. Valid options: Single, Divorced, Separated, Widowed',
      }),
    }),
    aboutMe: z.string({ required_error: 'About Me is required.' }),
  }),
});

const changeUserStatusValidationSchema = z.object({
  body: z.object({
    status: z.string({
      required_error: 'Status is required.',
      invalid_type_error:
        'Invalid status format. Valid options: Active,Delete,Block.',
    }),
  }),
});
const PrivacyVisibility = z.enum(['Public', 'Only Me', 'Friends']);

// Zod schema for privacy settings
const privacySettingsValidationSchema = z.object({
  body: z.object({
    privacySettings: z
      .object({
        ageRange: PrivacyVisibility.optional(),
        nickname: PrivacyVisibility.optional(),
        gender: PrivacyVisibility.optional(),
        location: PrivacyVisibility.optional(),
        locationName: PrivacyVisibility.optional(),
        country: PrivacyVisibility.optional(),
        state: PrivacyVisibility.optional(),
        city: PrivacyVisibility.optional(),
        profession: PrivacyVisibility.optional(),
        aboutMe: PrivacyVisibility.optional(),
        phoneNumber: PrivacyVisibility.optional(),
        maritalStatus: PrivacyVisibility.optional(),
      })
      .strict(), // Ensures no extra fields are allowed
  }),
});


const updateMyProfileSchema=z.object({
  body:z.object({
    fullName:z.string().optional(),
    age:z.string().optional(),
    gender:z.string().optional(),
    aboutMe:z.string().optional(),
  })
})

export const UserValidation = {
  changeUserStatusValidationSchema,
  completeProfileValidationSchema,
  privacySettingsValidationSchema,
  updateMyProfileSchema
};
