import { StatusCodes } from 'http-status-codes';
import AppError from '../../errors/AppErro';
import { User } from '../user/user.model';
import { INotification } from './notification.interface';
import { Notification } from './notification.model';
import { IPaginationOptions, IPaginationResult } from '../../types/pagination';

const addNotification = async (
  payload: INotification
): Promise<INotification> => {
  // Save the notification to the database
  const result = await Notification.create(payload);
  
  // Emit socket event for real-time notification
  if (global.io) {
    // Send notification to receiver
    global.io.to(payload.receiverId as string).emit('notification:received', {
      notification: result,
    });
    
    // Update notification count for the receiver
    const unviewedCount = await getUnViewNotificationCount(payload.receiverId as string);
    global.io.to(payload.receiverId as string).emit('notification:count:update', {
      count: unviewedCount.count,
    });
  }
  
  return result;
};

const getALLNotification = async (
  filters: Partial<INotification>,
  options: IPaginationOptions,
  userId: string
) => {
  const query: Record<string, any> = {
    receiverId: userId,
    type: { $ne: 'message' },
  };
  options.sortBy = options.sortBy || 'createdAt';
  // const get unviewed notifications count
  const count = await Notification.countDocuments({
    receiverId: userId,
    viewStatus: false,
  });
  const result = await Notification.paginate(query, options);
  return { ...result, count };
};

const getALLMessageNotification = async (
  filters: Partial<INotification>,
  options: IPaginationOptions,
  userId: string
) => {
  filters.receiverId = userId;
  filters.type = 'message';
  options.sortBy = options.sortBy || 'createdAt';
  // const get unviewed notifications count
  const count = await Notification.countDocuments({
    receiverId: userId,
    viewStatus: false,
    type: 'message',
  });
  const result = await Notification.paginate(filters, options);
  return { ...result, count };
};

const getAdminNotifications = async (
  filters: Partial<INotification>,
  options: IPaginationOptions
): Promise<IPaginationResult<INotification>> => {
  filters.role = 'admin';
  return Notification.paginate(filters, options);
};

const getSingleNotification = async (
  notificationId: string
): Promise<INotification | null> => {
  const result = await Notification.findById(notificationId);
  if (!result) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Notification not found');
  }
  return result;
};

const addCustomNotification = async (
  eventName: string,
  notifications: INotification,
  userId?: string
) => {
  const result = await addNotification(notifications);
  return result;
};

const getUnViewNotificationCount = async (userId: string) => {
  const result = await Notification.countDocuments({
    receiverId: userId,
    viewStatus: false,
    // type $ne admin-notification and message-notification
    type: { $ne: 'message' },
  });
  return { count: result };
};

const getUnViewMessageNotificationCount = async (userId: string) => {
  const result = await Notification.countDocuments({
    receiverId: userId,
    viewStatus: false,
    type: 'message',
  });
  return { count: result };
};

const viewAllNotifications = async (userId: string, type?: string) => {
  const result = await Notification.updateMany(
    { receiverId: userId, ...(type && { type: type }) },
    { viewStatus: true }
  );
  
  // Emit socket event to update notification count
  if (global.io) {
    const unviewedCount = await getUnViewNotificationCount(userId);
    global.io.to(userId).emit('notification:count:update', {
      count: unviewedCount.count,
    });
  }
  
  return result;
};

const viewSingleNotification = async (notificationId: string) => {
  const result = await Notification.findByIdAndUpdate(
    notificationId,
    { viewStatus: true },
    { new: true }
  );
  if (!result) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Notification not found');
  }
  
  // Emit socket event to update notification count
  if (global.io && result.receiverId) {
    const unviewedCount = await getUnViewNotificationCount(result.receiverId as string);
    global.io.to(result.receiverId as string).emit('notification:count:update', {
      count: unviewedCount.count,
    });
  }
  
  return result;
};
const deleteNotification = async (notificationId: string) => {
  const result = await Notification.findByIdAndDelete(notificationId);
  if (!result) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Notification not found');
  }
  
  // Emit socket event to update notification count
  if (global.io && result.receiverId) {
    const unviewedCount = await getUnViewNotificationCount(result.receiverId as string);
    global.io.to(result.receiverId as string).emit('notification:count:update', {
      count: unviewedCount.count,
    });
  }
  
  return result;
};

const clearAllNotification = async (userId: string) => {
  const user = await User.findById(userId);
  let result;
  if (user?.role === 'Admin') {
    result = await Notification.deleteMany({ role: 'admin' });
  } else {
    result = await Notification.deleteMany({ receiverId: userId });
  }
  
  // Emit socket event to update notification count
  if (global.io) {
    global.io.to(userId).emit('notification:count:update', {
      count: 0,
    });
  }
  
  return result;
};
export const NotificationService = {
  addNotification,
  getALLNotification,
  getALLMessageNotification,
  getAdminNotifications,
  getSingleNotification,
  addCustomNotification,
  viewAllNotifications,
  deleteNotification,
  viewSingleNotification,
  getUnViewNotificationCount,
  clearAllNotification,
  getUnViewMessageNotificationCount,
};
