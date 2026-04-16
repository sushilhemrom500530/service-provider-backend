import mongoose, { Schema, Model } from 'mongoose';
import { reviewSchema, refundSchema } from './../common/common.schema';
import { ITransport } from './transport.interface';

const transportSchema = new Schema<ITransport>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
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
    personCount: {
      type: String,
    },
    milage: {
      type: String,
      required: true,
    },
    power: {
      type: String,
    },
    extraChargePerHours: {
      type: Number,
      default: 8,
    },
    insuranceFee: {
      type: Number,
      required: true,
      default: 150,
    },
    maintainCharge: {
      type: Number,
      required: true,
      default: 75,
    },
    serviceArea: {
      type: String,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
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
  },
);

// transportSchema.pre('save', function (next) {
//   if (this.reviews && this.reviews.length > 0) {
//     const total = this.reviews.reduce(
//       (sum: number, r: any) => sum + r.rating,
//       0,
//     );
//     this.averageRating = parseFloat((total / this.reviews.length).toFixed(1));
//   }
//   next();
// });

transportSchema.pre('save', function (this: any, next) {
  // Using 'any' here is the safest way to bypass the Strict Mongoose internal type check
  // if ITransport doesn't extend mongoose.Document
  if (this.reviews && this.reviews.length > 0) {
    const total = this.reviews.reduce(
      (sum: number, r: any) => sum + r.rating,
      0,
    );
    this.averageRating = parseFloat((total / this.reviews.length).toFixed(1));
  }
  next();
});

export const Transport: Model<ITransport> =
  mongoose.models.Transport ||
  mongoose.model<ITransport>('Transport', transportSchema);
