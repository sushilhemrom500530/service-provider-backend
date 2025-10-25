import mongoose, { Schema, Model } from 'mongoose';
import { ISkiPass } from './skiPass.interface';
import { reviewSchema, refundSchema } from './../common/common.schema';

const skiPassSchema = new Schema<ISkiPass>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
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
    skiPassType: {
      type: String,
      required: true,
    },
    duration: {
      type: String,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    serviceArea: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
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

skiPassSchema.pre('save', function (next) {
  if (this.reviews && this.reviews.length > 0) {
    const total = this.reviews.reduce((sum, r) => sum + r.rating, 0);
    this.averageRating = parseFloat((total / this.reviews.length).toFixed(1));
  }
  next();
});

export const SkiPass: Model<ISkiPass> =
  mongoose.models.SkiPass || mongoose.model<ISkiPass>('SkiPass', skiPassSchema);
