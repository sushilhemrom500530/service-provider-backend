import { Server, Socket } from 'socket.io';
import { ChatService } from '../../modules/chat/chat.service';
import { logger } from '../../shared/logger';
import colors from 'colors';

/**
 * Set user online status
 */
export const setUserOnline = async (
  io: Server,
  userId: string,
  socket: Socket
): Promise<void> => {
  try {
    const userProfile = socket.data.user;
    await notifyRelatedUsers(io, userId, true, userProfile);

    logger.info(colors.cyan(`👤 User ${userId} marked online`));
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error setting user online: ${error?.message}`)
    );
  }
};

/**
 * Set user offline status
 */
export const setUserOffline = async (
  io: Server,
  userId: string,
  socket: Socket
): Promise<void> => {
  try {
    const userProfile = socket.data.user;
    await notifyRelatedUsers(io, userId, false, userProfile);

    logger.info(colors.cyan(`👤 User ${userId} marked offline`));
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error setting user offline: ${error?.message}`)
    );
  }
};

/**
 * Notify related users about online/offline status
 */
export const notifyRelatedUsers = async (
  io: Server,
  userId: string,
  isOnline: boolean,
  userProfile: any
): Promise<void> => {
  try {
    // Get all chats for this user
    const chats = await ChatService.getAllChatsByUserId(
      { senderId: userId },
      { page: 1, limit: 1000, sortBy: 'updatedAt:desc' }
    );

    // Extract unique user IDs
    const relatedUserIds = new Set<string>();
    chats?.results?.forEach((chat: any) => {
      chat.participants?.forEach((participant: any) => {
        const participantId = participant._id?.toString();
        if (participantId && participantId !== userId) {
          relatedUserIds.add(participantId);
        }
      });
    });

    // Filter only online users
    const onlineRelatedUsers = Array.from(relatedUserIds).filter(
      relatedUserId => io.isUserOnline?.(relatedUserId) || io.onlineUsers?.has(relatedUserId)
    );

    // Emit notification to online related users
    onlineRelatedUsers.forEach(relatedUserId => {
      io.to(relatedUserId).emit('user:online', {
        userId,
        isOnline,
        userProfile,
      });
    });
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error getting related online users: ${error?.message}`)
    );
  }
};

/**
 * Get related online users
 */
export const getRelatedOnlineUsers = async (
  io: Server,
  userId: string
): Promise<string[]> => {
  try {
    // Get all chats for this user
    const chats = await ChatService.getAllChatsByUserId(
      { senderId: userId },
      { page: 1, limit: 1000, sortBy: 'updatedAt:desc' }
    );

    // Extract unique user IDs
    const relatedUserIds = new Set<string>();
    chats?.results?.forEach((chat: any) => {
      chat.participants?.forEach((participant: any) => {
        const participantId = participant._id?.toString();
        if (participantId && participantId !== userId) {
          relatedUserIds.add(participantId);
        }
      });
    });

    // Filter only online users
    const onlineRelatedUsers = Array.from(relatedUserIds).filter(
      relatedUserId => io.isUserOnline?.(relatedUserId) || io.onlineUsers?.has(relatedUserId)
    );

    return onlineRelatedUsers;
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error getting related online users: ${error?.message}`)
    );
    return [];
  }
};