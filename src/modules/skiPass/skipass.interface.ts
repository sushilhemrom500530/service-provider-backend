import { Document, Types } from 'mongoose';
import { IReview, IRefund } from './../common/common.interface';

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
