import { Document, Types } from 'mongoose';
import { IReview, IRefund } from './../common/common.interface';

/**
 * Stored Transport listing. Some stored names are legacy (kept because the
 * booking module reads them); the API uses clean names:
 *   personCount -> seats, milage -> mileage,
 *   extraChargePerHours -> extraChargePerHour
 * `amount` is the all-inclusive trip price (no insurance / maintenance fee).
 */
export interface ITransport extends Document {
  category: Types.ObjectId;
  owner: Types.ObjectId;
  thumbnail: string;
  title: string;
  personCount: number;
  milage: string;
  power?: string;
  extraChargePerHours: number;
  serviceArea: string;
  amount: number;
  description?: string;
  averageRating?: number;
  reviewCount?: number;
  isActive?: boolean;
  isDeleted?: boolean;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
