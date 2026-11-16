import { Document, Types } from 'mongoose';

export type NotificationType = 'booking' | 'payment' | 'withdraw' | 'review' | 'system';

export interface INotification extends Document {
  senderId?: Types.ObjectId;
  receiverId?: Types.ObjectId;
  title: string;
  description: string;
  type: NotificationType | string;
  booking?: Types.ObjectId;
  event?: string;
  isRead: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
