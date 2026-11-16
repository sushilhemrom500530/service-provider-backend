import mongoose, { Schema, Model } from 'mongoose';
import { reviewSchema, refundSchema } from './../common/common.schema';
import { ISkiPass, ISkiPassType } from './skipass.interface';

const serviceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const skiPassSchema = new Schema<ISkiPass>(
  {
    title: { type: String, required: true, trim: true },
    thumbnail: { type: String, required: true, trim: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    skiPassType: {
      type: String,
      enum: Object.values(ISkiPassType),
      required: true,
    },
    services: {
      type: [serviceSchema],
      validate: [
        (arr: unknown[]) => Array.isArray(arr) && arr.length > 0,
        'At least one service is required',
      ],
      required: true,
    },
    serviceArea: { type: String, required: true, trim: true },
    // price per person (read by the booking module)
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, required: true, trim: true },

    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    reviews: { type: [reviewSchema], default: [] },
    refunds: { type: [refundSchema], default: [] },

    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

skiPassSchema.index({ isDeleted: 1, isActive: 1, createdAt: -1 });
skiPassSchema.index({ owner: 1, isDeleted: 1 });

// keep averageRating / reviewCount in sync when a doc with reviews is saved
skiPassSchema.pre('save', function (next) {
  const reviews = this.reviews || [];
  if (reviews.length > 0) {
    const total = reviews.reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0);
    this.averageRating = Math.round((total / reviews.length) * 10) / 10;
  }
  this.reviewCount = reviews.length;
  next();
});

export const SkiPass: Model<ISkiPass> =
  mongoose.models.SkiPass || mongoose.model<ISkiPass>('SkiPass', skiPassSchema);
