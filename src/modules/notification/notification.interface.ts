import { Document, Types } from "mongoose";


// Define the INotification type
export type INotification = {
  senderId: Types.ObjectId;
  receiverIds?: Types.ObjectId[]; 
  title: string;
  description: string;
  isRead: boolean | false;
} & Document;