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
  /** machine-readable values for the app, e.g. { returnBy: ISO date } */
  data?: Record<string, any>;
  isRead: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
