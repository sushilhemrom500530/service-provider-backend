import { Model, Types } from 'mongoose';
import { IPaginationOptions, IPaginationResult } from '../../types/pagination';

export interface INotification {
  _id?: Types.ObjectId;
  senderId?: Types.ObjectId | string;
  receiverId?: Types.ObjectId | string;
  title: string;
  message?: string;
  image?: string;
  type:
    | 'post'
    | 'story'
    | 'comment'
    | 'event'
    | 'group'
    | 'connection'
    | 'message';
  linkId?: Types.ObjectId | string;
  role: 'admin' | 'user';
  viewStatus?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface NotificationModel extends Model<INotification> {
  paginate(
    filters?: Record<string, any>,
    options?: IPaginationOptions
  ): Promise<IPaginationResult<INotification>>;
}
