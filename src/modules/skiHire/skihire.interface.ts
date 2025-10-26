import { Document, Types } from 'mongoose';
import { IReview } from './../massage/massage.interface';


export interface IMenuItems {
  name: string;
  menuType: string;
  price: number;
  menuImage: string;
  description: string;
}



export interface IRestaurant extends Document {
  title: string;
  ownerId: Types.ObjectId;
  thumbnail: string;
  openTime: string;
  closeTime: string;
  serviceArea: string;
  totalPrice: number;
  menuItems: IMenuItems[];
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}
