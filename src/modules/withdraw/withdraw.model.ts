import { Schema, model, Types } from 'mongoose';
import { IWithdraw } from './withdraw.interface';

const WithdrawSchema = new Schema<IWithdraw>(
  {
    user: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    wallet: {
      type: Types.ObjectId,
      ref: 'Wallet',
      required: true,
    },
    cardId: {
      type: String, 
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [1, 'Withdrawal amount must be greater than 0'],
    },
    status: {
      type: String,
      enum: ['Pending' | 'Paid' | 'Unpaid' | 'Rejected' | 'Completed'],
      default: 'Pending',
    },
    transactionId: {
      type: String,
      unique: true,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    }, 
  },
  { timestamps: true }
);

WithdrawSchema.pre('save', function (next) {
  if (!this.transactionId) {
    this.transactionId = `WD-${Date.now()}-${Math.floor(
      Math.random() * 10000
    )}`;
  }
  next();
});

export const Withdraw = model<IWithdraw>('Withdraw', WithdrawSchema);
