import { Schema, model, Types } from 'mongoose';
import {
  IWallet,
  IWalletTransaction,
  IWalletAccount,
} from './wallet.interface';

const WalletTransactionSchema = new Schema<IWalletTransaction>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    type: {
      type: String,
      required: true,
      enum: ['Earn', 'Withdraw', 'Deposit', 'Send', 'Receive'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const WalletAccountSchema = new Schema<IWalletAccount>({
  accountType: {
    type: String,
    required: true,
  },
  cardNumber: {
    type: Number,
    required: true,
  },
  cardHolderName: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const WalletSchema = new Schema<IWallet>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
    walletAccounts: {
      type: [WalletAccountSchema],
      required: false,
      default: [],
    },
  },
  { timestamps: true }
);

export const Wallet = model<IWallet>('Wallet', WalletSchema);
