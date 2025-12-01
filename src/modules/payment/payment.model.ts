import mongoose, { Schema,Model } from 'mongoose';
import {
  IPayment,
  IPaymentModel,
  TransactionStatus,
  PaymentGateway
} from './payment.interface';

const paymentSchema = new Schema<IPayment>(
  {
    // Transaction details
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    paymentMethodType: {
      type: String,
      enum: ['Card'],
      required: true,
      default: 'Card',
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    sessionId: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: Object.values(TransactionStatus),
      default: TransactionStatus.UNPAID,
    },
    gateway: {
      type: String,
      enum: Object.values(PaymentGateway), 
      required: true,
      default: PaymentGateway.STRIPE, 
    },
  },
  {
    timestamps: true,
  }
);

export const Payment: Model<IPayment> =
  mongoose.models.Payment || mongoose.model<IPayment>('Payment', paymentSchema);
