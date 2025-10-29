import { Model, Types } from 'mongoose';

export enum TransactionStatus {
  PENDING = 'Pending',
  PAID = 'Paid',
  UNPAID = 'Unpaid',
}

export enum PaymentGateway {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
}

export interface IPayment {
  booking: Types.ObjectId;
  user: Types.ObjectId;

  amount: number;
  currency: string;

  paymentMethodType: 'Card';

  transactionId: string;
  sessionId: string;

  status: TransactionStatus;

  gateway: PaymentGateway;  

  createdAt?: Date;
  updatedAt?: Date;
}

// ✅ Properly typed model
export type IPaymentModel = Model<IPayment>;
