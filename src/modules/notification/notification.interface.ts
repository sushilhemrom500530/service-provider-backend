import { Document, Types } from "mongoose";


// Define the INotification type
export type INotification = {
  senderId: Types.ObjectId;
  receiverId?: Types.ObjectId; 
  title: string;
  description: string;
  type: string;
  isRead: boolean | false;
} & Document;