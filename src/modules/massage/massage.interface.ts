import { Document, Types } from 'mongoose';
import { IReview, IRefund } from './../common/common.interface';
 
 
export interface IDurationByAmount {
  duration: string;
  amount: number;
}

export interface IMassage extends Document {
  title: string;
  description?: string;
  thumbnail: string; 
  ownerId: Types.ObjectId;
  serviceArea: string;
  amount: number;
  durationByAmount: IDurationByAmount[];
  benefits: string;
  ourRecommendations: string;
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
