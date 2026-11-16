import { StatusCodes } from 'http-status-codes';
import { NotificationService } from './notification.services';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';

const userIdOf = (req: any) => String(req.user?.userId);

const getMyNotifications = catchAsync(async (req, res) => {
  const { data, meta } = await NotificationService.getMyNotifications(
    userIdOf(req),
    req.query as Record<string, any>,
  );
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Notifications fetched successfully',
    data,
    meta,
  });
});

const getUnreadCount = catchAsync(async (req, res) => {
  const data = await NotificationService.getUnreadCount(userIdOf(req));
  sendResponse(res, { code: StatusCodes.OK, message: 'Unread count', data });
});

const markRead = catchAsync(async (req, res) => {
  const data = await NotificationService.markRead(userIdOf(req), String(req.params.id));
  sendResponse(res, { code: StatusCodes.OK, message: 'Notification marked as read', data });
});

const markAllRead = catchAsync(async (req, res) => {
  const data = await NotificationService.markAllRead(userIdOf(req));
  sendResponse(res, { code: StatusCodes.OK, message: 'All notifications marked as read', data });
});

export const NotificationController = {
  getMyNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
};
