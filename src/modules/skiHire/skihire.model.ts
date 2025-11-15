import mongoose, { Schema, Model } from 'mongoose';
import { reviewSchema, refundSchema } from './../common/common.schema';
import { IProductItems,ISkiHire } from './skihire.interface';
import { IReview } from './../common/common.interface';

const productItemsSchema = new Schema<IProductItems>({
  productName: {
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
  totalQty: {
    type: Number,
    required: true,
    min: 1,
  },
  availableQty: {
      type: Number,
      required: true,
      default: 0,
  },
});

const skiHireSchema = new Schema<ISkiHire>(
  {
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
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
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    extraChargePerHour: {
      type: Number,
      required: false,
      default: 0,
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
    items: {
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

skiHireSchema.pre<ISkiHire>('save', function (next) {
  // Ensure reviews is always an array
  const reviews = this.reviews || [];

  if (reviews.length > 0) {
    const total = reviews.reduce((sum: number, r: IReview) => sum + r.rating, 0);
    this.averageRating = parseFloat((total / reviews.length).toFixed(1));
  }

  next();
});


export const SkiHire: Model<ISkiHire> =
  mongoose.models.SkiHire || mongoose.model<ISkiHire>('SkiHire', skiHireSchema);
