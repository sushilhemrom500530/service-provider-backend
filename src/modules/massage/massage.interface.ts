import { Document, Types } from 'mongoose';
import { IReview, IRefund } from './../common/common.interface';

/**
 * One bookable duration. `duration` is read by the booking module
 * (matched with its normalizeDuration), so the field name stays.
 * New data is stored as "<minutes> min", e.g. "60 min".
 */
export interface IPriceByDuration {
  _id?: Types.ObjectId;
  duration: string;
  amount: number;
}

export interface IMassage extends Document {
  category: Types.ObjectId; // sub-category _id inside Category.subCategory[]
  owner: Types.ObjectId;
  thumbnail: string;
  title: string;
  description?: string;
  openTime: string;
  closeTime: string;
  priceByDuration: IPriceByDuration[];
  serviceArea: string;
  /** Fallback price used by bookings when no duration matches; defaults to the cheapest duration */
  amount: number;
  benefits: string;
  ourRecommendations: string;
  /** guests treated at the same time (therapists); default 1 */
  capacity?: number;
  averageRating?: number;
  reviewCount?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
