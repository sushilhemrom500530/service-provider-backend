import { Document, Types } from "mongoose";


// Define the INotification type
export interface INotification extends Document {
  senderId: Types.ObjectId;
  receiverId?: Types.ObjectId;
  title: string;
  description: string;
  type: string;
  isRead: boolean | false;
  createdAt?: Date;
  updatedAt?: Date;
}