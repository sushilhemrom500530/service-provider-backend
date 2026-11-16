import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { Notification } from './notification.model';
import { toNotificationDto } from './notify';
import { buildMeta, getPagination } from '../../shared/apiHelpers';

/** GET /notifications?page=&limit=&unread=true */
const getMyNotifications = async (userId: string, query: Record<string, any>) => {
  const { page, limit, skip } = getPagination(query, 20);
  const filter: Record<string, any> = { receiverId: new Types.ObjectId(userId) };
  if (String(query.unread) === 'true') filter.isRead = false;

  const [docs, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ receiverId: userId, isRead: false }),
  ]);

  return {
    data: (docs as any[]).map(toNotificationDto),
    meta: { ...buildMeta(page, limit, total), unread },
  };
};

const getUnreadCount = async (userId: string) => ({
  unread: await Notification.countDocuments({ receiverId: userId, isRead: false }),
});

const markRead = async (userId: string, id: string) => {
  if (!Types.ObjectId.isValid(id))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid notification id.');
  const doc: any = await Notification.findOneAndUpdate(
    { _id: id, receiverId: userId },
    { $set: { isRead: true } },
    { new: true },
  ).lean();
  if (!doc) throw new AppError(StatusCodes.NOT_FOUND, 'Notification not found.');
  return toNotificationDto(doc);
};

const markAllRead = async (userId: string) => {
  const result = await Notification.updateMany(
    { receiverId: userId, isRead: false },
    { $set: { isRead: true } },
  );
  return { updated: result.modifiedCount };
};

export const NotificationService = {
  getMyNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
};
