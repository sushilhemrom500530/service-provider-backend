import { Schema, model, Types } from 'mongoose';
import { IWallet, IWalletTransaction } from './wallet.interface';
 
const WalletSchema = new Schema<IWallet>(
  {
    user: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      default: 0,
    }, 
    status: {
      type: String,
      required: false,
      default: "Pending",  
    },
  },
  { timestamps: true }
);

export const Withdrow = model<IWallet>('Withdrow', WalletSchema);
