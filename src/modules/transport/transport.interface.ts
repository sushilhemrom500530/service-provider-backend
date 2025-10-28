import { Document, Types } from 'mongoose';
import { IReview, IRefund } from './../common/common.interface';

export interface ITransport extends Document {
  brand: Types.ObjectId;
  owner: Types.ObjectId;
  thumbnail: string;
  title: string;
  personCount: string;
  milage: string;
  power: string;
  extraChargePerHours: string;
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
