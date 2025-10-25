import mongoose, { Schema, Model } from 'mongoose';
import { reviewSchema, refundSchema } from './../common/common.schema';
import { ITransport } from './transport.interface';

const transportSchema = new Schema<ITransport>(
  {
    brandName: {
      type: String,
      required: true,
      trim: true,
    },
    brandPhoto: {
      type: String,
      required: true,
      trim: true,
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
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    personCount: {
      type: Number,
      required: true,
      min: 0,
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
    description: {
      type: String,
      required: true,
      trim: true,
    },
    benefits: {
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

transportSchema.pre('save', function (next) {
  if (this.reviews && this.reviews.length > 0) {
    const total = this.reviews.reduce((sum, r) => sum + r.rating, 0);
    this.averageRating = parseFloat((total / this.reviews.length).toFixed(1));
  }
  next();
});

export const Transport: Model<ITransport> =
  mongoose.models.Transport ||
  mongoose.model<ITransport>('Transport', transportSchema);
