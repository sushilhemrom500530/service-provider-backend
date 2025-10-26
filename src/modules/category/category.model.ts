import mongoose, { Schema, Document, Model } from 'mongoose';
import { ICategory, ISubCategory } from './category.interface';

const subCategorySchema = new Schema<ISubCategory>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    categoryPhoto: {
      type: String,
      required: true,
    },
  },
  {
    _id: false,
  }
);

// User schema
const categorySchema = new Schema<ICategory>(
  {
    primaryCategoryName: {
      type: String,
      enum: ['Ski_Pass', 'Ski_Hire', 'Transport', 'Restaurant', 'Massage'],
      required: true,
    },
    subCategory: {
      type: [subCategorySchema],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Category: Model<ICategory> =
  mongoose.models.Category || mongoose.model<ICategory>('Category', categorySchema);
