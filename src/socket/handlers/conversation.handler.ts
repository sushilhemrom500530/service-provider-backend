import { Server, Socket } from 'socket.io';
import { ChatService } from '../../modules/chat/chat.service';
import { StatusCodes } from 'http-status-codes';
import { logger } from '../../shared/logger';
import colors from 'colors';
import { sendSystemNotification } from './notification.handler';
/**
 * Get conversation list handler
 */
export const getConversationList = async (
  io: Server,
  socket: Socket,
  data: any,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId!;
    const { page = 1, limit = 50, searchTerm } = data;

    const filters = {
      senderId: userId,
      searchTerm,
    };
    const options = {
      page,
      limit,
      sortBy: 'updatedAt:desc',
    };

    const chats = await ChatService.getAllChatsByUserId(filters, options);

    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'Conversation list fetched successfully',
        data: chats,
      });
    }

    logger.info(
      colors.green(`✅ Conversation list fetched for user ${userId}`)
    );
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error fetching conversation list: ${error?.message}`)
    );
    
    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to fetch conversation list',
      });
    }
  }
};

/**
 * Create or get single chat handler
 */
export const getOrCreateChat = async (
  io: Server,
  socket: Socket,
  data: any,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId!;
    const { receiverId } = data;

    if (!receiverId) {
      if (callback && typeof callback === 'function') {
        return callback({
          code: StatusCodes.BAD_REQUEST,
          success: false,
          message: 'Receiver ID required',
        });
      }
      return;
    }

    // Create or get single chat
    const chat = await ChatService.createSingleChat(userId, receiverId);

    if (!chat) {
      if (callback && typeof callback === 'function') {
        return callback({
          code: StatusCodes.NOT_FOUND,
          success: false,
          message: 'Failed to create or get chat',
        });
      }
      return;
    }

    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'Chat retrieved successfully',
        data: chat,
      });
    }

    // If new chat was created, send a connection notification
    if (
      chat &&
      chat.createdAt &&
      new Date().getTime() - new Date(chat.createdAt).getTime() < 5000
    ) {
      await sendSystemNotification(
        io,
        userId,
        'New Chat Created',
        `You started a chat with ${receiverId}`,
        'connection',
        chat._id
      );
      await sendSystemNotification(
        io,
        receiverId,
        'New Chat Created',
        `You have a new chat with ${userId}`,
        'connection',
        chat._id
      );
    }

    logger.info(
      colors.green(`✅ Chat retrieved for users ${userId} and ${receiverId}`)
    );
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error getting/creating chat: ${error?.message}`)
    );
    
    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to get or create chat',
      });
    }
  }
};


/**
 * Delete conversation handler
 */
export const deleteConversation = async (
  io: Server,
  socket: Socket,
  data: any,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId!;
    const { conversationId } = data;

    if (!conversationId) {
      if (callback && typeof callback === 'function') {
        return callback({
          code: StatusCodes.BAD_REQUEST,
          success: false,
          message: 'Conversation ID required',
        });
      }
      return;
    }

    // Delete conversation
    const deletedChat = await ChatService.deleteChat(conversationId);

    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'Conversation deleted successfully',
        data: deletedChat,
      });
    }

    logger.info(
      colors.yellow(`🗑️ Conversation ${conversationId} deleted by ${userId}`)
    );
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error deleting conversation: ${error?.message}`)
    );
    
    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to delete conversation',
      });
    }
  }
};
