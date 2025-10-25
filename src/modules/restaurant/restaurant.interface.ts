import { Document, Types } from "mongoose";

 

export interface IRestaurant extends Document {
  title: string;
  description: string;
  ownerId: Types.ObjectId;
  thumbnail: string;
  skiPassType: string;
  duration: string;
  time: string;
  date: string;
  serviceArea: string;
  amount: number;
  averageRating?: number;
  reviews?: IReview[];
  createdAt?: Date;
  updatedAt?: Date;
}
