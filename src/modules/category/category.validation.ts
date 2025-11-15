import { z } from 'zod';

const PrimaryCategoryEnum = z.enum([
  'Ski_Pass',
  'Ski_Hire',
  'Transport',
  'Restaurant',
  'Massage',
]);

const subCategorySchema = z.object({
  name: z.string().min(1, 'Subcategory name is required'),
  categoryPhoto: z.string().url('Invalid category photo URL').optional(),
});

const createCategory = z.object({
  body: z.object({
    primaryCategoryName: PrimaryCategoryEnum,
    thumbnail: z.string().url('Invalid thumbnail URL').optional(),
    subCategory: z
      .array(subCategorySchema)
      .nonempty('At least one subcategory is required').optional(),
  }),
});

const updateCategory = z.object({
  body: z.object({
    primaryCategoryName: PrimaryCategoryEnum.optional(),
    thumbnail: z.string().url('Invalid thumbnail URL').optional(),
    subCategory: z.array(subCategorySchema).optional(),
  }),
});


const createSubCategory = z.object({
  body: z.object({
  name: z.string().min(1, 'Subcategory name is required'),
    categoryPhoto: z.string().url('Invalid category photo URL'),
  }),
});
 

export const CategoryValidation = {
  createCategory,
  updateCategory,
  subCategorySchema,
};
