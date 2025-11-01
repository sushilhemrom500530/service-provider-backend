import { Types } from 'mongoose';

export interface IWithdrawRequest {
  cardId: Types.ObjectId;
  amount: number;
  createdAt?: Date;
}

export interface IWithdraw {
  user: Types.ObjectId;
  wallet: Types.ObjectId;
  cardId: string;
  amount: number;
  status: 'Pending' | 'Paid' | 'Unpaid' | 'Rejected' | 'Completed';
  transactionId?: string;
  note?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
