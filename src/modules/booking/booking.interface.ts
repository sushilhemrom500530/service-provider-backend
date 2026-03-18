import { Document, Types } from 'mongoose';

export type BookingStatus =
  | 'Active'
  | 'Pending'
  | 'Completed'
  | 'Cancelled'
  | 'Deleted';

export type BookingCategory =
  | 'Ski_Pass'
  | 'Ski_Hire'
  | 'Transport'
  | 'Restaurant'
  | 'Massage';

export type ProductModelName =
  | 'SkiPass'
  | 'SkiHire'
  | 'Transport'
  | 'Restaurant'
  | 'Massage';

export interface IBookingItem {
  itemId: Types.ObjectId;
  quantity: number;
}

export interface IBooking extends Document {
  user: Types.ObjectId;
  product: Types.ObjectId;
  productModel: ProductModelName;
  category: BookingCategory;

  personCount?: number;
  date?: Date;
  time?: string;

  startDateAndTime?: Date;
  endDateAndTime?: Date;

  bookingSeatCount?: number;
  slots?: string[];

  bookingItems?: IBookingItem[];
  duration?: string;

  bookinRequestText?: string;
  bookingAgentText?: string;
  bookingStatus: BookingStatus;

  phoneNumber?: string;
  address?: string;
  destination?: string;
  totalPrice: number;

  isPermitted: boolean | false;

  createdAt?: Date;
  updatedAt?: Date;
}
