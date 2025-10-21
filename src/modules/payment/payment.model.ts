import mongoose, { Schema } from 'mongoose';
import paginationPlugin from '../../common/plugins/pagination.plugin';
import { IPayment, IPaymentModel, PaymentGateway, TransactionStatus } from './payment.interface';

const paymentSchema = new Schema(
  {
    // Transaction details
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,

    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,

    },
    
    // Payment information
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentGateway),
      required: true,
    },
    
    // Gateway-specific fields
    transactionId: {
      type: String,
    },
    paypalOrderId: {
      type: String,
    },
    zelleReference: {
      type: String,
    },
    
    // Status tracking
    status: {
      type: String,
      enum: Object.values(TransactionStatus),
      default: TransactionStatus.PENDING,

    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
  }
);

// Indexes for better query performance
paymentSchema.index({ bookingId: 1, status: 1 });
paymentSchema.index({ userId: 1, status: 1 });
paymentSchema.index({ paymentMethod: 1, status: 1 });

// Virtual for booking details
paymentSchema.virtual('booking', {
  ref: 'Booking',
  localField: 'bookingId',
  foreignField: '_id',
  justOne: true,
});

// Virtual for user details
paymentSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

// Add pagination plugin
paymentSchema.plugin(paginationPlugin);

const Payment = mongoose.model<IPayment, IPaymentModel>('Payment', paymentSchema);

export default Payment;