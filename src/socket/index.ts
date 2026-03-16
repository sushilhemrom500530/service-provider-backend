import { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import {
  SOCKET_EVENTS,
  MESSAGE_PAGINATION,
} from '../modules/chat/chat.constant';
import { ChatService } from '../modules/chat/chat.service';
import { MessageType } from '../modules/chat/chat.interface';
import { Chat } from '../modules/chat/chat.model';
import { verifyAccessToken } from '../utils/verifyAccessToken';
import { User } from '../modules/user/user.model';

// State stores
const onlineUsers = new Map<string, string>();
const typingUsers = new Map<string, Set<string>>();

// Helper to emit chat list
const emitChatListToUser = async (
  io: Server,
  userId: string,
): Promise<void> => {
  try {
    const userChats = await Chat.find({
      participants: userId,
      deletedBy: { $ne: userId },
      isActive: true,
    })
      .populate('participants', 'email name image lastLoginAt')
      .populate({
        path: 'lastMessage',
        select: 'content type createdAt sender',
        populate: {
          path: 'sender',
          select: 'fullName email profileUrl',
        },
      })
      .sort({ lastMessageAt: -1 })
      .lean();

    const chatsWithStatus = userChats.map(chat => {
      const other = chat.participants.find(
        (p: any) => p._id.toString() !== userId,
      ) as any;
      const lastMsg =
        chat.lastMessage &&
        typeof chat.lastMessage === 'object' &&
        'content' in chat.lastMessage
          ? {
              _id: (chat.lastMessage as any)._id,
              content: (chat.lastMessage as any).content,
              type: (chat.lastMessage as any).type,
              createdAt: (chat.lastMessage as any).createdAt,
              sender: (chat.lastMessage as any).sender
                ? {
                    _id: (chat.lastMessage as any).sender._id,
                    fullName: (chat.lastMessage as any).sender.fullName || '',
                    email: (chat.lastMessage as any).sender.email,
                    profileUrl:
                      (chat.lastMessage as any).sender.profileUrl || '',
                  }
                : null,
            }
          : null;

      return {
        chatId: chat._id,
        otherUser: {
          _id: other?._id,
          fullName: other?.fullName || '',
          email: other?.email,
          profileUrl: other?.profileUrl || '',
          lastLoginAt: other?.lastLoginAt,
          isOnline: onlineUsers.has(other?._id.toString()),
        },
        lastMessage: lastMsg,
        unreadCount: chat.unreadCount?.[userId] || 0,
        lastMessageAt: chat.lastMessageAt || null,
      };
    });

    const socketId = onlineUsers.get(userId);

    if (socketId) {
      io.to(socketId).emit(SOCKET_EVENTS.CHAT_LIST, {
        chats: chatsWithStatus,
        count: chatsWithStatus.length,
      });
    }
  } catch (err) {
    console.error('Emit chat list error:', err);
  }
};

// Emit initial messages (newest batch) - FIXED
const emitInitialMessages = async (
  io: Server,
  userId: string,
  chatId: string,
): Promise<void> => {
  try {
    // Convert userId string to ObjectId for the service call
    const userObjectId = new Types.ObjectId(userId);

    const messages = await ChatService.getChatMessages(
      chatId, // Keep as string - service will convert it
      userObjectId,
      MESSAGE_PAGINATION.INITIAL_LIMIT,
      0, // offset, not undefined
    );

    const socketId = onlineUsers.get(userId);
    if (socketId) {
      io.to(socketId).emit(SOCKET_EVENTS.CHAT_MESSAGES, {
        chatId,
        messages: messages.length > 0 ? [messages[messages.length - 1]] : [],
        hasMore: false,
        oldestMessageAt:
          messages.length > 0 ? messages[messages.length - 1].createdAt : null,
      });

      // io.to(socketId).emit(SOCKET_EVENTS.CHAT_MESSAGES, {
      //   chatId,
      //   messages,
      //   hasMore: messages.length === MESSAGE_PAGINATION.INITIAL_LIMIT,
      //   oldestMessageAt: messages.length > 0 ? messages[0].createdAt : null,
      // });
    }
  } catch (err) {
    console.error('Emit initial messages error:', err);
  }
};

// Update chat list for mutual contacts
const updateChatListForMutualContacts = async (
  io: Server,
  userId: string,
): Promise<void> => {
  try {
    const chats = await Chat.find({
      participants: userId,
      deletedBy: { $ne: userId },
      isActive: true,
    }).select('participants');

    const affectedUserIds = new Set<string>();
    for (const chat of chats) {
      for (const pId of chat.participants) {
        const pStr = pId.toString();
        if (pStr !== userId) affectedUserIds.add(pStr);
      }
    }

    for (const affectedUserId of affectedUserIds) {
      if (onlineUsers.has(affectedUserId)) {
        await emitChatListToUser(io, affectedUserId);
      }
    }
  } catch (err) {
    console.error('Update mutual contacts error:', err);
  }
};

// Helper to emit to specific user

const emitToUser = (
  io: Server,
  userId: string,
  event: string,
  data: any,
): void => {
  const socketId = onlineUsers.get(userId);
  if (socketId) {
    io.to(socketId).emit(event, data);
    console.log(`✅ Emitted ${event} to user ${userId}`);
  } else {
    console.log(`⚠️ User ${userId} is not online, cannot emit ${event}`);
  }
};

// Main socket handler
export const socketHelper = {
  socket: (io: Server): void => {
    // Auth middleware
    io.use(async (socket: Socket, next) => {
      try {
        const token =
          socket.handshake.auth.token ||
          socket.handshake.headers.authorization?.split(' ')[1] ||
          socket.handshake.headers.token;

        console.log('token is :', token);

        if (!token)
          return next(new Error('Authentication error: No token provided'));

        const decoded = verifyAccessToken(token) as {
          userId: string;
          email: string;
          role: string;
        } | null;
        if (!decoded?.userId)
          return next(new Error('Authentication error: Invalid token'));

        (socket as any).data = { userId: decoded.userId };
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });

    io.on(SOCKET_EVENTS.CONNECTION, async (socket: Socket) => {
      const currentUserId = (socket as any).data.userId as string;
      console.log(`✅ User connected: ${currentUserId}`);

      onlineUsers.set(currentUserId, socket.id);
      await User.findByIdAndUpdate(currentUserId, {
        lastLoginAt: new Date(),
      });
      socket.join(currentUserId);

      await emitChatListToUser(io, currentUserId);
      socket.emit(SOCKET_EVENTS.ONLINE_USERS_LIST, {
        users: Array.from(onlineUsers.keys()),
        count: onlineUsers.size,
      });
      io.emit(SOCKET_EVENTS.USER_STATUS, {
        userId: currentUserId,
        isOnline: true,
        timestamp: new Date(),
      });
      await updateChatListForMutualContacts(io, currentUserId);

      // --- Event Handlers ---

      socket.on(
        SOCKET_EVENTS.JOIN_CHAT,
        async (data: { chatId: string; otherUserId: string }) => {
          const { chatId, otherUserId } = data;

          // Join the chat room for real-time updates
          socket.join(chatId);

          console.log(`👥 User ${currentUserId} joined chat ${chatId}`);

          // Send initial messages
          await emitInitialMessages(io, currentUserId, chatId);

          // Mark all messages as read
          await ChatService.markMessagesAsRead(
            chatId,
            new Types.ObjectId(currentUserId),
          );

          // Update chat list
          await emitChatListToUser(io, currentUserId);

          // Notify other user that this user joined and read messages
          if (onlineUsers.has(otherUserId)) {
            io.to(onlineUsers.get(otherUserId)!).emit(
              SOCKET_EVENTS.MESSAGES_READ,
              {
                chatId,
                readBy: currentUserId,
                readAt: new Date(),
              },
            );

            // Update other user's chat list to reflect unread count change
            await emitChatListToUser(io, otherUserId);
          }
        },
      );

      socket.on(SOCKET_EVENTS.LEAVE_CHAT, (data: { chatId: string }) => {
        socket.leave(data.chatId);
      });

      socket.on(
        SOCKET_EVENTS.USER_TYPING,
        (data: { chatId: string; otherUserId: string }) => {
          const { chatId, otherUserId } = data;
          if (!typingUsers.has(chatId)) {
            typingUsers.set(chatId, new Set<string>());
          }
          typingUsers.get(chatId)?.add(currentUserId);

          const otherSocketId = onlineUsers.get(otherUserId);
          if (otherSocketId) {
            io.to(otherSocketId).emit(SOCKET_EVENTS.USER_TYPING, {
              chatId,
              userId: currentUserId,
            });
          }
        },
      );

      socket.on(
        SOCKET_EVENTS.USER_STOPPED_TYPING,
        (data: { chatId: string; otherUserId: string }) => {
          const { chatId, otherUserId } = data;
          typingUsers.get(chatId)?.delete(currentUserId);

          const otherSocketId = onlineUsers.get(otherUserId);
          if (otherSocketId) {
            io.to(otherSocketId).emit(SOCKET_EVENTS.USER_STOPPED_TYPING, {
              chatId,
              userId: currentUserId,
            });
          }
        },
      );

      // socket.on(
      //   SOCKET_EVENTS.SEND_MESSAGE,
      //   async (data: {
      //     receiverId: string;
      //     content: string;
      //     replyTo?: string;
      //     tempId?: string;
      //   }) => {
      //     try {
      //       const { receiverId, content, replyTo, tempId } = data;

      //       // console.log("receiverId is", receiverId);

      //       if (!Types.ObjectId.isValid(receiverId)) {
      //         throw new Error("Invalid receiverId");
      //       }

      //       const newMessage = await ChatService.sendMessage(
      //         new Types.ObjectId(currentUserId),
      //         new Types.ObjectId(receiverId),
      //         content,
      //         MessageType.TEXT,
      //         undefined,
      //         replyTo
      //       );

      //       // Emit to sender with tempId for optimistic updates
      //       socket.emit(SOCKET_EVENTS.MESSAGE_NEW, {
      //         message: newMessage,
      //         tempId,
      //       });

      //       // Update sender's chat list
      //       await emitChatListToUser(io, currentUserId);

      //       // Get the chat to emit to all participants in the chat room
      //       const chatId = newMessage.chatId.toString();

      //       // Emit message to the chat room (all users who have joined this chat)
      //       io.to(chatId).emit(SOCKET_EVENTS.MESSAGE_NEW, {
      //         message: newMessage,
      //       });

      //       // If receiver is online
      //       if (onlineUsers.has(receiverId)) {
      //         // Update receiver's chat list
      //         await emitChatListToUser(io, receiverId);

      //         // Mark as delivered
      //         await ChatService.markMessageAsDelivered(
      //           newMessage._id.toString(),
      //           new Types.ObjectId(receiverId)
      //         );

      //         // Notify sender about delivery
      //         socket.emit(SOCKET_EVENTS.MESSAGE_DELIVERED, {
      //           messageId: newMessage._id,
      //           deliveredTo: receiverId,
      //           deliveredAt: new Date(),
      //         });

      //         console.log(`✅ Message delivered to ${receiverId}`);
      //       } else {
      //         console.log(
      //           `⏸️ Receiver ${receiverId} is offline, message will be delivered later`
      //         );
      //       }
      //     } catch (error: any) {
      //       socket.emit(SOCKET_EVENTS.ERROR, {
      //         message: error.message || "Failed to send message",
      //         tempId: data.tempId,
      //       });
      //     }
      //   }
      // );

      socket.on(SOCKET_EVENTS.SEND_MESSAGE, async data => {
        try {
          const { receiverId, content, replyTo, tempId } = data;
          // console.log('request data : ', data);
          // Save new message
          const newMessage = await ChatService.sendMessage(
            new Types.ObjectId(currentUserId),
            new Types.ObjectId(receiverId),
            content,
            MessageType.TEXT,
            undefined,
            replyTo,
          );

          const chatId = newMessage.chatId.toString();

          // Emit to sender for optimistic update
          socket.emit(SOCKET_EVENTS.MESSAGE_NEW, {
            message: newMessage,
            tempId,
          });

          // Emit to all participants in the chat room
          io.to(chatId).emit(SOCKET_EVENTS.MESSAGE_NEW, {
            message: newMessage,
          });

          // 🔹 Emit the latest message also on CHAT_MESSAGES so client listening to it sees new message
          if (onlineUsers.has(receiverId)) {
            const socketId = onlineUsers.get(receiverId)!;

            // send real-time message to receiver
            io.to(socketId).emit(SOCKET_EVENTS.MESSAGE_NEW, {
              message: newMessage,
            });

            io.to(socketId).emit(SOCKET_EVENTS.CHAT_MESSAGES, {
              chatId,
              messages: [newMessage], // send only the new message
              hasMore: false,
              oldestMessageAt: newMessage.createdAt,
            });
          }

          // Update chat:list for sender & receiver
          await emitChatListToUser(io, currentUserId);
          if (onlineUsers.has(receiverId))
            await emitChatListToUser(io, receiverId);
        } catch (error: any) {
          socket.emit(SOCKET_EVENTS.ERROR, {
            message: error.message || 'Failed to send message',
            tempId: data.tempId,
          });
        }
      });

      socket.on(
        SOCKET_EVENTS.UPDATE_MESSAGE,
        async (data: {
          messageId: string;
          newContent: string;
          otherUserId: string;
        }) => {
          try {
            const { messageId, newContent, otherUserId } = data;

            if (!Types.ObjectId.isValid(messageId)) {
              throw new Error('Invalid messageId');
            }

            const updated = await ChatService.updateMessage(
              messageId,
              new Types.ObjectId(currentUserId),
              newContent,
            );

            const chatId = updated.chatId.toString();

            // Emit updated message to the chat room (all participants)
            io.to(chatId).emit(SOCKET_EVENTS.MESSAGE_UPDATED, {
              message: updated,
            });

            // Check if this was the last message in chat
            const chat = await Chat.findById(updated.chatId).lean();
            if (chat?.lastMessage?.toString() === updated._id.toString()) {
              await emitChatListToUser(io, currentUserId);
              if (onlineUsers.has(otherUserId)) {
                await emitChatListToUser(io, otherUserId);
              }
            }
          } catch (error: any) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
          }
        },
      );

      socket.on(
        SOCKET_EVENTS.DELETE_MESSAGE,
        async (data: {
          messageId: string;
          otherUserId: string;
          chatId: string;
        }) => {
          try {
            const { messageId, otherUserId, chatId } = data;

            if (!Types.ObjectId.isValid(messageId)) {
              throw new Error('Invalid messageId');
            }

            await ChatService.deleteMessage(
              messageId,
              new Types.ObjectId(currentUserId),
            );

            // Emit to the chat room (all participants)
            io.to(chatId).emit(SOCKET_EVENTS.MESSAGE_DELETED, {
              messageId,
              chatId,
            });

            // Update chat lists
            await emitChatListToUser(io, currentUserId);
            if (onlineUsers.has(otherUserId)) {
              await emitChatListToUser(io, otherUserId);
            }
          } catch (error: any) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
          }
        },
      );

      socket.on(
        SOCKET_EVENTS.LOAD_OLDER_MESSAGES,
        async (data: { chatId: string; before?: string }) => {
          try {
            const { chatId, before } = data;
            const offset = before ? parseInt(before) : 0;

            const messages = await ChatService.getChatMessages(
              chatId,
              new Types.ObjectId(currentUserId),
              MESSAGE_PAGINATION.LOAD_MORE_LIMIT,
              offset,
            );

            socket.emit(SOCKET_EVENTS.OLDER_MESSAGES_LOADED, {
              chatId,
              messages,
              hasMore: messages.length === MESSAGE_PAGINATION.LOAD_MORE_LIMIT,
              oldestMessageAt:
                messages.length > 0 ? messages[0].createdAt : null,
            });
          } catch (error: any) {
            socket.emit(SOCKET_EVENTS.ERROR, {
              message: 'Failed to load older messages',
            });
          }
        },
      );

      socket.on(SOCKET_EVENTS.DISCONNECT, async () => {
        console.log(`❌ User disconnected: ${currentUserId}`);
        await updateChatListForMutualContacts(io, currentUserId);
        onlineUsers.delete(currentUserId);
        typingUsers.forEach(set => {
          if (set.has(currentUserId)) {
            set.delete(currentUserId);
          }
        });
        io.emit(SOCKET_EVENTS.USER_STATUS, {
          userId: currentUserId,
          isOnline: false,
          timestamp: new Date(),
        });
      });
    });

    io.on('connect_error', err => {
      console.error('Socket.IO connect error:', err);
    });

    console.log('Socket.IO Connected! ✅');
  },

  // Public methods
  isUserOnline: (userId: string): boolean => onlineUsers.has(userId),
  getOnlineUsers: (): string[] => Array.from(onlineUsers.keys()),
  emitToUser: emitToUser, // ✅ Export this
  emitChatListToUser: emitChatListToUser, // ✅ Export this
};
