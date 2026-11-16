import mongoose, { Schema, Model } from 'mongoose';
import { IMassage } from './massage.interface';
import { reviewSchema, refundSchema } from './../common/common.schema';

const priceByDurationSchema = new Schema({
  duration: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
});

const massageSchema = new Schema<IMassage>(
  {
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    thumbnail: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    openTime: { type: String, required: true, trim: true },
    closeTime: { type: String, required: true, trim: true },
    priceByDuration: { type: [priceByDurationSchema], required: true },
    serviceArea: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    benefits: { type: String, required: true },
    ourRecommendations: { type: String, required: true },

    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    reviews: { type: [reviewSchema], default: [] },
    refunds: { type: [refundSchema], default: [] },

    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

massageSchema.index({ isDeleted: 1, isActive: 1, createdAt: -1 });
massageSchema.index({ owner: 1, isDeleted: 1 });

export const Massage: Model<IMassage> =
  mongoose.models.Massage || mongoose.model<IMassage>('Massage', massageSchema);
