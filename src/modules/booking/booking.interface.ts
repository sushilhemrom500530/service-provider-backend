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
  /** platform service fee included in totalPrice (Restaurant), 100 % platform money */
  serviceFee?: number;

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
  pendingRefund?: {
    amount: number;
    target: number;
    kept?: number;
    percent?: number;
    kind: 'customer' | 'full';
    startedAt: Date;
    claimedAt?: Date;
  };
  providerPayout?: 'held' | 'paid' | 'reversed';
  platformFee?: number;
  providerEarning?: number;

  startAt?: Date;
  endAt?: Date;
  slotTime?: { startTime?: string; endTime?: string };
  noShow?: boolean;
  refundAmount?: number;
  refundedAt?: Date;
  cancelledAt?: Date;
  completedAt?: Date;
  lateFee?: {
    hours?: number;
    amount?: number;
    status?: 'none' | 'due' | 'paid';
    paymentIntentId?: string;
    paidAt?: Date;
    platformFee?: number;
    providerEarning?: number;
  };
  dispute?: {
    status?: 'open' | 'won' | 'lost';
    amount?: number;
    reason?: string;
    openedAt?: Date;
    closedAt?: Date;
    recoveredNet?: number;
    recoveredFee?: number;
  };

  createdAt?: Date;
  updatedAt?: Date;
}
