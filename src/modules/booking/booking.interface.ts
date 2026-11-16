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
  _id: Types.ObjectId;
  user: Types.ObjectId;
  product: Types.ObjectId;
  productModel: ProductModelName;
  category: BookingCategory;

  personCount?: number;
  ticketNumber?: string;
  date?: Date;
  time?: string;

  startDateAndTime?: Date;
  endDateAndTime?: Date;

  bookingSeatCount?: number;
  slots?: string[];

  bookingItems?: IBookingItem[];
  duration?: string;

  transactionId?: string;

  bookinRequestText?: string;
  bookingAgentText?: string;
  bookingStatus: BookingStatus;

  phoneNumber?: string;
  address?: string;
  destination?: string;
  totalPrice: number;

  isPermitted: boolean | false;
  isHandOver: boolean | false;

  approvalDeadline?: Date;
  approvedAt?: Date;
  handedOverAt?: Date;
  returnedAt?: Date;
  overTimeHours?: number;
  overTimeCharge?: number;
  cancelledBy?: 'user' | 'provider' | 'admin' | 'system';
  cancelReason?: string;
  providerPayout?: 'held' | 'paid' | 'reversed';

  createdAt?: Date;
  updatedAt?: Date;
}
