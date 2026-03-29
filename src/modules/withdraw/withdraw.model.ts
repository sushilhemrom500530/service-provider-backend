import { Schema, model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { IWithdraw } from './withdraw.inteface';

const WithdrawSchema = new Schema<IWithdraw>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    wallet: {
      type: Schema.Types.ObjectId,
      ref: 'Wallet',
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
    profitCharge: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Paid', 'Unpaid', 'Rejected', 'Completed'],
      default: 'Pending',
    },
    acceptStatus: {
      type: String,
      enum: ['accept', 'reject'],
      default: 'reject',
    },
    transactionId: {
      type: String,
      required: true,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true },
);

// Generate a unique transaction ID
WithdrawSchema.pre('save', function (next) {
  if (!this.transactionId) {
    this.transactionId = `WD-${uuidv4()}`;
  }
  next();
});

export const Withdraw = model<IWithdraw>('Withdraw', WithdrawSchema);
