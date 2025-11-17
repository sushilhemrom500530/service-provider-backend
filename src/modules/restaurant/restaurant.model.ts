import mongoose, { Schema, Model } from 'mongoose';
import { IRestaurant, ICategoryItemDetail } from './restaurant.interface';
import { reviewSchema, refundSchema } from './../common/common.schema';

const slotsSchema = new Schema({
  startTime: {
    type: String,
    required: true,
  },
  endTime: {
    type: String,
    required: true,
  },
})

const categoryItemsSchema = new Schema<ICategoryItemDetail>({
      seat: {
        type: String,
        required: true,
        enum: ["VIP", "Normal"],
      },
      photo: {
        type: String,
        required: true,
      },
      totalQty: {
        type: Number,
        required: true,
        min: 0,
      },
      availableQty: {
        type: Number,
        required: true,
        default: 0,
      },
      price: {
        type: Number,
        required: true,
        min: 1,
      },
      description: {
        type: String,
        default: "",
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
    foodType: {
      type: String, 
      default:"" 
    },
    status: {
      type: String,
      enum: ['Open', 'Closed'],
      default: 'Open',
    },
    items: {
      type: [categoryItemsSchema],
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
  },
  slots: {
    type: [slotsSchema],
    required: true,
  },
  availableSlots: {
    type: [slotsSchema],
    default: [],
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
