import { Document, Types } from 'mongoose'; 
import { IReview, IRefund } from './../common/common.interface';

export enum ISkiPassType {
  BASIC = 'Basic',
  VIP = 'Vip',
  PREMIUM = 'Premium',
}

export interface IServices {
  title: string;
  description: string;
}

export interface ISkiPass extends Document {
  title: string;
  thumbnail: string;
  owner: Types.ObjectId;
  skiPassType: ISkiPassType;
  services: IServices[];
  serviceArea: string;
  amount: number;
  description: string;
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
