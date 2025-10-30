import colors from 'colors';
import { Server, Socket } from 'socket.io';
import { logger } from '../shared/logger';

// Import function-based modules
import {
  initializeConnectionMaps,
  handleConnection,
  handleDisconnection,
} from './managers/connection.manager';
import { setUserOnline, setUserOffline } from './managers/onlineStatus.manager';
import {
  getMessages,
  sendMessage,
  markSeen,
  deleteMessage,
  updateMessage,
  addReaction,
  searchMessages,
} from './handlers/message.handler';
import { handleTypingStart, handleTypingStop } from './handlers/typing.handler';
import {
  getNotifications,
  getNotificationCount,
  markAllRead,
  clearAll,
  markNotificationRead,
} from './handlers/notification.handler';
import { getConversationList } from './handlers/conversation.handler';

// =====================================================
// TYPE DEFINITIONS
// =====================================================
declare module 'socket.io' {
  interface Socket {
    userId?: string;
    userEmail?: string;
    userRole?: string;
    isAuthenticated?: boolean;
    lastSeen?: Date;
  }

  interface Server {
    onlineUsers: Set<string>;
    userSocketMap: Map<string, string>; // userId -> socketId
    socketUserMap: Map<string, string>; // socketId -> userId
    getOnlineUsers(): string[];
    isUserOnline(userId: string): boolean;
    emitToUser(userId: string, event: string, data: any): void;
  }
}

// =====================================================
// AUTHENTICATION MIDDLEWARE
// =====================================================
const setupAuthentication = (io: Server) => {
  io.use(async (socket: Socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify token (this assumes TokenService and related imports are available)
      const { TokenService } = await import('../modules/token/token.services');
      const { User } = await import('../modules/user/user.model');
      const { config } = await import('../config');
      const { TokenType } = await import('../modules/token/token.interface');

      const verifiedUser = await TokenService.verifyToken(
        token as string,
        config.jwt.accessSecret as any,
        TokenType.ACCESS
      );

      if (!verifiedUser) {
        return next(new Error('Invalid authentication token'));
      }

      // Check user status
      const user = await User.findById(verifiedUser.userId);
      if (!user || user.status !== 'Active') {
        return next(new Error('User account is not active'));
      }

      // Attach user info to socket
      socket.userId = verifiedUser.userId;
      socket.userEmail = verifiedUser.email;
      socket.userRole = verifiedUser.role;
      socket.isAuthenticated = true;
      socket.data = { ...socket.data, user };

      next();
    } catch (error: any) {
      next(new Error(error?.message || 'Authentication failed'));
    }
  });
};

// =====================================================
// MAIN SOCKET SETUP
// =====================================================
const socket = (io: Server) => {
  // Initialize connection maps
  const connectionData = initializeConnectionMaps(io);

  // Setup authentication middleware
  setupAuthentication(io);

  // Handle new connections
  io.on('connection', async (socket: Socket) => {
    if (!socket.userId) {
      logger.error(colors.red(`❌ Connection failed: No user ID found`));
      socket.disconnect();
      return;
    }

    const userId = socket.userId;

    logger.info(
      colors.blue(
        `🔌🟢 User connected: userId: ${userId} socketId: ${socket.id}`
      )
    );

    try {
      // Handle connection
      await handleConnection(io, socket, connectionData);
      await setUserOnline(io, userId, socket);

      // Setup event handlers
      socket.on('conversation-list', (data, callback) => {
        getConversationList(io, socket, data, callback);
      });

      socket.on('get-messages', (data, callback) => {
        getMessages(io, socket, data, callback);
      });

      socket.on('send-message', data => {
        sendMessage(io, socket, data);
      });

      socket.on('mark-seen', (data, callback) => {
        markSeen(io, socket, data, callback);
      });

      socket.on('delete-message', (data, callback) => {
        deleteMessage(io, socket, data, callback);
      });

      socket.on('update-message', (data, callback) => {
        updateMessage(io, socket, data, callback);
      });

      socket.on('add-reaction', (data, callback) => {
        addReaction(io, socket, data, callback);
      });

      socket.on('search-messages', (data, callback) => {
        searchMessages(io, socket, data, callback);
      });

      socket.on('typing-start', data => {
        handleTypingStart(io, socket, data);
      });

      socket.on('typing-stop', data => {
        handleTypingStop(io, socket, data);
      });

      socket.on('get-notifications', (data, callback) => {
        getNotifications(io, socket, data, callback);
      });

      socket.on('get-notification-count', callback => {
        getNotificationCount(io, socket, callback);
      });

      socket.on('mark-notifications-read', (callback) => {
        markAllRead(io, socket, callback);
      });

      socket.on('clear-notifications', (callback) => {
        clearAll(io, socket, callback);
      });

      socket.on('mark-notification-read', (data, callback) => {
        markNotificationRead(io, socket, data, callback);
      });

      // Disconnect handler
      socket.on('disconnect', async () => {
        logger.info(colors.yellow(`🔌🔴 User disconnected: ${userId}`));
        await handleDisconnection(io, socket, connectionData);
        await setUserOffline(io, userId, socket);
      });

      // Error handler
      socket.on('error', (error: any) => {
        logger.error(colors.red(`❌ Socket error: ${error?.message}`));
      });
    } catch (error: any) {
      logger.error(colors.red(`❌ Connection setup error: ${error?.message}`));
      socket.disconnect();
    }
  });

  // Server error handler
  io.on('error', (error: any) => {
    logger.error(colors.red(`❌ Socket.IO server error: ${error?.message}`));
  });

  return {
    io,
    getOnlineUsers: io.getOnlineUsers,
    isUserOnline: io.isUserOnline,
    emitToUser: io.emitToUser,
  };
};

export const socketHelper = { socket };
