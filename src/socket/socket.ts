import colors from 'colors';
import { Server, Socket } from 'socket.io';
import { logger } from '../shared/logger';
import { User } from '../modules/user/user.model';
import { TokenService } from '../modules/token/token.services';
import { config } from '../config';
import { Secret } from 'jsonwebtoken';
import { TokenType } from '../modules/token/token.interface';
import { ChatService } from '../modules/chat/chat.service';
import { MessageService } from '../modules/message/message.service';
import { NotificationService } from '../modules/notification/notification.services';
import { StatusCodes } from 'http-status-codes';
import {
  IContent,
  IMessage,
  MessageType,
} from '../modules/message/message.interface';
import { Types } from 'mongoose';

declare module 'socket.io' {
  interface Socket {
    userId?: string;
    userEmail?: string;
    userRole?: string;
    lastSeen?: Date;
    isAuthenticated?: boolean;
  }
}

// Store active users with their socket IDs
const activeUsers = new Map<string, Set<string>>();

const socket = (io: Server) => {
  // Socket Authentication Middleware
  io.use(async (socket: Socket, next) => {
    try {
      const token =
        socket.handshake.headers?.authorization ||
        socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify token
      const verifiedUser = await TokenService.verifyToken(
        token,
        config.jwt.accessSecret as Secret,
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
      socket.lastSeen = new Date();

      next();
    } catch (error: any) {
      socket.emit('connection:error', {
        code: StatusCodes.UNAUTHORIZED,
        message: error?.message || 'Authentication failed',
      });
    }
  });

  io.on('connection', (socket: Socket) => {
    logger.info(
      colors.green(
        `✅ User ${socket.userId} connected with socket ${socket.id}`
      )
    );

    // Join user's personal room - ei room e SHOB kichu ashbe
    if (socket.userId) { 
      socket.join(socket.userId);

      // Track active users
      if (!activeUsers.has(socket.userId)) {
        activeUsers.set(socket.userId, new Set());
      }
      activeUsers.get(socket.userId)!.add(socket.id);

      // Update user status to online
      User.findByIdAndUpdate(
        socket.userId,
        {
          $set: {
            'profile.isOnline': true,
            'metadata.lastLoginAt': new Date(),
          },
        },
        { new: true }
      )
        .then(() => {
          // Send connection success to user
          socket.emit('user:connected', {
            userId: socket.userId,
            status: 'online',
            timestamp: new Date(),
          });

          // Broadcast to other users that this user is online
          socket.broadcast.emit('user:online', {
            userId: socket.userId,
            timestamp: new Date(),
          });

          logger.info(colors.cyan(`👤 User ${socket.userId} is now online`));
        })
        .catch((error: any) => {
          logger.error(
            colors.red(`❌ Error updating user status: ${error?.message}`)
          );
        });
    }

    // ============================================
    // CONVERSATION LIST - Automatic Real-time
    // ============================================
    socket.on(
      'conversation-list',
      async (
        data: { page?: number; limit?: number; searchTerm?: string },
        callback
      ) => {
        try {
          const userId = socket.userId;
          if (!userId) {
            socket.emit('conversation-list:error', {
              code: 400,
              message: 'User ID required',
            });
            return;
          }

          // Get all chats for the user
          const filters = { senderId: userId, searchTerm: data?.searchTerm };
          const options = {
            page: data?.page || 1,
            limit: data?.limit || 50,
            sortBy: 'updatedAt:desc',
          };

          const chats = await ChatService.getAllChatsByUserId(filters, options);
          console.log('Chats', chats);
          callback({
            code: 200,
            message: 'Conversation list fetched successfully',
            data: chats,
          });
        } catch (error: any) {
          callback({
            code: 500,
            message: 'Failed to fetch conversation list',
            error: error?.message,
          });
        }
      }
    );

    // ============================================
    // GET MESSAGES - Specific chat er messages
    // ============================================
    socket.on(
      'get-messages',
      async (
        data: { receiverId: string; page?: number; limit?: number },
        callback
      ) => {
        try {
          const senderId = socket.userId;
          const { receiverId, page = 1, limit = 50 } = data;

          if (!senderId || !receiverId) {
            socket.emit('get-messages:error', {
              code: 400,
              message: 'Sender and receiver IDs required',
            });
            return;
          }

          const options = {
            page,
            limit,
            sortBy: 'createdAt:asc', // Old to new order
          };

          const messages = await MessageService.getAllMessagesByReceiverId(
            { senderId, receiverId },
            options
          );

          callback({
            code: 200,
            message: 'Messages fetched successfully',
            data: messages,
          });
        } catch (error: any) {
          callback({
            code: 500,
            message: 'Failed to fetch messages',
            error: error?.message,
          });
        }
      }
    );

    // ============================================
    // SEND MESSAGE - Real-time to receiver
    // ============================================
    socket.on(
      'send-message',
      async (data: { message: string; receiverId: string }) => {
        try {
          const { message, receiverId } = data;
          const senderId = socket.userId;

          if (!senderId) {
            socket.emit('send-message:error', {
              code: 401,
              message: 'User not authenticated',
            });
            return;
          }

          if (!receiverId || !message) {
            socket.emit('send-message:error', {
              code: 400,
              message: 'Receiver ID and message are required',
            });
            return;
          }

          // Create message content
          const content: IContent = {
            messageType: MessageType.TEXT,
            text: message,
            fileUrls: [],
            fileMetadata: [],
          };

          const payload: Partial<IMessage> = {
            senderId: new Types.ObjectId(senderId),
            receiverId: new Types.ObjectId(receiverId),
            content,
          };

          // Save message to database
          const savedMessage = await MessageService.sendMessage(payload);

          // 1. Success response to sender
          socket.emit('send-message:success', {
            code: 200,
            message: 'Message sent successfully',
            data: savedMessage,
          });

          // 2. REAL-TIME: Send to receiver's personal room
          io.to(receiverId).emit('new-message', {
            message: savedMessage,
            from: senderId,
            timestamp: new Date(),
          });

          // 3. Update conversation list for BOTH users
          io.to(senderId).emit('conversation-updated', {
            receiverId: receiverId,
            lastMessage: savedMessage,
            timestamp: new Date(),
          });

          io.to(receiverId).emit('conversation-updated', {
            receiverId: senderId,
            lastMessage: savedMessage,
            timestamp: new Date(),
          });

          logger.info(
            colors.green(
              `✉️  Message sent: ${senderId} -> ${receiverId} | "${message.substring(
                0,
                20
              )}..."`
            )
          );
        } catch (error: any) {
          logger.error(
            colors.red(`❌ Error sending message: ${error?.message}`)
          );
          socket.emit('send-message:error', {
            code: 500,
            message: error?.message || 'Failed to send message',
          });
        }
      }
    );

    // ============================================
    // MARK MESSAGE AS SEEN
    // ============================================
    socket.on('mark-seen', async (data: { messageId: string }) => {
      try {
        const userId = socket.userId;
        if (!userId) {
          socket.emit('mark-seen:error', {
            code: 401,
            message: 'User not authenticated',
          });
          return;
        }

        const message = await MessageService.markMessageSeen(data.messageId);

        socket.emit('mark-seen:success', {
          code: 200,
          message: 'Message marked as seen',
          data: message,
        });

        // Notify sender that message was seen
        if (message && message.senderId) {
          io.to(message.senderId.toString()).emit('message-seen', {
            messageId: data.messageId,
            seenBy: userId,
            timestamp: new Date(),
          });
        }

        logger.info(
          colors.cyan(
            `👁️  Message ${data.messageId} marked as seen by ${userId}`
          )
        );
      } catch (error: any) {
        logger.error(
          colors.red(`❌ Error marking message as seen: ${error?.message}`)
        );
        socket.emit('mark-seen:error', {
          code: 500,
          message: error?.message || 'Failed to mark message as seen',
        });
      }
    });

    // ============================================
    // DELETE MESSAGE
    // ============================================
    socket.on('delete-message', async (data: { messageId: string }) => {
      try {
        const userId = socket.userId;
        if (!userId) {
          socket.emit('delete-message:error', {
            code: 401,
            message: 'User not authenticated',
          });
          return;
        }

        const message = await MessageService.deleteMessage(
          userId,
          data.messageId
        );

        socket.emit('delete-message:success', {
          code: 200,
          message: 'Message deleted successfully',
          data: message,
        });

        // Notify receiver about deletion
        if (message && message.receiverId) {
          io.to(message.receiverId.toString()).emit('message-deleted', {
            messageId: data.messageId,
            deletedBy: userId,
            timestamp: new Date(),
          });
        }

        logger.info(
          colors.yellow(`🗑️  Message ${data.messageId} deleted by ${userId}`)
        );
      } catch (error: any) {
        logger.error(
          colors.red(`❌ Error deleting message: ${error?.message}`)
        );
        socket.emit('delete-message:error', {
          code: 500,
          message: error?.message || 'Failed to delete message',
        });
      }
    });

    // ============================================
    // UPDATE MESSAGE
    // ============================================
    socket.on(
      'update-message',
      async (data: { messageId: string; message: string }) => {
        try {
          const userId = socket.userId;
          if (!userId) {
            socket.emit('update-message:error', {
              code: 401,
              message: 'User not authenticated',
            });
            return;
          }

          const updatedMessage = await MessageService.updateMessage(
            data.messageId,
            data.message
          );

          socket.emit('update-message:success', {
            code: 200,
            message: 'Message updated successfully',
            data: updatedMessage,
          });

          // Notify receiver about update
          if (updatedMessage && updatedMessage.receiverId) {
            io.to(updatedMessage.receiverId.toString()).emit(
              'message-updated',
              {
                message: updatedMessage,
                updatedBy: userId,
                timestamp: new Date(),
              }
            );
          }

          logger.info(
            colors.cyan(`✏️  Message ${data.messageId} updated by ${userId}`)
          );
        } catch (error: any) {
          logger.error(
            colors.red(`❌ Error updating message: ${error?.message}`)
          );
          socket.emit('update-message:error', {
            code: 500,
            message: error?.message || 'Failed to update message',
          });
        }
      }
    );

    // ============================================
    // ADD REACTION
    // ============================================
    socket.on(
      'add-reaction',
      async (data: { messageId: string; emoji: string }) => {
        try {
          const userId = socket.userId;
          if (!userId) {
            socket.emit('add-reaction:error', {
              code: 401,
              message: 'User not authenticated',
            });
            return;
          }

          const message = await MessageService.addReaction(
            data.messageId,
            userId,
            data.emoji
          );

          socket.emit('add-reaction:success', {
            code: 200,
            message: 'Reaction added successfully',
            data: message,
          });

          // Notify both sender and receiver
          if (message) {
            const receiverId = message.receiverId?.toString();
            const senderId = message.senderId?.toString();

            const reactionData = {
              messageId: data.messageId,
              userId,
              emoji: data.emoji,
              timestamp: new Date(),
            };

            if (receiverId && receiverId !== userId) {
              io.to(receiverId).emit('reaction-added', reactionData);
            }
            if (senderId && senderId !== userId) {
              io.to(senderId).emit('reaction-added', reactionData);
            }
          }

          logger.info(
            colors.cyan(`😊 Reaction ${data.emoji} added by ${userId}`)
          );
        } catch (error: any) {
          logger.error(
            colors.red(`❌ Error adding reaction: ${error?.message}`)
          );
          socket.emit('add-reaction:error', {
            code: 500,
            message: error?.message || 'Failed to add reaction',
          });
        }
      }
    );

    // ============================================
    // SEARCH MESSAGES
    // ============================================
    socket.on(
      'search-messages',
      async (data: {
        receiverId: string;
        searchTerm: string;
        page?: number;
        limit?: number;
      }) => {
        try {
          const userId = socket.userId;
          if (!userId) {
            socket.emit('search-messages:error', {
              code: 401,
              message: 'User not authenticated',
            });
            return;
          }

          // Get chat between users first
          const chat = await ChatService.createSingleChat(
            userId,
            data.receiverId
          );
          if (!chat) {
            socket.emit('search-messages:error', {
              code: 404,
              message: 'Chat not found',
            });
            return;
          }
          const options = {
            page: data.page || 1,
            limit: data.limit || 20,
            sortBy: 'createdAt:desc',
          };

          const messages = await MessageService.searchMessages(
            chat?._id as string,
            data.searchTerm,
            options
          );

          socket.emit('search-messages:success', {
            code: 200,
            message: 'Messages searched successfully',
            data: messages,
          });

          logger.info(
            colors.cyan(`🔍 Search: "${data.searchTerm}" by ${userId}`)
          );
        } catch (error: any) {
          logger.error(
            colors.red(`❌ Error searching messages: ${error?.message}`)
          );
          socket.emit('search-messages:error', {
            code: 500,
            message: error?.message || 'Failed to search messages',
          });
        }
      }
    );

    // ============================================
    // TYPING INDICATORS
    // ============================================
    socket.on('typing-start', (data: { receiverId: string }) => {
      const userId = socket.userId;
      if (userId && data.receiverId) {
        io.to(data.receiverId).emit('user-typing', {
          userId,
          isTyping: true,
          timestamp: new Date(),
        });
      }
    });

    socket.on('typing-stop', (data: { receiverId: string }) => {
      const userId = socket.userId;
      if (userId && data.receiverId) {
        io.to(data.receiverId).emit('user-typing', {
          userId,
          isTyping: false,
          timestamp: new Date(),
        });
      }
    });

    // ============================================
    // NOTIFICATIONS
    // ============================================
    socket.on(
      'get-notifications',
      async (data: { page?: number; limit?: number }) => {
        try {
          const userId = socket.userId;
          if (!userId) {
            socket.emit('get-notifications:error', {
              code: 401,
              message: 'User not authenticated',
            });
            return;
          }

          const options = {
            page: data?.page || 1,
            limit: data?.limit || 20,
            sortBy: 'createdAt:desc',
          };

          const notifications = await NotificationService.getALLNotification(
            {},
            options,
            userId
          );

          socket.emit('get-notifications:success', {
            code: 200,
            message: 'Notifications fetched successfully',
            data: notifications,
          });
        } catch (error: any) {
          logger.error(
            colors.red(`❌ Error fetching notifications: ${error?.message}`)
          );
          socket.emit('get-notifications:error', {
            code: 500,
            message: error?.message || 'Failed to fetch notifications',
          });
        }
      }
    );

    socket.on('get-notification-count', async () => {
      try {
        const userId = socket.userId;
        if (!userId) {
          socket.emit('get-notification-count:error', {
            code: 401,
            message: 'User not authenticated',
          });
          return;
        }

        const count = await NotificationService.getUnViewNotificationCount(
          userId
        );

        socket.emit('get-notification-count:success', {
          code: 200,
          message: 'Notification count fetched successfully',
          data: { count },
        });
      } catch (error: any) {
        logger.error(
          colors.red(`❌ Error fetching notification count: ${error?.message}`)
        );
        socket.emit('get-notification-count:error', {
          code: 500,
          message: error?.message || 'Failed to fetch notification count',
        });
      }
    });

    socket.on('mark-notifications-read', async () => {
      try {
        const userId = socket.userId;
        if (!userId) {
          socket.emit('mark-notifications-read:error', {
            code: 401,
            message: 'User not authenticated',
          });
          return;
        }

        await NotificationService.viewAllNotifications(userId);

        socket.emit('mark-notifications-read:success', {
          code: 200,
          message: 'All notifications marked as read',
        });
      } catch (error: any) {
        logger.error(
          colors.red(`❌ Error marking notifications read: ${error?.message}`)
        );
        socket.emit('mark-notifications-read:error', {
          code: 500,
          message: error?.message || 'Failed to mark notifications as read',
        });
      }
    });

    socket.on('clear-notifications', async () => {
      try {
        const userId = socket.userId;
        if (!userId) {
          socket.emit('clear-notifications:error', {
            code: 401,
            message: 'User not authenticated',
          });
          return;
        }

        await NotificationService.clearAllNotification(userId);

        socket.emit('clear-notifications:success', {
          code: 200,
          message: 'All notifications cleared',
        });
      } catch (error: any) {
        logger.error(
          colors.red(`❌ Error clearing notifications: ${error?.message}`)
        );
        socket.emit('clear-notifications:error', {
          code: 500,
          message: error?.message || 'Failed to clear notifications',
        });
      }
    });

    // ============================================
    // DISCONNECT HANDLER
    // ============================================
    const handleDisconnect = async () => {
      if (!socket.userId) return;

      try {
        const userId = socket.userId;

        // Remove from active users tracking
        if (activeUsers.has(userId)) {
          activeUsers.get(userId)!.delete(socket.id);

          // If no more active sockets for this user, mark as offline
          if (activeUsers.get(userId)!.size === 0) {
            activeUsers.delete(userId);

            // Update user status to offline
            await User.findByIdAndUpdate(userId, {
              $set: {
                'profile.isOnline': false,
                'metadata.lastLoginAt': new Date(),
              },
            });

            // Broadcast to other users that this user is offline
            socket.broadcast.emit('user-offline', {
              userId: userId,
              timestamp: new Date(),
            });

            logger.info(
              colors.yellow(`👋 User ${userId} disconnected and marked offline`)
            );
          }
        }
      } catch (error: any) {
        logger.error(
          colors.red(`❌ Error in handleDisconnect: ${error?.message}`)
        );
      }
    };

    socket.on('disconnect', () => {
      logger.info(colors.yellow(`🔌 Socket disconnected: ${socket.id}`));
      handleDisconnect();
    });

    // Handle errors
    socket.on('error', (error: any) => {
      logger.error(colors.red(`❌ Socket error: ${error?.message}`));
    });
  });

  // Helper functions
  io.getOnlineUsers = () => {
    return Array.from(activeUsers.keys());
  };

  io.isUserOnline = (userId: string) => {
    return activeUsers.has(userId) && activeUsers.get(userId)!.size > 0;
  };

  io.emitToUser = (userId: string, event: string, data: any) => {
    io.to(userId).emit(event, data);
  };
};

// Extend Socket.IO Server interface
declare module 'socket.io' {
  interface Server {
    getOnlineUsers(): string[];
    isUserOnline(userId: string): boolean;
    emitToUser(userId: string, event: string, data: any): void;
  }
}

export const socketHelper = { socket };
