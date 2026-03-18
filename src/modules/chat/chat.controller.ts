import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import { MessageType } from "./chat.interface";
import { SOCKET_EVENTS } from "./chat.constant";
import catchAsync from "./../../utils/catchAsync";
import sendResponse from "./../../utils/sendResponse";
import { CustomRequest } from "./../../utils/customRequest";
import { socketHelper } from "./../../utils/socket";
import { ChatService } from "./chat.service";

export class ChatController {
  // Send media message (Image/Video/Audio) via HTTP
  static sendMediaMessage = catchAsync(
    async (req: CustomRequest, res: Response) => {
      const { id: currentUserId } = req.user;
      const { receiverId, messageType, replyTo, content } = req.body;
      const mediaFile = req.file;

      // Validate media file exists
      if (!mediaFile) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Media file is required",
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
          message: "Invalid message type for media upload",
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

      const io = req.app.get("io");
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
        statusCode: StatusCodes.CREATED,
        success: true,
        message: "Media message sent successfully",
        data: message,
      });
    },
  );
  static sendMessageOnUser = catchAsync(
    async (req: CustomRequest, res: Response) => {
      const senderId = req.user.id;
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
        statusCode: 201,
        success: true,
        message: "Message sent successfully",
        data: message,
      });
    },
  );
  // get user message with chat
  static getMessages = catchAsync(async (req: CustomRequest, res: Response) => {
    const currentUserId = req.user.id;
    const { otherUserId } = req.params;
    const { limit, offset } = req.query;

    const data = await ChatService.getUserMessages(
      currentUserId,
      otherUserId,
      Number(limit) || 50,
      Number(offset) || 0,
    );

    return sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Messages fetched successfully",
      data,
    });
  });

  // Get chat messages
  static getChatMessages = catchAsync(
    async (req: CustomRequest, res: Response) => {
      const { id: userId } = req.user;
      const { chatId } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      const messages = await ChatService.getChatMessages(
        chatId,
        userId as any,
        Number(limit),
        Number(offset),
      );

      sendResponse(res, {
        statusCode: StatusCodes.OK,
        success: true,
        message: "Messages retrieved successfully",
        data: messages,
      });
    },
  );

  // Get user chats
  static getUserChats = catchAsync(
    async (req: CustomRequest, res: Response) => {
      const { id: userId } = req.user;

      const chats = await ChatService.getUserChats(userId as any);

      sendResponse(res, {
        statusCode: StatusCodes.OK,
        success: true,
        message: "Chats retrieved successfully",
        data: chats,
      });
    },
  );

  static getChatUsers = catchAsync(
    async (req: CustomRequest, res: Response) => {
      const currentUserId = req.user.id;

      const users = await ChatService.getChatUsers(currentUserId);

      sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Chat users fetched successfully",
        data: users,
      });
    },
  );

  // Update message (text only)
  static updateMessage = catchAsync(
    async (req: CustomRequest, res: Response) => {
      const { id: userId } = req.user;
      const { messageId } = req.params;
      const { content } = req.body;

      const message = await ChatService.updateMessage(
        messageId,
        userId as any,
        content,
      );

      sendResponse(res, {
        statusCode: StatusCodes.OK,
        success: true,
        message: "Message updated successfully",
        data: message,
      });
    },
  );

  // Delete message
  static deleteMessage = catchAsync(
    async (req: CustomRequest, res: Response) => {
      const { id: userId } = req.user;
      const { messageId } = req.params;

      await ChatService.deleteMessage(messageId, userId as any);

      sendResponse(res, {
        statusCode: StatusCodes.OK,
        success: true,
        message: "Message deleted successfully",
        data: { deletedCount: 1 },
      });
    },
  );

  // Delete conversation
  static deleteConversation = catchAsync(
    async (req: CustomRequest, res: Response) => {
      const userId = (req.user as any).userId as string;
      const { chatId } = req.params;

      await ChatService.deleteConversation(chatId, userId as any);

      sendResponse(res, {
        statusCode: StatusCodes.OK,
        success: true,
        message: "Conversation deleted successfully",
        data: null,
      });
    },
  );

  // Block user
  static blockUser = catchAsync(async (req: CustomRequest, res) => {
    const userId = (req.user as any).userId as string;
    const { blockedId } = req.body;

    await ChatService.blockUser(userId as any, blockedId);

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "User blocked successfully",
      data: null,
    });
  });

  // Unblock user
  static unblockUser = catchAsync(async (req: CustomRequest, res: Response) => {
    const userId = (req.user as any).userId as string;
    const { blockedId } = req.params;

    await ChatService.unblockUser(userId as any, new Types.ObjectId(blockedId));

    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "User unblocked successfully",
      data: null,
    });
  });

  // Get blocked users
  static getBlockedUsers = catchAsync(
    async (req: CustomRequest, res: Response) => {
      const userId = (req.user as any).userId as string;

      const blockedUsers = await ChatService.getBlockedUsers(userId as any);

      sendResponse(res, {
        statusCode: StatusCodes.OK,
        success: true,
        message: "Blocked users retrieved successfully",
        data: blockedUsers,
      });
    },
  );

  // Mark messages as read (can also be done via socket)
  static markMessagesAsRead = catchAsync(
    async (req: CustomRequest, res: Response) => {
      const userId = (req.user as any).userId as string;
      const { chatId } = req.params;

      await ChatService.markMessagesAsRead(chatId, userId as any);

      sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Messages marked as read",
        data: null,
      });
    },
  );
}
