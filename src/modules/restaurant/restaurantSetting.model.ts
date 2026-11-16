import mongoose, { Schema, Model } from 'mongoose';

/** Platform-wide restaurant settings: a single document `{ key: 'restaurant' }` */
export interface IRestaurantSetting {
  key: 'restaurant';
  serviceFee: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const RESTAURANT_SETTING_KEY = 'restaurant';

const restaurantSettingSchema = new Schema<IRestaurantSetting>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      enum: [RESTAURANT_SETTING_KEY],
      default: RESTAURANT_SETTING_KEY,
    },
    serviceFee: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

export const RestaurantSetting: Model<IRestaurantSetting> =
  mongoose.models.RestaurantSetting ||
  mongoose.model<IRestaurantSetting>('RestaurantSetting', restaurantSettingSchema);
