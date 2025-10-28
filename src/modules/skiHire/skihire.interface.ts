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
  owner: Types.ObjectId; 
  title: string;
  thumbnail: string;
  extraChargePerHour?: number;
  totalPrice: number;
  serviceArea: string;
  items: IProductItems[];
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
