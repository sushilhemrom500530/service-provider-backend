import mongoose, { Schema, Model } from 'mongoose';
import { reviewSchema, refundSchema } from './../common/common.schema';
import { IProductItems, ISkiHire } from './skihire.interface';
import { IReview } from './../common/common.interface';

const productItemsSchema = new Schema<IProductItems>({
  productName: { type: String, required: true, trim: true },
  productPhoto: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  totalQty: { type: Number, required: true, min: 1 },
  // stock counter maintained by the booking module
  availableQty: { type: Number, required: true, default: 0, min: 0 },
});

const skiHireSchema = new Schema<ISkiHire>(
  {
    // a sub-category _id stored inside Category.subCategory[]
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    thumbnail: { type: String, required: true, trim: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    extraChargePerHour: { type: Number, default: 0, min: 0 },
    // what one item `price` pays for: the whole rental, one day or one hour
    priceUnit: {
      type: String,
      enum: ['per_rental', 'per_day', 'per_hour'],
      default: 'per_day',
    },
    // legacy: sum of item prices (meaningless, kept for old readers)
    totalPrice: { type: Number, default: 0, min: 0 },
    serviceArea: { type: String, required: true, trim: true },
    items: { type: [productItemsSchema], required: true },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    reviews: { type: [reviewSchema], default: [] },
    refunds: { type: [refundSchema], default: [] },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

skiHireSchema.index({ isDeleted: 1, isActive: 1, createdAt: -1 });

// keep the rating in sync when a full document (with reviews) is saved
skiHireSchema.pre<ISkiHire>('save', function (next) {
  const reviews = this.reviews || [];
  if (reviews.length > 0) {
    const total = reviews.reduce((sum: number, r: IReview) => sum + r.rating, 0);
    this.averageRating = parseFloat((total / reviews.length).toFixed(1));
    this.reviewCount = reviews.length;
  }
  next();
});

export const SkiHire: Model<ISkiHire> =
  mongoose.models.SkiHire || mongoose.model<ISkiHire>('SkiHire', skiHireSchema);
