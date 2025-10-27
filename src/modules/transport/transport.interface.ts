import { Document, Types } from 'mongoose';
import { IReview, IRefund } from './../common/common.interface';

export interface ISpecific {
  personCount: string;
  milageCount: string;
  powerCount: string;
}

 
export interface ITransport extends Document {
  brandName: string;
  brandPhoto: string;
  thumbnail: string;
  title: string;
  specific: ISpecific; 
  extraTimePerHours: string;
  insuranceFee: number;
  maintainCharge: number;
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
