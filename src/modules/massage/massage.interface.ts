import { Document, Types } from 'mongoose';
import { IReview, IRefund } from './../common/common.interface';
 
export interface IPriceByDuration {
  duration: string;
  amount: number;
}


export interface IMassage extends Document {
  category: Types.ObjectId;
  owner: Types.ObjectId;
  thumbnail: string;
  title: string;
  openTime: string;
  closeTime: string;
  priceByDuration: IPriceByDuration[];
  serviceArea: string; 
  amount: number; 
  benefits: string;
  ourRecommendations: string;
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
