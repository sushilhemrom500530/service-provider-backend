import { Document, Types } from 'mongoose';

export type BookingStatus = 'Active' | 'Complete' | 'Cancel' | 'Delete';
export type BookingCategory =
  | 'Ski_Pass'
  | 'Ski_Hire'
  | 'Transport'
  | 'Restaurant_Booking'
  | 'Massage';

export type ProductModelName =
  | 'SkiPass'
  | 'SkiHire'
  | 'Transport'
  | 'Restaurant'
  | 'Massage';

export interface IBookingItem {
  productId: Types.ObjectId;
  quantity: number;
}

export interface IBooking extends Document {
  userId: Types.ObjectId;
  productId?: Types.ObjectId;
  productModel: ProductModelName;
  category: BookingCategory;

  personCount?: number;
  date?: Date;
  time?: string;

  startDateAndTime?: Date;
  endDateAndTime?: Date;

  items?: IBookingItem[];
  orderType?: string;
  itemCount?: number;
  duration?: string;
  bookingAgentText?: string;

  bookingStatus: BookingStatus;

  createdAt?: Date;
  updatedAt?: Date;
}
