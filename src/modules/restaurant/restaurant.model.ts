import mongoose, { Schema, Model } from 'mongoose';
import { IRestaurant, ICategoryItemDetail } from './restaurant.interface';
import { reviewSchema, refundSchema } from './../common/common.schema';

export const SEAT_TYPES = ['VIP', 'Normal'] as const;

const slotsSchema = new Schema({
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
});

// Copy of a slot that can still be booked: keeps the slot's own _id
// (declared explicitly, so no auto-generated one)
const availableSlotSchema = new Schema({
  _id: { type: Schema.Types.ObjectId },
  startTime: String,
  endTime: String,
});

const categoryItemsSchema = new Schema<ICategoryItemDetail>({
  seat: { type: String, required: true, enum: SEAT_TYPES },
  photo: { type: String, required: true },
  totalQty: { type: Number, required: true, min: 0 },
  availableQty: { type: Number, required: true, default: 0 },
  price: { type: Number, required: true, min: 1 },
  description: { type: String, default: '' },
});

const restaurantSchema = new Schema<IRestaurant>(
  {
    title: { type: String, required: true, trim: true },
    thumbnail: { type: String, required: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    openTime: { type: String, required: true },
    closeTime: { type: String, required: true },
    serviceArea: { type: String, required: true },
    serviceFee: { type: Number, default: 0, min: 0 },
    foodType: { type: String, default: '' },
    // legacy: kept for old clients / the status cron. The API computes isOpenNow.
    status: { type: String, enum: ['Open', 'Closed'], default: 'Open' },
    items: { type: [categoryItemsSchema], required: true },
    description: { type: String, default: '' },
    slots: { type: [slotsSchema], required: true },
    availableSlots: { type: [availableSlotSchema], default: [] },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    reviews: { type: [reviewSchema], default: [] },
    refunds: { type: [refundSchema], default: [] },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

restaurantSchema.index({ owner: 1, isDeleted: 1 });
restaurantSchema.index({ isDeleted: 1, isActive: 1, createdAt: -1 });

restaurantSchema.pre('save', function (next) {
  if (this.reviews && this.reviews.length > 0) {
    const total = this.reviews.reduce((sum, r) => sum + r.rating, 0);
    this.averageRating = parseFloat((total / this.reviews.length).toFixed(1));
  }

  // first save: every slot is available
  if (!this.availableSlots || this.availableSlots.length === 0) {
    this.availableSlots = (this.slots || []).map(slot => ({
      _id: slot._id,
      startTime: slot.startTime,
      endTime: slot.endTime,
    }));
  }

  next();
});

export const Restaurant: Model<IRestaurant> =
  mongoose.models.Restaurant ||
  mongoose.model<IRestaurant>('Restaurant', restaurantSchema);
