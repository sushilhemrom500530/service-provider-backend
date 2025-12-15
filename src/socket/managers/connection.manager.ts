import { Server, Socket } from 'socket.io';
import { User } from '../../modules/user/user.model';
import { logger } from '../../shared/logger';
import colors from 'colors';

// Type definitions for connection management
export interface ConnectionData {
  onlineUsers: Set<string>;
  userSocketMap: Map<string, string>;
  socketUserMap: Map<string, string>;
}

// Initialize connection maps for the server
export const initializeConnectionMaps = (io: Server): ConnectionData => {
  const connectionData: ConnectionData = {
    onlineUsers: new Set<string>(),
    userSocketMap: new Map<string, string>(),
    socketUserMap: new Map<string, string>(),
  };

  // Attach connection maps to server instance
  io.onlineUsers = connectionData.onlineUsers;
  io.userSocketMap = connectionData.userSocketMap;
  io.socketUserMap = connectionData.socketUserMap;

  return connectionData;
};

// Handle user connection
export const handleConnection = async (
  io: Server,
  socket: Socket,
  connectionData: ConnectionData
): Promise<void> => {
  if (!socket.userId) {
    logger.error(colors.red(`❌ Connection failed: No user ID found`));
    socket.disconnect();
    return;
  }

  const userId = socket.userId;

  logger.info(
    colors.blue(`🔌🟢 User connected: userId: ${userId} socketId: ${socket.id}`)
  );

  try {
    // Handle multiple connections (disconnect previous connection if exists)
    const existingSocketId = connectionData.userSocketMap.get(userId);
    if (existingSocketId && existingSocketId !== socket.id) {
      const existingSocket = io.sockets.sockets.get(existingSocketId);
      if (existingSocket) {
        existingSocket.disconnect(true);
      }
      connectionData.socketUserMap.delete(existingSocketId);
    }

    // Update connection maps
    connectionData.onlineUsers.add(userId);
    connectionData.userSocketMap.set(userId, socket.id);
    connectionData.socketUserMap.set(socket.id, userId);

    // Join user's personal room
    socket.join(userId);

    // Update user status in database
    await User.findByIdAndUpdate(userId, {
      $set: {
        'profile.isOnline': true,
        'metadata.lastLoginAt': new Date(),
      },
    });

    // Emit connection success to user
    socket.emit('user:connected', {
      userId,
      status: 'online',
      timestamp: new Date(),
    });
  } catch (error: any) {
    logger.error(colors.red(`❌ Connection setup error: ${error?.message}`));
    socket.disconnect();
  }
};

// Handle user disconnection
export const handleDisconnection = async (
  io: Server,
  socket: Socket,
  connectionData: ConnectionData
): Promise<void> => {
  if (!socket.userId) return;

  const userId = socket.userId;
  logger.info(colors.yellow(`🔌🔴 User disconnected: ${userId}`));

  try {
    // Remove from connection maps
    connectionData.onlineUsers.delete(userId);
    connectionData.userSocketMap.delete(userId);
    connectionData.socketUserMap.delete(socket.id);

    // Update user status in database
    await User.findByIdAndUpdate(userId, {
      $set: {
        'profile.isOnline': false,
        'metadata.lastSeenAt': new Date(),
      },
    });

    logger.info(
      colors.yellow(`👋 User ${userId} disconnected and marked offline`)
    );
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error in handleDisconnection: ${error?.message}`)
    );
  }
};

//Get online users
export const getOnlineUsers = (connectionData: ConnectionData): string[] => {
  console.log('connect online users : ', connectionData.onlineUsers);
  return Array.from(connectionData.onlineUsers);
};

//Check if user is online
export const isUserOnline = (
  connectionData: ConnectionData,
  userId: string
): boolean => {
  return connectionData.onlineUsers.has(userId);
};

//Get user socket ID
export const getUserSocketId = (
  connectionData: ConnectionData,
  userId: string
): string | undefined => {
  return connectionData.userSocketMap.get(userId);
};

//Get socket user ID
export const getSocketUserId = (
  connectionData: ConnectionData,
  socketId: string
): string | undefined => {
  return connectionData.socketUserMap.get(socketId);
};
