import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Chat, Message, BlockedUser } from './chat.model';
import {
  IChat,
  IMessage,
  MessageType,
  MessageStatus,
  ChatType,
} from './chat.interface';
import { CHAT_UPLOADS_FOLDER } from './chat.constant';
import { User } from './../user/user.model';
import AppError from './../../errors/AppErro';

dayjs.extend(relativeTime);

export class ChatService {
  // Check if users are blocked
  private static async checkIfBlocked(
    userId: Types.ObjectId,
    otherUserId: Types.ObjectId,
  ): Promise<void> {
    const isBlocked = await BlockedUser.isBlocked(userId, otherUserId);
    if (isBlocked) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Cannot send message. One of the users has blocked the other.',
      );
    }
  }

  // Core send message
  static async sendMessageIntoUser(data: {
    senderId: string;
    receiverId: string;
    content?: string;
    files?: any;
    replyTo?: string;
  }) {
    const { senderId, receiverId, content, files, replyTo } = data;
    const senderObj = new Types.ObjectId(senderId);
    const receiverObj = new Types.ObjectId(receiverId);

    // Check block
    await this.checkIfBlocked(senderObj, receiverObj);

    // 1. Find or create chat
    let chat = await Chat.findOne({
      participants: { $all: [senderObj, receiverObj] },
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [senderObj, receiverObj],
        chatType: ChatType.PRIVATE,
      });
    }

    // 2. Prepare message fields
    const messagePayload: any = {
      chatId: chat._id,
      sender: senderObj,
      content: content || '',
      replyTo: replyTo ? new Types.ObjectId(replyTo) : null,
      messageType: MessageType.TEXT,
    };

    // 3. Handle files (optional)
    if (files) {
      // Only one file type is expected per request
      if (files.image) {
        messagePayload.mediaUrl = files.image[0].path;
        messagePayload.mediaType = 'image';
        messagePayload.messageType = MessageType.IMAGE;
      }

      if (files.video) {
        messagePayload.mediaUrl = files.video[0].path;
        messagePayload.mediaType = 'video';
        messagePayload.messageType = MessageType.VIDEO;
      }

      if (files.audio) {
        messagePayload.mediaUrl = files.audio[0].path;
        messagePayload.mediaType = 'audio';
        messagePayload.messageType = MessageType.AUDIO;
      }

      if (files.file) {
        messagePayload.mediaUrl = files.file[0].path;
        messagePayload.mediaType = 'file';
        messagePayload.messageType = MessageType.FILE;
      }

      if (files.file || files.image || files.video || files.audio) {
        messagePayload.mediaSize =
          (files.file?.[0].size ||
            files.image?.[0].size ||
            files.video?.[0].size ||
            files.audio?.[0].size) ??
          0;
      }
    }

    // 4. Create message
    const message = await Message.create(messagePayload);

    // 5. Update chat last message
    chat.lastMessage = message._id;
    chat.lastMessageAt = new Date();
    await chat.save();

    // 6. Emit socket message
    // const io = getIO();

    // // Emit to both sender and receiver
    // io.to(`user::${senderId}`).emit("newMessage", message);
    // io.to(`user::${receiverId}`).emit("newMessage", message);

    return message.populate('sender', 'name profileUrl email');
  }

  // Validate media file
  private static validateMediaFile(
    messageType: MessageType,
    mediaFile?: Express.Multer.File,
  ): void {
    const mediaTypes = [
      MessageType.IMAGE,
      MessageType.VIDEO,
      MessageType.AUDIO,
    ];

    if (mediaTypes.includes(messageType) && !mediaFile) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `${messageType} message must have media file`,
      );
    }
  }
  static async getUserMessages(
    currentUserId: string,
    otherUserId: string,
    limit: number = 50,
    offset: number = 0,
  ) {
    const user1 = new Types.ObjectId(currentUserId);
    const user2 = new Types.ObjectId(otherUserId);
    console.log('user1', user1);
    console.log('user2', user2);
    // 1. Check if blocked
    await this.checkIfBlocked(user1, user2);

    // 2. Find chat
    // const chat = await Chat.findOne({
    //   participants: { $all: [user1, user2] },
    // });

    // if (!chat) {
    //   throw new AppError(StatusCodes.NOT_FOUND, "Chat not found");
    // }

    // 3. Get messages excluding deleted ones
    // const messages = await Message.find({
    //   chatId: chat._id,
    //   deletedBy: { $ne: user1 }, // <--- key fix
    // });

    const messages = await Message.find({
      $or: [
        { sender: user1, receiver: user2 },
        { sender: user2, receiver: user1 },
      ],
    })
      .populate('sender', 'name profileUrl email phoneNumber')
      .populate('receiver', 'name profileUrl email phoneNumber')
      .populate('replyTo')
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);

    return messages;
  }

  // Get or create chat between two users
  static async getOrCreateChat(
    userId: Types.ObjectId,
    receiverId: Types.ObjectId,
  ): Promise<IChat> {
    // Check if users are blocked
    await this.checkIfBlocked(userId, receiverId);

    // Check if both users exist
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Receiver not found');
    }

    // Find existing chat
    let chat = await Chat.findChatByParticipants(userId, receiverId);

    // Create new chat if doesn't exist
    if (!chat) {
      chat = await Chat.create({
        participants: [userId, receiverId],
        chatType: ChatType.PRIVATE,
        unreadCount: {
          [userId.toString()]: 0,
          [receiverId.toString()]: 0,
        },
      });
    }

    return chat;
  }

  // Send message (handles both text and media)
  static async sendMessage(
    senderId: Types.ObjectId,
    receiverId: Types.ObjectId,
    content?: string,
    messageType: MessageType = MessageType.TEXT,
    mediaFile?: Express.Multer.File,
    replyToId?: string,
  ): Promise<IMessage> {
    // Get or create chat
    const chat = await this.getOrCreateChat(senderId, receiverId);

    // Validate message content
    if (messageType === MessageType.TEXT && !content) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Text message must have content',
      );
    }

    // Validate media file
    this.validateMediaFile(messageType, mediaFile);

    let mediaUrl: string | undefined;
    let mediaSize: number | undefined;
    let mediaType: string | undefined;

    // Upload media file to S3 if exists
    // if (mediaFile) {
    //   try {
    //     mediaUrl = await uploadSingleFileToS3(mediaFile, CHAT_UPLOADS_FOLDER);
    //     mediaSize = mediaFile.size;
    //     mediaType = mediaFile.mimetype;
    //   } catch (error) {
    //     throw new AppError(
    //       StatusCodes.INTERNAL_SERVER_ERROR,
    //       "Failed to upload media file"
    //     );
    //   }
    // }
    // Validate reply message if exists
    if (replyToId) {
      const replyMessage = await Message.findById(replyToId);
      console.log('replyMessage', replyMessage);
      if (
        !replyMessage ||
        replyMessage.chatId.toString() !== chat._id.toString()
      ) {
        throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid reply message');
      }
    }

    // Create message
    const message = await Message.create({
      chatId: chat._id,
      sender: senderId,
      receiver: receiverId,
      content,
      messageType,
      mediaUrl,
      mediaType,
      mediaSize,
      status: MessageStatus.SENT,
      replyTo: replyToId ? new Types.ObjectId(replyToId) : undefined,
    });

    // Update chat's last message and increment unread count
    await Chat.findByIdAndUpdate(chat._id, {
      lastMessage: message._id,
      lastMessageAt: new Date(),
      $inc: {
        [`unreadCount.${receiverId.toString()}`]: 1,
      },
    });

    // Populate sender and reply info
    await message.populate('sender', 'fullName email profileUrl');
    await message.populate('receiver', 'fullName email profileUrl');
    if (replyToId) {
      await message.populate({
        path: 'replyTo',
        populate: {
          path: 'sender',
          select: 'fullName email profileUrl',
        },
        populate: {
          path: 'receiver',
          select: 'fullName email profileUrl',
        },
      });
    }

    return message;
  }

  // Update message (text only)
  static async updateMessage(
    messageId: string,
    userId: Types.ObjectId,
    newContent: string,
  ): Promise<IMessage> {
    const message = await Message.findById(messageId);

    if (!message) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Message not found');
    }

    // Check if user is the sender
    if (message.sender.toString() !== userId.toString()) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'You can only edit your own messages',
      );
    }

    // Only text messages can be edited
    if (message.messageType !== MessageType.TEXT) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Only text messages can be edited',
      );
    }

    // Update message
    message.content = newContent;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    await message.populate('sender', 'name email profileImage');

    return message;
  }

  // Delete message (soft delete for user)
  static async deleteMessage(
    messageId: string,
    userId: Types.ObjectId,
    deleteForEveryone: boolean = false,
  ): Promise<void> {
    const message = await Message.findById(messageId);
    if (!message)
      throw new AppError(StatusCodes.NOT_FOUND, 'Message not found');

    const userIdStr = userId.toString();

    // If delete for everyone, only sender can do it
    if (deleteForEveryone && message.sender.toString() !== userIdStr) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'Only sender can delete this message for everyone',
      );
    }

    // Mark message deleted for current user
    if (!message.deletedBy.map(id => id.toString()).includes(userIdStr)) {
      message.deletedBy.push(userId);
      await message.save();
    }

    const chat = await Chat.findById(message.chatId);
    if (!chat) return;

    const participantIds = chat.participants.map(p => p.toString());
    const deletedByIds = message.deletedBy.map(d => d.toString());

    // Check if message should be permanently deleted
    const allDeleted = participantIds.every(pid => deletedByIds.includes(pid));

    // if (allDeleted || deleteForEveryone) {
    //   // Delete media from S3 if exists
    //   if (message.mediaUrl) {
    //     try {
    //       await deleteFileFromS3(message.mediaUrl);
    //     } catch (error) {
    //       console.error("Failed to delete media from S3:", error);
    //     }
    //   }

    //   // Delete the message from DB
    //   await Message.findByIdAndDelete(messageId);
    // }

    // Update chat.lastMessage if needed
    if (chat.lastMessage?.toString() === messageId.toString()) {
      const newLastMessage = await Message.findOne({ chatId: chat._id }).sort({
        createdAt: -1,
      });

      chat.lastMessage = newLastMessage ? newLastMessage._id : undefined;
      chat.lastMessageAt = newLastMessage
        ? newLastMessage.createdAt
        : chat.createdAt;

      await chat.save();
    }
  }

  // Get chat messages - FIXED VERSION
  static async getChatMessages(
    chatId: string,
    userId: Types.ObjectId,
    limit: number = 50,
    offset: number = 0,
  ): Promise<IMessage[]> {
    // Validate chatId format
    if (!Types.ObjectId.isValid(chatId)) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid chat ID format');
    }

    // Convert string chatId to ObjectId
    const chatObjectId = new Types.ObjectId(chatId);

    const chat = await Chat.findById(chatObjectId);

    if (!chat) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Chat not found');
    }

    // console.log("current user Id", userId);
    // console.log("chat participants user Id", chat.participants);

    // Check if user is participant
    if (!chat.participants.some(p => p.equals(userId))) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'You are not a participant of this chat',
      );
    }

    // Get messages that are not deleted by this user
    const messages = await Message.find({
      chatId: chatObjectId, // Use ObjectId here, not string
      deletedBy: { $ne: userId },
    })
      .populate('sender', 'name email profileUrl')
      .populate('receiver', 'name email profileUrl')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'sender',
          select: 'name email profileUrl',
        },
      })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);

    return messages;
  }
  // Get all chats for a user
  static async getUserChats(userId: Types.ObjectId): Promise<IChat[]> {
    const chats = await Chat.find({
      participants: userId,
      deletedBy: { $ne: userId },
      isActive: true,
    })
      .populate('participants', ' name email profileUrl')
      .populate({
        path: 'lastMessage',
        populate: {
          path: 'sender',
          select: ' name email profileUrl',
        },
      })
      .sort({ lastMessageAt: -1 });

    return chats;
  }

  static async getChatUsers(currentUserId: string) {
    const currentObjId = new Types.ObjectId(currentUserId);

    const chats = await Chat.find({
      participants: currentObjId,
    })
      .populate({
        path: 'participants',
        select: 'fullName email role profileUrl',
      })
      .populate({
        path: 'lastMessage',
        select: '_id content createdAt sender',
        populate: {
          path: 'sender',
          select: 'fullName email role profileUrl',
        },
      })
      .sort({ lastMessageAt: -1 });

    const results = await Promise.all(
      chats.map(async chat => {
        const otherUser = chat.participants.find(
          (u: any) => u._id.toString() !== currentUserId,
        );

        // Count unread messages for this chat
        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          sender: { $ne: currentObjId }, // message from other user
          readBy: { $ne: currentObjId }, // current user has NOT read
        });

        const lastMessageTime = chat.lastMessageAt
          ? dayjs(chat.lastMessageAt).fromNow()
          : null;

        return {
          chatId: chat._id,
          otherUser,
          lastMessage: chat.lastMessage,
          unreadCount,
          lastMessageAt: chat.lastMessageAt,
          lastMessageTime, // 2 mins ago, 1 hour ago, etc.
        };
      }),
    );

    return results;
  }

  // Delete conversation (soft delete)
  static async deleteConversation(
    chatId: string,
    userId: Types.ObjectId,
  ): Promise<void> {
    const chat = await Chat.findById(chatId);

    if (!chat) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Chat not found');
    }

    // Check if user is participant
    if (!chat.participants.some(p => p.toString() === userId.toString())) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'You are not a participant of this chat',
      );
    }

    // Add user to deletedBy array
    if (!chat.deletedBy.includes(userId)) {
      chat.deletedBy.push(userId);
      await chat.save();
    }

    // If both participants deleted, mark as inactive
    const allDeleted = chat.participants.every(p =>
      chat.deletedBy.some(d => d.toString() === p.toString()),
    );

    if (allDeleted) {
      chat.isActive = false;
      await chat.save();
    }
  }

  // Mark messages as read
  static async markMessagesAsRead(
    chatId: string,
    userId: Types.ObjectId,
  ): Promise<void> {
    const chat = await Chat.findById(chatId);

    if (!chat) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Chat not found');
    }

    // Check if user is participant
    if (!chat.participants.some(p => p.toString() === userId.toString())) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        'You are not a participant of this chat',
      );
    }

    // Update all unread messages
    await Message.updateMany(
      {
        chatId: new Types.ObjectId(chatId),
        sender: { $ne: userId },
        readBy: { $ne: userId },
      },
      {
        $addToSet: { readBy: userId },
        status: MessageStatus.READ,
      },
    );

    // Reset unread count for this user
    await Chat.findByIdAndUpdate(chatId, {
      [`unreadCount.${userId.toString()}`]: 0,
    });
  }

  // Mark message as delivered
  static async markMessageAsDelivered(
    messageId: string,
    userId: Types.ObjectId,
  ): Promise<void> {
    await Message.findByIdAndUpdate(messageId, {
      $addToSet: { deliveredTo: userId },
      status: MessageStatus.DELIVERED,
    });
  }

  // Block user
  static async blockUser(
    blockerId: Types.ObjectId,
    blockedId: Types.ObjectId,
  ): Promise<void> {
    if (blockerId.toString() === blockedId.toString()) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'You cannot block yourself');
    }

    const blockedUser = await User.findById(blockedId);
    if (!blockedUser) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
    }

    const existingBlock = await BlockedUser.findOne({
      blocker: blockerId,
      blocked: blockedId,
    });

    if (existingBlock) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'User already blocked');
    }

    await BlockedUser.create({
      blocker: blockerId,
      blocked: blockedId,
    });
  }

  // Unblock user
  static async unblockUser(
    blockerId: Types.ObjectId,
    blockedId: Types.ObjectId,
  ): Promise<void> {
    const result = await BlockedUser.findOneAndDelete({
      blocker: blockerId,
      blocked: blockedId,
    });

    if (!result) {
      throw new AppError(StatusCodes.NOT_FOUND, 'User is not blocked');
    }
  }

  // Get blocked users
  static async getBlockedUsers(userId: Types.ObjectId) {
    const blockedUsers = await BlockedUser.find({ blocker: userId }).populate(
      'blocked',
      'name email profileUrl',
    );

    return blockedUsers;
  }
}
