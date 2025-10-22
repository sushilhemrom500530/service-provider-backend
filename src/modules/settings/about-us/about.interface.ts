import { Document } from "mongoose";
export interface IAbout extends Document {
  content: string;  
  assignee?: string;
  createdAt?: Date;
  updatedAt?: Date;
}