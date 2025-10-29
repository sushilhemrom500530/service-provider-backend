import mongoose, { Schema } from 'mongoose';
import paginationPlugin from '../../common/plugins/pagination.plugin';
import {
  IPayment,
  IPaymentModel,
  TransactionStatus,
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
      enum: ['Card'],
      required: true,
      default: 'Card',  
    },

    // Gateway-specific fields
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },

    // Status tracking
    status: {
      type: String,
      enum: Object.values(TransactionStatus),
      default: TransactionStatus.UNPAID,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Indexes (use correct field names)
paymentSchema.index({ booking: 1, status: 1 });
paymentSchema.index({ user: 1, status: 1 });
paymentSchema.index({ paymentMethod: 1, status: 1 });

// ✅ REMOVE conflicting virtuals — or rename them
// Instead of redefining 'booking' and 'user', rename them if needed

paymentSchema.virtual('bookingDetails', {
  ref: 'Booking',
  localField: 'booking',
  foreignField: '_id',
  justOne: true,
});

paymentSchema.virtual('userDetails', {
  ref: 'User',
  localField: 'user',
  foreignField: '_id',
  justOne: true,
});

// ✅ Add pagination plugin
paymentSchema.plugin(paginationPlugin);

const Payment = mongoose.model<IPayment, IPaymentModel>('Payment', paymentSchema);

export default Payment;
