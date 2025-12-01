import { StatusCodes } from 'http-status-codes';
import AppError from '../../errors/AppErro';
import { User } from '../user/user.model';
import { INotification } from './notification.interface';
import { IPaginationOptions, IPaginationResult } from '../../types/pagination';
import { Notification } from './notification.model';

const getAllUserNotification = async (userId: string) => {
  const notifications = await Notification.find({
    receiverId: userId, 
  })
    .sort({ createdAt: -1 })
    .populate('senderId', 'fullName image')
    .lean();

  const formattedNotifications = notifications.map(notif => ({
    id: notif._id,
    title: notif.title,
    description: notif.description,
    createdAt: notif.createdAt,
    isRead: notif.isRead,
    sender: notif.senderId
      ? {
          id: notif.senderId._id,
          name: notif.senderId.fullName,
          image: notif.senderId.image,
        }
      : null,
  }));

  return formattedNotifications;
};

export const NotificationService = {
  getAllUserNotification,
};
