import { Model, Types } from 'mongoose';
import {
  IPaginationOptions,
  IPaginationResult,
} from './../../types/pagination';

export enum TransactionStatus {
  PENDING = 'pending',
  PAID = 'Paid',
  UNPAID = 'Unpaid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum PaymentGateway {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
}


export interface IPayment {
  _id?: string;

  // Transaction details
  bookingId: Types.ObjectId;
  userId: Types.ObjectId;

  // Payment information
  amount: number;
  currency: string;
  paymentMethod: [string] | ['Card'];

  // Gateway-specific fields
  transactionId?: string; // PayPal transaction ID
  paypalOrderId?: string; // PayPal order ID
  zelleReference?: string; // Zelle reference number

  // Status tracking
  status: TransactionStatus;

  // Metadata
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPaymentModel extends Model<IPayment> {
  paginate(
    filters: Record<string, any>,
    options: IPaginationOptions
  ): Promise<IPaginationResult<IPayment>>;
}
