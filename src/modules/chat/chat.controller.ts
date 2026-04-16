import { Response, Request } from 'express';
import { Types } from 'mongoose';
import { MessageType } from './chat.interface';
import { SOCKET_EVENTS } from './chat.constant';
import { ChatService } from './chat.service';
import catchAsync from './../../shared/catchAsync';
import sendResponse from './../../shared/sendResponse';
import { socketHelper } from './../../socket/index';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';

export class ChatController {
  // Send media message (Image/Video/Audio) via HTTP
  static sendMediaMessage = catchAsync(async (req: Request, res: Response) => {
    // const { userId: currentUserId } = req.user;
    const { userId: currentUserId } = req.user as JwtPayload;
    const { receiverId, messageType, replyTo, content } = req.body;
    const mediaFile = req.file;

    // Validate media file exists
    if (!mediaFile) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Media file is required',
      });
    }

    // Validate message type
    const validMediaTypes = [
      MessageType.IMAGE,
      MessageType.VIDEO,
      MessageType.AUDIO,
    ];

    if (!validMediaTypes.includes(messageType)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid message type for media upload',
      });
    }

    console.log(
      `📎 Uploading ${messageType} from ${currentUserId} to ${receiverId}`,
    );

    // Send message (file will be uploaded to S3 in service)
    const message = await ChatService.sendMessage(
      currentUserId as any,
      receiverId,
      content, // Optional caption/text with media
      messageType,
      mediaFile,
      replyTo,
    );

    const io = req.app.get('io');
    if (io && socketHelper) {
      const chatId = message.chatId.toString();

      // Emit to sender
      socketHelper.emitToUser(io, currentUserId, SOCKET_EVENTS.MESSAGE_NEW, {
        message,
      });

      // Emit to the chat room (all users who have joined this chat)
      io.to(chatId).emit(SOCKET_EVENTS.MESSAGE_NEW, {
        message,
      });

      // Update sender's chat list
      await socketHelper.emitChatListToUser(io, currentUserId);

      console.log(`✅ Updated chat list for sender ${currentUserId}`);

      // If receiver is online
      if (socketHelper.isUserOnline(receiverId)) {
        // Update receiver's chat list
        await socketHelper.emitChatListToUser(io, receiverId);

        console.log(`✅ Updated chat list for receiver ${receiverId}`);

        // Mark as delivered
        await ChatService.markMessageAsDelivered(
          message._id.toString(),
          receiverId as any,
        );

        // Notify sender about delivery
        socketHelper.emitToUser(
          io,
          currentUserId,
          SOCKET_EVENTS.MESSAGE_DELIVERED,
          {
            messageId: message._id,
            deliveredTo: receiverId,
            deliveredAt: new Date(),
          },
        );

        console.log(`✅ Media message delivered to ${receiverId}`);
      } else {
        console.log(`⏸️  Receiver ${receiverId} is offline`);
      }
    }

    sendResponse(res, {
      code: StatusCodes.CREATED,
      message: 'Media message sent successfully',
      data: message,
    });
  });
  static sendMessageOnUser = catchAsync(async (req: Request, res: Response) => {
    const { userId: senderId } = req.user as JwtPayload;
    const { receiverId } = req.params;
    const { content, replyTo } = req.body;
    const files = req.files as any;

    const message = await ChatService.sendMessageIntoUser({
      senderId,
      receiverId,
      content,
      files,
      replyTo,
    });

    sendResponse(res, {
      code: 201,
      message: 'Message sent successfully',
      data: message,
    });
  });
  // get user message with chat
  static getMessages = catchAsync(async (req: Request, res: Response) => {
    const { userId: currentUserId } = req.user as JwtPayload;
    const { otherUserId } = req.params;
    const { limit, offset } = req.query;

    const data = await ChatService.getUserMessages(
      currentUserId,
      otherUserId,
      Number(limit) || 50,
      Number(offset) || 0,
    );

    return sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Messages fetched successfully',
      data: data || [],
    });
  });

  // Get chat messages
  static getChatMessages = catchAsync(async (req: Request, res: Response) => {
    const { userId } = req.user as JwtPayload;
    const { chatId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const messages = await ChatService.getChatMessages(
      chatId,
      userId as any,
      Number(limit),
      Number(offset),
    );

    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Messages retrieved successfully',
      data: messages,
    });
  });

  // Get user chats
  static getUserChats = catchAsync(async (req: Request, res: Response) => {
    const { userId } = req.user as JwtPayload;
    const chats = await ChatService.getUserChats(userId as any);

    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Chats retrieved successfully',
      data: chats,
    });
  });

  static getChatUsers = catchAsync(async (req: Request, res: Response) => {
    const { userId: currentUserId } = req.user as JwtPayload;
    const users = await ChatService.getChatUsers(currentUserId);

    sendResponse(res, {
      code: 200,
      message: 'Chat users fetched successfully',
      data: users,
    });
  });

  // Update message (text only)
  static updateMessage = catchAsync(async (req: Request, res: Response) => {
    const { userId } = req.user as JwtPayload;
    const { messageId } = req.params;
    const { content } = req.body;

    const message = await ChatService.updateMessage(
      messageId,
      userId as any,
      content,
    );

    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Message updated successfully',
      data: message,
    });
  });

  // Delete message
  static deleteMessage = catchAsync(async (req: Request, res: Response) => {
    const { userId } = req.user as JwtPayload;
    const { messageId } = req.params;

    await ChatService.deleteMessage(messageId, userId as any);

    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Message deleted successfully',
      data: { deletedCount: 1 },
    });
  });

  // Delete conversation
  static deleteConversation = catchAsync(
    async (req: Request, res: Response) => {
      const { userId } = req.user as JwtPayload;
      const { chatId } = req.params;

      await ChatService.deleteConversation(chatId, userId as any);

      sendResponse(res, {
        code: StatusCodes.OK,

        message: 'Conversation deleted successfully',
        data: null,
      });
    },
  );

  // Block user
  static blockUser = catchAsync(async (req: Request, res) => {
    const { userId } = req.user as JwtPayload;
    const { blockedId } = req.body;

    await ChatService.blockUser(userId as any, blockedId);

    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'User blocked successfully',
      data: null,
    });
  });

  // Unblock user
  static unblockUser = catchAsync(async (req: Request, res: Response) => {
    const { userId } = req.user as JwtPayload;
    const { blockedId } = req.params;

    await ChatService.unblockUser(userId as any, new Types.ObjectId(blockedId));

    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'User unblocked successfully',
      data: null,
    });
  });

  // Get blocked users
  static getBlockedUsers = catchAsync(async (req: Request, res: Response) => {
    const { userId } = req.user as JwtPayload;
    const blockedUsers = await ChatService.getBlockedUsers(userId as any);

    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Blocked users retrieved successfully',
      data: blockedUsers,
    });
  });

  // Mark messages as read (can also be done via socket)
  static markMessagesAsRead = catchAsync(
    async (req: Request, res: Response) => {
      const { userId } = req.user as JwtPayload;
      const { chatId } = req.params;

      await ChatService.markMessagesAsRead(chatId, userId as any);

      sendResponse(res, {
        code: StatusCodes.OK,

        message: 'Messages marked as read',
        data: null,
      });
    },
  );
}
