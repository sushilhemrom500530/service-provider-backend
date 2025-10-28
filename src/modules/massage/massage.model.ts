import mongoose, { Schema, Model } from 'mongoose';
import { IMassage } from './massage.interface';
import { reviewSchema, refundSchema } from './../common/common.schema';
 
const massageSchema = new Schema<IMassage>(
  {
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    thumbnail: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    openTime: {
      type: String,
      required: true,
      trim: true,
    },
    closeTime: {
      type: String,
      required: true,
      trim: true,
    }, 
    serviceArea: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    }, 
    benefits: {
      type: String,
      required: true,
    },
    ourRecommendations: {
      type: String,
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

massageSchema.pre('save', function (next) {
  if (this.reviews && this.reviews.length > 0) {
    const total = this.reviews.reduce((sum, r) => sum + r.rating, 0);
    this.averageRating = parseFloat((total / this.reviews.length).toFixed(1));
  }
  next();
});

export const Massage: Model<IMassage> =
  mongoose.models.Massage || mongoose.model<IMassage>('Massage', massageSchema);
