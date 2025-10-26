import mongoose, { Schema, Model } from 'mongoose';
import { IRestaurant, IMenuItems } from './restaurant.interface';
import { reviewSchema, refundSchema } from './../common/common.schema';

const menuItemsSchema = new Schema<IMenuItems>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  menuType: {
    type: String,
    required: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    min: 1,
  },
  menuImage: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
});

const restaurantSchema = new Schema<IRestaurant>(
  {
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
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    openTime: {
      type: String,
      required: true,
    },
    closeTime: {
      type: String,
      required: true,
    },
    serviceArea: {
      type: String,
      required: true,
    },

    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    dayCount: {
      type: Number,
      required: true,
      min: 0,
    },
    menuItems: {
      type: [menuItemsSchema],
      required: true,
    },
    extraTimePerHours: {
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

restaurantSchema.pre('save', function (next) {
  if (this.reviews && this.reviews.length > 0) {
    const total = this.reviews.reduce((sum, r) => sum + r.rating, 0);
    this.averageRating = parseFloat((total / this.reviews.length).toFixed(1));
  }
  next();
});

export const Restaurant: Model<IRestaurant> =
  mongoose.models.Restaurant ||
  mongoose.model<IRestaurant>('Restaurant', restaurantSchema);
