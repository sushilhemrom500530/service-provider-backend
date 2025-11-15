import { Server } from 'socket.io';
import { logger } from '../../shared/logger';
import colors from 'colors';

/**
 * Emit event to specific user
 */
export const emitToUser = (io: Server, userId: string, event: string, data: any): void => {
  try {
    io.to(userId).emit(event, data);
    logger.info(colors.cyan(`📤 Event "${event}" emitted to user ${userId}`));
  } catch (error: any) {
    logger.error(colors.red(`❌ Error emitting event: ${error?.message}`));
  }
};

/**
 * Emit event to room
 */
export const emitToRoom = (io: Server, room: string, event: string, data: any): void => {
  try {
    io.to(room).emit(event, data);
    logger.info(colors.cyan(`📤 Event "${event}" emitted to room ${room}`));
  } catch (error: any) {
    logger.error(colors.red(`❌ Error emitting event: ${error?.message}`));
  }
};

/**
 * Broadcast event to all users
 */
export const broadcastToAll = (io: Server, event: string, data: any): void => {
  try {
    io.emit(event, data);
    logger.info(colors.cyan(`📤 Event "${event}" broadcasted to all`));
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error broadcasting event: ${error?.message}`)
    );
  }
};

/**
 * Emit event to multiple users
 */
export const emitToMultipleUsers = (io: Server, userIds: string[], event: string, data: any): void => {
  try {
    userIds.forEach(userId => {
      emitToUser(io, userId, event, data);
    });
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error emitting to multiple users: ${error?.message}`)
    );
  }
};

/**
 * Emit with acknowledgement
 */
export const emitWithAck = (
  io: Server,
  userId: string,
  event: string,
  data: any,
  timeout: number = 5000
): Promise<any> => {
  return new Promise((resolve, reject) => {
    io
      .to(userId)
      .timeout(timeout)
      .emit(event, data, (err: any, response: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(response);
        }
      });
  });
};

/**
 * Emit error to user
 */
export const emitError = (
  io: Server,
  userId: string,
  event: string,
  message: string,
  code: number = 400
): void => {
  emitToUser(io, userId, `${event}:error`, {
    success: false,
    code,
    message,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Emit success to user
 */
export const emitSuccess = (
  io: Server,
  userId: string,
  event: string,
  message: string,
  data?: any
): void => {
  emitToUser(io, userId, `${event}:success`, {
    success: true,
    code: 200,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Emit notification to user
 */
export const emitNotification = (
  io: Server,
  userId: string,
  title: string,
  message: string,
  type: string = 'info',
  data?: any
): void => {
  emitToUser(io, userId, 'notification', {
    title,
    message,
    type,
    data,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Emit message with notification
 */
export const emitMessageWithNotification = async (
  io: Server,
  receiverId: string,
  event: string,
  data: any,
  notificationTitle: string,
  notificationMessage: string
): Promise<void> => {
  // Emit the message
  emitToUser(io, receiverId, event, data);
  
  // Send notification about the message
  // const { sendSystemNotification } = await import('../handlers/notification.handler');
  // await sendSystemNotification(io, null as any, notificationTitle, notificationMessage, 'message');
};

/**
 * Broadcast except specific users
 */
export const broadcastExcept = (io: Server, excludeUserIds: string[], event: string, data: any): void => {
  try {
    io.except(excludeUserIds).emit(event, data);
    logger.info(
      colors.cyan(
        `📤 Event "${event}" broadcasted except ${excludeUserIds.length} users`
      )
    );
  } catch (error: any) {
    logger.error(colors.red(`❌ Error broadcasting: ${error?.message}`));
  }
};

/**
 * Get sockets in room
 */
export const getSocketsInRoom = async (io: Server, room: string): Promise<string[]> => {
  const sockets = await io.in(room).fetchSockets();
  return sockets.map(socket => socket.id);
};

/**
 * Check if room is active
 */
export const isRoomActive = async (io: Server, room: string): Promise<boolean> => {
  const sockets = await getSocketsInRoom(io, room);
  return sockets.length > 0;
};