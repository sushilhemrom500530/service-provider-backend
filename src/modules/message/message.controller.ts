import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { MessageService } from './message.service';
import pick from '../../shared/pick';
import { Request, Response } from 'express';
import { IContent, IFileMetadata, IMessage, MessageType } from './message.interface';
import { MESSAGE_UPLOADS_FOLDER } from './message.constant';
import { Types } from 'mongoose';
import AppError from './../../errors/AppErro';

const sendMessage = catchAsync(async (req, res) => {
  const senderId = req?.user?.userId;
  if (!senderId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated.');
  }
  const { message, receiverId } = req.body;
  // Prepare message content
  const content: IContent = {
    messageType: MessageType.TEXT,
    text: message || '', // Ensure message is set or empty string
    fileUrls: [], // Initialize fileUrls as an empty array
    fileMetadata: [], // Initialize fileMetadata as an empty array
  };

  // Handle file uploads (supporting multiple files)
  if (Array.isArray(req.files) && req.files.length > 0) {
    for (const file of req.files) {
      const fileUrl = `/${MESSAGE_UPLOADS_FOLDER}/${file.filename}`;
      console.log("FILE URL", fileUrl);

      (content.fileUrls ??= []).push(fileUrl);

      // Extract file metadata
      const fileMetadata: IFileMetadata = {
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      };

      // Add duration for audio/video files if available
      // For now, we'll leave duration as undefined, but this could be extracted with ffmpeg
      (content.fileMetadata ??= []).push(fileMetadata);

      // Detect message type based on file type
      if (file.mimetype.startsWith('image/')) {
        content.messageType = MessageType.IMAGE;
      } else if (file.mimetype.startsWith('audio/')) {
        content.messageType = MessageType.AUDIO;
      } else if (file.mimetype.startsWith('video/')) {
        content.messageType = MessageType.VIDEO;
      } else if (file.mimetype === 'application/pdf') {
        content.messageType = MessageType.DOCUMENT;
      }
    }

    // If there are files but no text, clear the text field
    if (
      content &&
      content.fileUrls &&
      content.fileUrls.length > 0 &&
      !message
    ) {
      content.text = '';
    } else {
      content.messageType = MessageType.MIXED; // Supports both text and files
    }
  }
  // Construct the message payload
  const payload: Partial<IMessage> = {
    senderId: new Types.ObjectId(senderId),
    receiverId,
    content,
  };

  // Send message via the service
  const result = await MessageService.sendMessage(payload);

  // Send success response
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Message sent successfully',
    data: result,
  });
});

const getAllMessagesByReceiverId = catchAsync(
  async (req: Request, res: Response) => {
    const senderId = req?.user?.userId;
    if (!senderId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated.');
    }
    const { receiverId } = req.params;
    const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);
    const messages = await MessageService.getAllMessagesByReceiverId(
      { senderId, receiverId },
      options
    );
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Messages fetched successfully',
      data: messages,
    });
  }
);

const updateMessage = catchAsync(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const { message } = req.body;
  const result = await MessageService.updateMessage(messageId, message);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Message updated successfully',
    data: result,
  });
});

const deleteMessage = catchAsync(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const userId = req.user.userId;
  if (!userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated.');
  }
  const message = await MessageService.deleteMessage(userId, messageId);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Message deleted successfully',
    data: message,
  });
});

const markMessageSeen = catchAsync(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const userId = req.user.userId;
  if (!userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated.');
  }
  const message = await MessageService.markMessageSeen(messageId);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Message marked as seen',
    data: message,
  });
});

const viewAllMessages = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.user;
  if (!userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated.');
  }
  const { chatId } = req.params;

  const messages = await MessageService.viewAllMessages(chatId, userId);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Messages viewed successfully',
    data: messages,
  });
});

const unviewedMessagesCount = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.user;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated.');
    }
    const { chatId } = req.query;
    const count = await MessageService.unviewedMessagesCount(
      userId,
      chatId as string
    );
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Unviewed messages count fetched successfully',
      data: { count },
    });
  }
);

const addReaction = catchAsync(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const { emoji } = req.body;
  const userId = req?.user?.userId;
  if (!userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated.');
  }
  const message = await MessageService.addReaction(messageId, userId, emoji);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Reaction added successfully',
    data: message,
  });
});

const removeReaction = catchAsync(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const userId = req.user.userId;
  if (!userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated.');
  }
  const message = await MessageService.removeReaction(messageId, userId);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Reaction removed successfully',
    data: message,
  });
});

const replyToMessage = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.userId;
  if (!userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated.');
  }
  const { replyToId, chatId, receiverId, content } = req.body;

  // Handle file uploads if present in the request
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    // Process files to add metadata
    const fileUrls: string[] = [];
    const fileMetadata: IFileMetadata[] = [];

    for (const file of req.files) {
      const fileUrl = `/${MESSAGE_UPLOADS_FOLDER}/${file.filename}`;
      fileUrls.push(fileUrl);

      // Extract file metadata
      const metadata: IFileMetadata = {
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      };
      fileMetadata.push(metadata);
    }

    // Update content with file data
    content.fileUrls = fileUrls;
    content.fileMetadata = fileMetadata;
  }
  // const message = await MessageService.replyToMessage(
  //   {
  //     chatId: new Types.ObjectId(chatId),
  //     senderId: new Types.ObjectId(userId),
  //     receiverId: new Types.ObjectId(receiverId),
  //     content,
  //   } as IMessage,
  //   replyToId
  // );
  const messagePayload: Partial<IMessage> = {
    // chatId: new Types.ObjectId(chatId),
    senderId: new Types.ObjectId(userId),
    receiverId: new Types.ObjectId(receiverId),
    content,
  };

  const message = await MessageService.replyToMessage(messagePayload, replyToId);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Reply sent successfully',
    data: message,
  });
});

const forwardMessage = catchAsync(async (req: Request, res: Response) => {
  const { messageId } = req.params;
  const { chatIds } = req.body;
  const userId = req.user.userId;
  if (!userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated.');
  }
  const messages = await MessageService.forwardMessage(
    messageId,
    userId,
    chatIds
  );
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Message forwarded successfully',
    data: messages,
  });
});

const pinMessage = catchAsync(async (req: Request, res: Response) => {
  const { messageId, chatId } = req.params;
  const message = await MessageService.pinMessage(messageId, chatId);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Message pinned successfully',
    data: message,
  });
});

const unpinMessage = catchAsync(async (req: Request, res: Response) => {
  const { messageId, chatId } = req.params;
  const message = await MessageService.unpinMessage(messageId, chatId);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Message unpinned successfully',
    data: message,
  });
});

const searchMessages = catchAsync(async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const { searchTerm } = req.query;
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);
  const messages = await MessageService.searchMessages(
    chatId,
    searchTerm as string,
    options
  );
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Messages searched successfully',
    data: messages,
  });
});

const sendTypingIndicator = catchAsync(async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated.');
  }
  await MessageService.sendTypingIndicator(chatId, userId);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Typing indicator sent',
    data: {},
  });
});

const stopTypingIndicator = catchAsync(async (req: Request, res: Response) => {
  const { chatId } = req.params;
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated.');
  }
  await MessageService.stopTypingIndicator(chatId, userId);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Typing indicator stopped',
    data: {},
  });
});

export const MessageController = {
  sendMessage,
  getAllMessagesByReceiverId,
  updateMessage,
  deleteMessage,
  markMessageSeen,
  viewAllMessages,
  unviewedMessagesCount,
  addReaction,
  removeReaction,
  replyToMessage,
  forwardMessage,
  pinMessage,
  unpinMessage,
  searchMessages,
  sendTypingIndicator,
  stopTypingIndicator,
};
