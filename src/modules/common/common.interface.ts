import { Types } from 'mongoose';


export interface IReview {
  userId: Types.ObjectId;
  rating: number;
  comment: string;
  createdAt?: Date;
}
export interface IRefund {
  userId: Types.ObjectId;
  reason: number; 
  createdAt?: Date;
}