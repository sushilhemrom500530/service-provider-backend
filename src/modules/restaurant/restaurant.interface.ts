import { Document, Types } from 'mongoose';
import { IReview,IRefund } from './../common/common.interface';



export interface ISlot {
  _id?:Types.ObjectId;
  startTime: string;
  endTime: string;
}

export interface ICategoryItemDetail {
  seat: "VIP" | "Normal";
  photo: string;
  totalQty: number;
  availableQty: number;
  price: number;
  description?: string;
}



export interface IRestaurant extends Document {
  title: string;
  thumbnail: string;
  category: Types.ObjectId;
  owner: Types.ObjectId;
  openTime: string;
  closeTime: string;
  serviceArea: string;
  serviceFee?: number;
  foodType: string;
  status: "Open" | "Closed";
  items: ICategoryItemDetail[];
  description: string;
  slots: ISlot[];
  availableSlots: ISlot[];
  averageRating?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  createdAt?: Date;
  updatedAt?: Date;
}