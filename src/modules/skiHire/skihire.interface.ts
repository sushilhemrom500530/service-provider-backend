import { Document, Types } from 'mongoose';
import { IReview } from './../massage/massage.interface';


export interface IProductItems {
  prorductName: string;
  productPhoto: string; 
  price: number;
  quantity: number; 
}



export interface ISkiHire extends Document {
  title: string;
  thumbnail: string;
  ownerId: Types.ObjectId; 
  totalPrice: number;
  serviceArea: string;
  productItems: IProductItems[];
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
