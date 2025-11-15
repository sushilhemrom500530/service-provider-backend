import { StatusCodes } from 'http-status-codes';
import AppError from '../../errors/AppErro';
import { User } from '../user/user.model';
import { INotification } from './notification.interface'; 
import { IPaginationOptions, IPaginationResult } from '../../types/pagination';
import { Notification } from './notification.model';

 

const getAllUserNotification = async (userId: string) => {
  const notifications = await Notification.find({
    $or: [{ senderId: userId }],
    // { receiverIds: userId }
  })
    .sort({ createdAt: -1 })
    .populate("senderId", "firstName lastName image")
    // .populate("receiverIds", "firstName lastName image")
    .lean();

  // Map to simplify user info if needed
  const formattedNotifications = notifications.map((notif) => ({
    id: notif._id,
    title: notif.title,
    description: notif.description,
    createdAt: notif.createdAt,
    isRead: notif.isRead,
    sender: notif.senderId
      ? {
          id: notif.senderId._id,
          name: `${notif.senderId.firstName} ${notif.senderId.lastName}`,
          image: notif.senderId.image,
        }
      : null,
    // receivers: notif.receiverIds?.map((r: any) => ({
    //   id: r._id,
    //   name: `${r.firstName} ${r.lastName}`,
    //   image: r.image,
    // })),
  }));

  //   // Mark unread notifications as read
  //   await NotificationModel.updateMany(
  //     { receiverIds: userId, isRead: false },
  //     { $set: { isRead: true } }
  //   );

  return formattedNotifications;
};


export const NotificationService = {
 getAllUserNotification
};
