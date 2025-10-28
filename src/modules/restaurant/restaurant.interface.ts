import { Document, Types } from 'mongoose';
import { IReview } from './../massage/massage.interface';


export interface IMenuItems {
  name: string;
  menuType: string;
  price: number;
  menuPhoto: string;
  description: string;
  quantity: number;
}



export interface IRestaurant extends Document {
  title: string;
  owner: Types.ObjectId;
  thumbnail: string;
  category: Types.ObjectId;
  openTime: string;
  closeTime: string;
  serviceArea: string;
  totalPrice: number;
  status: string;
  items: IMenuItems[];
  extraChargePerHour: string;
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
