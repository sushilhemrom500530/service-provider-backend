import { Types } from 'mongoose';

export enum WalletTransactionType {
  EARN = 'Earn',
  WITHDRAW = 'Withdraw',
  DEPOSIT = 'Deposit',
  SEND = 'Send',
  RECEIVE = 'Receive',
}


export interface IWalletTransaction {
  user: Types.ObjectId;
  balance: number;
  type: WalletTransactionType;
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
