import { Document, Types } from 'mongoose';
import { IReview, IRefund } from './../common/common.interface';
 
  

export interface ITransport extends Document {
  brandName: string; 
  brandPhoto: string;
  thumbnail: string; 
  title: string;
  personCount: number;
  serviceArea: string;
  amount: number; 
  description?: string;
  ownerId: Types.ObjectId;
  benefits?: string;
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
