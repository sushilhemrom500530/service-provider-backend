import { Document, Types } from 'mongoose'; 
import { IReview,IRefund } from './../common/common.interface';


export interface IProductItems {
  _id?: Types.ObjectId;
  productName: string;
  productPhoto: string; 
  price: number;
  totalQty: number; 
  availableQty?: number;
}



export interface ISkiHire extends Document {
  category: Types.ObjectId;
  owner: Types.ObjectId; 
  title: string;
  thumbnail: string;
  extraChargePerHour?: number;
  priceUnit?: 'per_rental' | 'per_day' | 'per_hour';
  totalPrice: number;
  serviceArea: string;
  items: IProductItems[];
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
