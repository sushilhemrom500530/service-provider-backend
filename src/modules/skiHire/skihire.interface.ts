import { Document, Types } from 'mongoose';
import { IReview } from './../massage/massage.interface';


export interface IProductItems {
  productName: string;
  productPhoto: string; 
  price: number;
  quantity: number; 
}



export interface ISkiHire extends Document {
  category: Types.ObjectId;
  title: string;
  thumbnail: string;
  ownerId: Types.ObjectId; 
  extraChargePerHour: number;
  totalPrice: number;
  serviceArea: string;
  productItems: IProductItems[];
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
