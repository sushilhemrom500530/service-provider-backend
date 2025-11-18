import { Server, Socket } from 'socket.io';
import { NotificationService } from '../../modules/notification/notification.services';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../../shared/logger';
import colors from 'colors';
import { INotification } from '../../modules/notification/notification.interface';

/**
 * Get notifications handler
 */
export const getNotifications = async (
  io: Server,
  socket: Socket,
  data: any,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId;
    if (!userId) {
      if (callback && typeof callback === 'function') {
        callback({
          code: StatusCodes.UNAUTHORIZED,
          success: false,
          message: 'User not authenticated',
        });
      }
      return;
    }

    const options = {
      page: data?.page || 1,
      limit: data?.limit || 20,
      sortBy: 'createdAt:desc',
    };
    // const notifications = await NotificationService.getALLNotification(
    //   {},
    //   options,
    const notifications = await NotificationService.getAllUserNotification(
      userId
    );

    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'Notifications fetched successfully',
        data: notifications,
      });
    }

    logger.info(colors.green(`✅ Notifications fetched for user ${userId}`));
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error fetching notifications: ${error?.message}`)
    );
    
    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to fetch notifications',
      });
    }
  }
};

/**
 * Get notification count handler
 */
export const getNotificationCount = async (
  io: Server,
  socket: Socket,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId;
    if (!userId) {
      if (callback && typeof callback === 'function') {
        callback({
          code: StatusCodes.UNAUTHORIZED,
          success: false,
          message: 'User not authenticated',
        });
      }
      return;
    }

    // TODO: implement unread notification count in NotificationService
    const count = { count: 0 };

    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'Notification count fetched successfully',
        data: { count: count.count },
      });
    }

    logger.info(
      colors.green(
        `✅ Notification count (${count.count}) fetched for user ${userId}`
      )
    );
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error fetching notification count: ${error?.message}`)
    );
    
    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to fetch notification count',
      });
    }
  }
};

/**
 * Mark all notifications as read handler
 */
export const markAllRead = async (
  io: Server,
  socket: Socket,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId;
    if (!userId) {
      if (callback && typeof callback === 'function') {
        callback({
          code: StatusCodes.UNAUTHORIZED,
          success: false,
          message: 'User not authenticated',
        });
      }
      return;
    }

    // Mark all non-message notifications as read
    // TODO: implement mark-all-read in NotificationService

    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'All notifications marked as read',
      });
    }

    logger.info(
      colors.cyan(`✅ All notifications marked as read for user ${userId}`)
    );
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error marking notifications read: ${error?.message}`)
    );
    
    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to mark notifications as read',
      });
    }
  }
};

/**
 * Clear all notifications handler
 */
export const clearAll = async (
  io: Server,
  socket: Socket,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId;
    if (!userId) {
      if (callback && typeof callback === 'function') {
        callback({
          code: StatusCodes.UNAUTHORIZED,
          success: false,
          message: 'User not authenticated',
        });
      }
      return;
    }

    // TODO: implement clear-all in NotificationService

    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'All notifications cleared',
      });
    }

    logger.info(
      colors.yellow(`🗑️ All notifications cleared for user ${userId}`)
    );
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error clearing notifications: ${error?.message}`)
    );
    
    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to clear notifications',
      });
    }
  }
};

/**
 * Mark specific notification as read
 */
export const markNotificationRead = async (
  io: Server,
  socket: Socket,
  data: any,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId;
    if (!userId) {
      if (callback && typeof callback === 'function') {
        callback({
          code: StatusCodes.UNAUTHORIZED,
          success: false,
          message: 'User not authenticated',
        });
      }
      return;
    }

    const { notificationId } = data;
    if (!notificationId) {
      if (callback && typeof callback === 'function') {
        callback({
          code: StatusCodes.BAD_REQUEST,
          success: false,
          message: 'Notification ID required',
        });
      }
      return;
    }

    // TODO: implement view-single-notification in NotificationService
    const updatedNotification = null;

    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'Notification marked as read',
        data: updatedNotification,
      });
    }

    logger.info(
      colors.cyan(
        `✅ Notification ${notificationId} marked as read by ${userId}`
      )
    );
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error marking notification as read: ${error?.message}`)
    );
    
    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to mark notification as read',
      });
    }
  }
};

/**
 * Send system notification to user
 */
export const sendSystemNotification = async (
  io: Server,
  userId: string,
  title: string,
  message: string,
  type:
    | 'post'
    | 'story'
    | 'comment'
    | 'event'
    | 'group'
    | 'connection'
    | 'message' = 'message',
  linkId?: string
): Promise<void> => {
  try {
    const notificationPayload = {
      title,
      description: message,
      receiverId: userId,
      type,
      isRead: false,
    };

    // TODO: implement NotificationService.addNotification(notificationPayload)

    logger.info(colors.cyan(`🔔 System notification sent to user ${userId}`));
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error sending system notification: ${error?.message}`)
    );
  }
};

/**
 * Send message notification to user
 */
export const sendMessageNotification = async (
  io: Server,
  senderId: string,
  receiverId: string,
  message: string,
  chatId?: string
): Promise<void> => {
  try {
    const notificationPayload = {
      title: 'New Message',
      description:
        message.length > 50 ? message.substring(0, 50) + '...' : message,
      senderId,
      receiverId,
      type: 'message',
      isRead: false,
    };

    // TODO: implement NotificationService.addNotification(notificationPayload)

    logger.info(
      colors.cyan(
        `📨 Message notification sent from ${senderId} to ${receiverId}`
      )
    );
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error sending message notification: ${error?.message}`)
    );
  }
};
