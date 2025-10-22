import { Document } from "mongoose";
export interface ISettings extends Document {
  content: string;  
  assignee?: string;
  createdAt?: Date;
  updatedAt?: Date;
}