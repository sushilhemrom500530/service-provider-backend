import { Document, Types } from 'mongoose';
import { IReview, IRefund } from './../common/common.interface';

export enum ISkiPassType {
  BASIC = 'Basic',
  VIP = 'Vip',
  PREMIUM = 'Premium',
}

export const SKI_PASS_TYPES = Object.values(ISkiPassType) as [string, ...string[]];

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
  /** price per person */
  amount: number;
  description: string;
  averageRating?: number;
  reviewCount?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
