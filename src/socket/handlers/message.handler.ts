import { Server, Socket } from 'socket.io';
import { MessageService } from '../../modules/message/message.service';
import { ChatService } from '../../modules/chat/chat.service';
import { StatusCodes } from 'http-status-codes';
import { IContent, MessageType } from '../../modules/message/message.interface';
import { Types } from 'mongoose';
import { logger } from '../../shared/logger';
import colors from 'colors';
import { emitToUser, emitError, emitSuccess } from '../utils/eventEmmiter';
// import { sendMessageNotification } from './notification.handler';

interface MessageData {
  message: string;
  receiverId: string;
  messageType?: MessageType;
  fileUrls?: string[];
}

/**
 * Get messages handler
 */
export const getMessages = async (
  io: Server,
  socket: Socket,
  data: any,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId!;
    const { receiverId, page = 1, limit = 50 } = data;

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

    const options = { page, limit, sortBy: 'createdAt:asc' };
    const messages = await MessageService.getAllMessagesByReceiverId(
      { senderId: userId, receiverId },
      options
    );

    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'Messages fetched successfully',
        data: messages,
      });
    }

    logger.info(colors.green(`✅ Messages fetched for user ${userId}`));
  } catch (error: any) {
    logger.error(colors.red(`❌ Error fetching messages: ${error?.message}`));
    
    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to fetch messages',
      });
    }
  }
};

/**
 * Send message handler
 */
export const sendMessage = async (
  io: Server,
  socket: Socket,
  data: MessageData,
  callback?: Function
): Promise<void> => {
  try {
    const userId = socket.userId!;
    const userProfile = socket.data.userProfile;
    const { message, receiverId, messageType, fileUrls } = data;

    if (!receiverId || !message?.trim()) {
      if (callback) {
        return callback({
          code: StatusCodes.BAD_REQUEST,
          success: false,
          message: 'Receiver ID and message content are required',
        });
      } else {
        emitError(io, userId, 'send-message', 'Receiver ID and message content are required', 400);
        return;
      }
    }

    // Create message content
    const content: IContent = {
      messageType: messageType || MessageType.TEXT,
      text: message,
      fileUrls: fileUrls || [],
      fileMetadata: [],
    };

    const payload = {
      senderId: new Types.ObjectId(userId),
      receiverId: new Types.ObjectId(receiverId),
      content,
    };

    // The message service will handle the socket emission
    const newMessage = await MessageService.sendMessage(payload);

    if (callback) {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'Message sent successfully',
        data: {
          _id: newMessage?._id,
          senderId: userId,
          receiverId,
          content: newMessage?.content,
          createdAt: newMessage?.createdAt,
          chatId: newMessage?.chatId?.toString(),
          senderInfo: {
            name: userProfile?.name,
            profileImage: userProfile?.profileImage,
          },
        },
      });
    }

    logger.info(
      colors.green(`✅ Message sent from ${userId} to ${receiverId}`)
    );
  } catch (error: any) {
    logger.error(colors.red(`❌ Error sending message: ${error?.message}`));
    if (callback) {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to send message',
      });
    } else {
      emitError(io, socket.userId || '', 'send-message', error?.message || 'Failed to send message');
    }
  }
};

/**
 * Mark message as seen handler
 */
export const markSeen = async (
  io: Server,
  socket: Socket,
  data: any,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId!;
    const { messageId } = data;

    if (!messageId) {
      if (callback && typeof callback === 'function') {
        return callback({
          code: StatusCodes.BAD_REQUEST,
          success: false,
          message: 'Message ID required',
        });
      }
      return;
    }

    const message = await MessageService.markMessageSeen(messageId);

    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'Message marked as seen',
        data: message,
      });
    }

    // Notify sender
    if (message?.senderId) {
      emitToUser(
        io,
        message.senderId.toString(),
        'message-seen',
        {
          messageId,
          seenBy: userId,
          timestamp: new Date(),
        }
      );
    }

    logger.info(colors.cyan(`👁️ Message ${messageId} seen by ${userId}`));
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error marking message seen: ${error?.message}`)
    );
    
    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to mark message as seen',
      });
    }
  }
};

/**
 * Delete message handler
 */
export const deleteMessage = async (
  io: Server,
  socket: Socket,
  data: any,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId!;
    const { messageId } = data;

    const message = await MessageService.deleteMessage(userId, messageId);

    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'Message deleted successfully',
        data: message,
      });
    }

    // Notify receiver
    if (message?.receiverId) {
      emitToUser(
        io,
        message.receiverId.toString(),
        'message-deleted',
        {
          messageId,
          deletedBy: userId,
          timestamp: new Date(),
        }
      );
    }

    logger.info(
      colors.yellow(`🗑️ Message ${messageId} deleted by ${userId}`)
    );
  } catch (error: any) {
    logger.error(colors.red(`❌ Error deleting message: ${error?.message}`));
    
    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to delete message',
      });
    }
  }
};

/**
 * Update message handler
 */
export const updateMessage = async (
  io: Server,
  socket: Socket,
  data: any,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId!;
    const { messageId, message } = data;

    const updatedMessage = await MessageService.updateMessage(
      messageId,
      message
    );

    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'Message updated successfully',
        data: updatedMessage,
      });
    }

    // Notify receiver
    if (updatedMessage?.receiverId) {
      emitToUser(
        io,
        updatedMessage.receiverId.toString(),
        'message-updated',
        {
          message: updatedMessage,
          updatedBy: userId,
          timestamp: new Date(),
        }
      );
    }

    logger.info(colors.cyan(`✏️ Message ${messageId} updated by ${userId}`));
  } catch (error: any) {
    logger.error(colors.red(`❌ Error updating message: ${error?.message}`));
    
    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to update message',
      });
    }
  }
};

/**
 * Add reaction handler
 */
export const addReaction = async (
  io: Server,
  socket: Socket,
  data: any,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId!;
    const { messageId, emoji } = data;

    const message = await MessageService.addReaction(
      messageId,
      userId,
      emoji
    );

    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.OK,
        success: true,
        message: 'Reaction added successfully',
        data: message,
      });
    }

    // Notify both parties
    if (message) {
      const reactionData = {
        messageId,
        userId,
        emoji,
        timestamp: new Date(),
      };

      const receiverId = message.receiverId?.toString();
      const senderId = message.senderId?.toString();

      if (receiverId && receiverId !== userId) {
        emitToUser(
          io,
          receiverId,
          'reaction-added',
          reactionData
        );
      }
      if (senderId && senderId !== userId) {
        emitToUser(
          io,
          senderId,
          'reaction-added',
          reactionData
        );
      }
    }

    logger.info(colors.cyan(`😊 Reaction ${emoji} added by ${userId}`));
  } catch (error: any) {
    logger.error(colors.red(`❌ Error adding reaction: ${error?.message}`));
    
    if (callback && typeof callback === 'function') {
      callback({
        code: StatusCodes.INTERNAL_SERVER_ERROR,
        success: false,
        message: error?.message || 'Failed to add reaction',
      });
    }
  }
};

/**
 * Search messages handler
 */
export const searchMessages = async (
  io: Server,
  socket: Socket,
  data: any,
  callback: Function
): Promise<void> => {
  try {
    const userId = socket.userId!;
    const { receiverId, searchTerm, page = 1, limit = 20 } = data;

    const chat = await ChatService.createSingleChat(userId, receiverId);

    if (!chat) {
      return callback({
        code: StatusCodes.NOT_FOUND,
        success: false,
        message: 'Chat not found',
      });
    }

    const options = { page, limit, sortBy: 'createdAt:desc' };
    const messages = await MessageService.searchMessages(
      chat?._id as string,
      searchTerm,
      options
    );

    callback({
      code: StatusCodes.OK,
      success: true,
      message: 'Messages searched successfully',
      data: messages,
    });

    logger.info(colors.cyan(`🔍 Search: "${searchTerm}" by ${userId}`));
  } catch (error: any) {
    logger.error(
      colors.red(`❌ Error searching messages: ${error?.message}`)
    );
    callback({
      code: StatusCodes.INTERNAL_SERVER_ERROR,
      success: false,
      message: error?.message || 'Failed to search messages',
    });
  }
};