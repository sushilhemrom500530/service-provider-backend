import mongoose, { Schema, Model } from 'mongoose';
import { reviewSchema, refundSchema } from './../common/common.schema';
import { IProductItems } from './skihire.interface';
 

const productItemsSchema = new Schema<IProductItems>({
  prorductName: {
    type: String,
    required: true,
    trim: true,
  },
  productPhoto: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 1,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
});

const skiHireSchema = new Schema<ISkiHire>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnail: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    }, 
    serviceArea: {
      type: String,
      required: true,
    },
    productItems: {
      type: [productItemsSchema],
      required: true,
    },
    // optional fields for later updates
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviews: {
      type: [reviewSchema],
      default: [],
    },
    refunds: {
      type: [refundSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

skiHireSchema.pre('save', function (next) {
  if (this.reviews && this.reviews.length > 0) {
    const total = this.reviews.reduce((sum, r) => sum + r.rating, 0);
    this.averageRating = parseFloat((total / this.reviews.length).toFixed(1));
  }
  next();
});

export const SkiHire: Model<ISkiHire> =
  mongoose.models.SkiHire || mongoose.model<ISkiHire>('SkiHire', skiHireSchema);
