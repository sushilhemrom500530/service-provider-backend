import { Document, Types } from 'mongoose';
import { IReview, IRefund } from './../common/common.interface';

export type SeatType = 'VIP' | 'Normal';

export interface ISlot {
  _id?: Types.ObjectId;
  startTime: string;
  endTime: string;
}

/** Stored seat type (API name: `seats[]`) */
export interface ICategoryItemDetail {
  _id?: Types.ObjectId;
  seat: SeatType;
  photo: string;
  totalQty: number;
  availableQty: number; // managed by the booking module, never exposed
  price: number;
  description?: string;
}

export interface IRestaurant extends Document {
  title: string;
  thumbnail: string;
  category: Types.ObjectId;
  owner: Types.ObjectId;
  openTime: string;
  closeTime: string;
  serviceArea: string;
  serviceFee?: number;
  foodType: string;
  /** legacy, written by a cron job; the API computes `isOpenNow` instead */
  status: 'Open' | 'Closed';
  items: ICategoryItemDetail[];
  description: string;
  slots: ISlot[];
  availableSlots: ISlot[]; // managed by the booking module, never exposed
  averageRating?: number;
  reviewCount?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
