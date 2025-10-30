import { Schema, model, Types } from 'mongoose';
import { IWallet, IWalletTransaction } from './wallet.interface';

const WalletTransactionSchema = new Schema<IWalletTransaction>(
  {
    user: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const WalletSchema = new Schema<IWallet>(
  {
    user: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    profitCharge: {
      type: Number,
      default: 0,
    },
    transactions: {
      type: [WalletTransactionSchema],
      required: false,
      default: [],  
    },
  },
  { timestamps: true }
);

export const Wallet = model<IWallet>('Wallet', WalletSchema);
