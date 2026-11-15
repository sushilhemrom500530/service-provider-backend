import { Document, Types } from 'mongoose';
import { IReview, IRefund } from './../common/common.interface';

export interface ITransport extends Document {
  category: Types.ObjectId;
  owner: Types.ObjectId;
  thumbnail: string;
  title: string;
  personCount: number;
  milage: string;
  power: string;
  extraChargePerHours: number;
  insuranceFee: number;
  maintainCharge: number;
  serviceArea: string;
  amount: number;
  description?: string;
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
