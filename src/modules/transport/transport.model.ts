import mongoose, { Schema, Model } from 'mongoose';
import { reviewSchema, refundSchema } from './../common/common.schema';
import { ITransport } from './transport.interface';

/**
 * Stored field names are kept as they are (the booking module reads
 * `amount`, `extraChargePerHours`, `personCount`, `milage`). The API maps
 * them to clean names in transport.service.ts.
 *
 * No invented price defaults: insuranceFee, maintainCharge and
 * extraChargePerHours are required on create (0 allowed).
 */
const transportSchema = new Schema<ITransport>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // sub-category _id (inside Category.subCategory[] of primary "Transport")
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    thumbnail: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    // seats in the vehicle (old docs may hold a String; coerced on read)
    personCount: { type: Number, required: true, min: 1 },
    // API name: mileage (stored name misspelled, kept for the booking module)
    milage: { type: String, required: true, trim: true },
    power: { type: String, trim: true },
    // API name: extraChargePerHour
    extraChargePerHours: { type: Number, required: true, min: 0 },
    insuranceFee: { type: Number, required: true, min: 0 },
    // API name: maintenanceFee
    maintainCharge: { type: Number, required: true, min: 0 },
    serviceArea: { type: String, required: true, trim: true },
    // price of one trip (the booking charges it once per booking)
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true },

    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    reviews: { type: [reviewSchema], default: [] },
    refunds: { type: [refundSchema], default: [] },
  },
  { timestamps: true },
);

// keep averageRating/reviewCount in sync when a doc is saved with reviews
// (reviews are normally added atomically by addListingReview)
transportSchema.pre('save', function (this: any, next) {
  if (Array.isArray(this.reviews) && this.reviews.length > 0) {
    const total = this.reviews.reduce((sum: number, r: any) => sum + (Number(r?.rating) || 0), 0);
    this.averageRating = Math.round((total / this.reviews.length) * 10) / 10;
    this.reviewCount = this.reviews.length;
  }
  next();
});

transportSchema.index({ isDeleted: 1, isActive: 1, createdAt: -1 });

export const Transport: Model<ITransport> =
  mongoose.models.Transport ||
  mongoose.model<ITransport>('Transport', transportSchema);
