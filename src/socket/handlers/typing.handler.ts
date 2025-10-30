import { Server, Socket } from 'socket.io';
import { logger } from '../../shared/logger';
import colors from 'colors';

/**
 * Handle typing start
 */
export const handleTypingStart = (io: Server, socket: Socket, data: any): void => {
  const userId = socket.userId;
  if (userId && data.receiverId) {
    io.to(data.receiverId).emit('user-typing', {
      userId,
      isTyping: true,
      timestamp: new Date(),
    });

    logger.info(colors.cyan(`⌨️ User ${userId} started typing to ${data.receiverId}`));
  }
};

/**
 * Handle typing stop
 */
export const handleTypingStop = (io: Server, socket: Socket, data: any): void => {
  const userId = socket.userId;
  if (userId && data.receiverId) {
    io.to(data.receiverId).emit('user-typing', {
      userId,
      isTyping: false,
      timestamp: new Date(),
    });

    logger.info(colors.cyan(`⌨️ User ${userId} stopped typing to ${data.receiverId}`));
  }
};

/**
 * Handle typing with debounce
 */
export const handleTypingWithDebounce = (io: Server, socket: Socket, data: any): void => {
  const userId = socket.userId;
  
  if (!userId || !data.receiverId) return;

  // Emit typing start
  io.to(data.receiverId).emit('user-typing', {
    userId,
    isTyping: true,
    timestamp: new Date(),
  });

  // Set timeout to stop typing indicator after a delay
  const typingTimeoutKey = `typing_${userId}_${data.receiverId}`;
  
  // Clear any existing timeout
  if ((socket as any)[typingTimeoutKey]) {
    clearTimeout((socket as any)[typingTimeoutKey]);
  }

  // Set new timeout
  (socket as any)[typingTimeoutKey] = setTimeout(() => {
    io.to(data.receiverId).emit('user-typing', {
      userId,
      isTyping: false,
      timestamp: new Date(),
    });
    
    logger.info(colors.cyan(`⌨️ User ${userId} typing indicator cleared for ${data.receiverId}`));
    delete (socket as any)[typingTimeoutKey];
  }, 3000); // 3 seconds timeout

  logger.info(colors.cyan(`⌨️ User ${userId} started typing to ${data.receiverId} with debounce`));
};

/**
 * Get typing users in a conversation
 */
export const getTypingUsers = (io: Server, conversationId: string): string[] => {
  // This could be extended to track typing users in a specific room/conversation
  // For now, we'll return an empty array since we track typing by user-to-user
  return [];
};