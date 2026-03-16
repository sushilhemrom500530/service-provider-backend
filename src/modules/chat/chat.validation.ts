import { z } from 'zod';
import { MessageType } from './chat.interface';

export const ChatValidation = {
  // Send text message
  sendMessageSchema: z.object({
    body: z.object({
      receiverId: z.string().min(1, 'Receiver ID is required'),
      content: z
        .string()
        .min(1, 'Message content cannot be empty')
        .optional(),
      messageType: z
        .enum([MessageType.TEXT, MessageType.IMAGE, MessageType.VIDEO, MessageType.AUDIO])
        .default(MessageType.TEXT),
      replyTo: z.string().optional(),
    }),
  }),

  // Update message
  updateMessageSchema: z.object({
    params: z.object({
      messageId: z.string().min(1, 'Message ID is required'),
    }),
    body: z.object({
      content: z.string().min(1, 'Message content cannot be empty'),
    }),
  }),

  // Delete message
  deleteMessageSchema: z.object({
    params: z.object({
      messageId: z.string().min(1, 'Message ID is required'),
    }),
  }),

  // Get messages
  getMessagesSchema: z.object({
    params: z.object({
      chatId: z.string().min(1, 'Chat ID is required'),
    }),
    query: z.object({
      limit: z
        .string()
        .optional()
        .transform(val => (val ? parseInt(val) : 50)),
      offset: z
        .string()
        .optional()
        .transform(val => (val ? parseInt(val) : 0)),
    }),
  }),

  // Block user
  blockUserSchema: z.object({
    body: z.object({
      userId: z.string().min(1, 'User ID is required'),
    }),
  }),

  // Unblock user
  unblockUserSchema: z.object({
    params: z.object({
      userId: z.string().min(1, 'User ID is required'),
    }),
  }),

  // Search users
  searchUsersSchema: z.object({
    query: z.object({
      search: z.string().min(1, 'Search query is required'),
      limit: z
        .string()
        .optional()
        .transform(val => (val ? parseInt(val) : 20)),
      offset: z
        .string()
        .optional()
        .transform(val => (val ? parseInt(val) : 0)),
    }),
  }),

  // Delete conversation
  deleteConversationSchema: z.object({
    params: z.object({
      chatId: z.string().min(1, 'Chat ID is required'),
    }),
  }),

  // Mark messages as read
  markAsReadSchema: z.object({
    params: z.object({
      chatId: z.string().min(1, 'Chat ID is required'),
    }),
  }),
};
