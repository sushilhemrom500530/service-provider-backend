import { Document, Types } from "mongoose";

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

export interface ISkiPass extends Document {
  title: string;
  description: string;
  ownerId: Types.ObjectId;
  thumbnail: string;
  skiPassType: string;
  duration: string;
  time: string;
  date: string;
  serviceArea: string;
  amount: number;
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
