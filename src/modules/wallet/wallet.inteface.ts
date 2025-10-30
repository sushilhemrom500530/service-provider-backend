import { Types } from 'mongoose';

export enum WalletTransactionType {
  EARN = 'earn',
  WITHDRAW = 'withdraw',
}


export interface IWalletTransaction {
  user: Types.ObjectId;
  balance: number;
  createdAt?: Date;
}

export interface IWalletAccount {
  accountType: string;
  cardNumber: number;
  cardHolderName: string;
  createdAt?: Date;
}

export interface IWallet {
  user: Types.ObjectId;
  balance: number;
  profitCharge: number;
  transactions: IWalletTransaction[]; 
  walletAccounts: IWalletAccount[]; 
  createdAt?: Date;
  updatedAt?: Date;
}
