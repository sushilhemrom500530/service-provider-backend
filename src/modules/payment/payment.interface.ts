import { Model, Types } from 'mongoose';
import { IPaginationOptions, IPaginationResult } from '../../types/pagination';

export enum PaymentGateway {
  PAYPAL = 'paypal',
  ZELLE = 'zelle',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export interface IPayment {
  _id?: string;
  
  // Transaction details
  bookingId: Types.ObjectId;
  userId: Types.ObjectId;
  
  // Payment information
  amount: number;
  currency: string;
  paymentMethod: PaymentGateway;
  
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