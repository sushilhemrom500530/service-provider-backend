import { Document, Types } from 'mongoose';
import { IReview, IRefund } from './../common/common.interface';

export enum ISkiPassType {
  BASIC = 'Basic',
  VIP = 'Vip',
  PREMIUM = 'Premium',
}

export interface ISkiPass extends Document {
  title: string;
  description: string;
  ownerId: Types.ObjectId;
  thumbnail: string;
  skiPassType: ISkiPassType;
  duration: string;
  time: string;
  date: string;
  extraTimePerHours: string;
  serviceArea: string;
  amount: number;
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
