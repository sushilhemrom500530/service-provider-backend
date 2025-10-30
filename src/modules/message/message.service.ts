import { StatusCodes } from 'http-status-codes';
import Chat from '../chat/chat.model';
import { IMessage } from './message.interface';
import Message from './message.model';
import { User } from '../user/user.model';
import { Types } from 'mongoose';
import { ChatService } from '../chat/chat.service';
import { IPaginationOptions, IPaginationResult } from '../../types/pagination';
import AppError from '../../errors/AppErro';

// View all messages by receiver ID (aligned with GET /:receiverId)
const getAllMessagesByReceiverId = async (
  filter: Record<string, any>,
  options: IPaginationOptions
): Promise<IPaginationResult<IMessage>> => {
  const query = {
    $or: [
      { senderId: filter.senderId, receiverId: filter.receiverId },
      { senderId: filter.receiverId, receiverId: filter.senderId },
    ],
    isDeleted: false,
  };

  // Update messages to mark them as seen by the receiver
  await Message.updateMany(
    {
      $or: [
        {
          senderId: new Types.ObjectId(filter.receiverId),
          receiverId: new Types.ObjectId(filter.senderId),
        },
      ],
      seenBy: { $nin: [new Types.ObjectId(filter.senderId)] },
      deliveryStatus: { $ne: 'seen' },
    },
    {
      $addToSet: { seenBy: new Types.ObjectId(filter?.senderId) },
      deliveryStatus: 'seen',
    }
  );
  options.populate = [
    {
      path: 'receiverId',
      select: 'profile email',
      populate: {
        path: 'profile',
        select: 'fullName profileImage',
      },
    },
    {
      path: 'replyTo',
      select: 'content senderId',
    },
    {
      path: 'forwardedFrom',
      select: 'content senderId',
    },
  ];
  options.sortBy = options.sortBy || 'createdAt';
  const result = await Message.paginate(query, options);
  return result;
};

// View all messages in a chat
const viewAllMessages = async (chatId: string, receiverId: string) => {
  const result = await Message.updateMany(
    {
      chatId: new Types.ObjectId(chatId),
      receiverId: new Types.ObjectId(receiverId),
      deliveryStatus: 'sent',
      isDeleted: false,
    },
    { seenBy: [receiverId], deliveryStatus: 'seen' },
    { new: true }
  );

  return result;
};

// Count unviewed messages
const unviewedMessagesCount = async (
  userId: string,
  chatId?: string
): Promise<number> => {
  const query: Record<string, any> = {
    chatId: new Types.ObjectId(chatId),
    receiverId: new Types.ObjectId(userId),
    isDeleted: false,
    seenBy: { $nin: [userId] },
  };

  return Message.countDocuments(query);
};

// Send a message
const sendMessage = async (payload: Partial<IMessage>) => {
  if (!payload?.senderId || !payload?.receiverId || !payload?.content) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Missing required fields');
  }
  let chatId: string = '';
  // Check if an existing chat exists
  const existingChat = await ChatService.checkSenderIdExistInChat(
    payload?.senderId.toString(),
    payload?.receiverId.toString()
  );
  if (existingChat) {
    chatId = existingChat._id;
  } else {
    // Create a new chat if none exists
    const newChat = await ChatService.createSingleChat(
      payload.senderId.toString(),
      payload.receiverId.toString()
    );
    if (!newChat) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Chat Not Found');
    }
    chatId = newChat._id as string;
  }

  // Set chatId in payload
  payload.chatId = new Types.ObjectId(chatId);
  const newMessage = await Message.create(payload);

  // Update last message in chat
  const chat = await Chat.findById(payload.chatId);
  if (chat) {
    chat.lastMessage = newMessage?.id;
    chat.updatedAt = newMessage?.createdAt;
    await chat.save();
  }

  // Update message with populated data
  const message = await Message.findById(newMessage.id)
    .populate('senderId', 'profile.email profile.fullName profile.profileImage')
    .populate(
      'receiverId',
      'profile.email profile.fullName profile.profileImage'
    )

  // Emit socket event to notify both sender and receiver about the new message
  if (global.io) {
    // Prepare message data for emission
    const messageToEmit = {
      _id: message?._id,
      chatId: message?.chatId,
      senderId: message?.senderId,
      receiverId: message?.receiverId,
      content: message?.content,
      createdAt: message?.createdAt,
      deliveryStatus: message?.deliveryStatus,
      seenBy: message?.seenBy,
      reactions: message?.reactions,
    };

    // Emit to sender's personal room
    global.io.to(payload.senderId.toString()).emit('new-message-received', {
      ...messageToEmit,
      chatId: chatId,
    });

    // Emit to receiver's personal room
    global.io.to(payload.receiverId.toString()).emit('new-message-received', {
      ...messageToEmit,
      chatId: chatId,
    });

    // Update conversation list for both parties
    const conversationUpdateData = {
      lastMessage: messageToEmit,
      chatId: chatId,
      timestamp: new Date(),
    };

    global.io
      .to(payload.senderId.toString())
      .emit(
        `conversation-list-updated::${payload.senderId}`,
        conversationUpdateData
      );
    global.io
      .to(payload.receiverId.toString())
      .emit(
        `conversation-list-updated::${payload.receiverId}`,
        conversationUpdateData
      );
  }

  return message;
};

// Update message
const updateMessage = async (
  messageId: string,
  text: string
): Promise<IMessage | null> => {
  const message = await Message.findOne({
    _id: messageId,
    isDeleted: false,
  });
  if (!message) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  // Add to edit history before updating
  if (!message.editHistory) {
    message.editHistory = [];
  }
  message.editHistory.push({
    originalContent: message.content.text || '',
    editedAt: new Date(),
    editedBy: message.senderId,
  });

  message.content.text = text;
  await message.save();

  // Emit socket event to notify about message update
  if (global.io) {
    // Emit to both sender and receiver
    global.io.to(message.senderId.toString()).emit('message:updated', {
      message,
    });
    global.io.to(message.receiverId.toString()).emit('message:updated', {
      message,
    });
  }

  return message;
};

// Delete message
const deleteMessage = async (
  userId: string,
  messageId: string
): Promise<IMessage | null> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
  }
  const message = await Message.findById(messageId);
  if (!message) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Message not found');
  }
  if (message.senderId.toString() !== userId) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not allowed to delete this message'
    );
  }

  // Add to deletedBy array instead of hard delete for conversation history
  const deletedByEntry = {
    userId: new Types.ObjectId(userId),
    deletedAt: new Date(),
    deleteType: 'soft' as const, // Only soft delete for now
  };

  message.deletedBy = message.deletedBy || [];
  message.deletedBy.push(deletedByEntry);
  message.isDeleted = true;
  await message.save();

  // Emit socket event to notify about message deletion
  if (global.io) {
    // Emit to both sender and receiver
    global.io.to(message.senderId.toString()).emit('message:deleted', {
      messageId,
      userId,
    });
    global.io.to(message.receiverId.toString()).emit('message:deleted', {
      messageId,
      userId,
    });
  }

  return message;
};

// Mark message as seen
const markMessageSeen = async (messageId: string): Promise<IMessage | null> => {
  const message = await Message.findOne({
    _id: messageId,
    isDeleted: false,
  });

  if (message) {
    message.deliveryStatus = 'seen';

    // Add to seenBy array if not already seen by this user
    if (!message.seenBy) {
      message.seenBy = [];
    }

    const alreadySeen = message.seenBy.some(
      (seen: any) => seen.userId.toString() === message.receiverId.toString()
    );

    if (!alreadySeen) {
      message.seenBy.push({
        userId: message.receiverId,
        seenAt: new Date(),
      });
    }

    await message.save();

    // Emit socket event to notify sender that message was seen
    if (global.io) {
      global.io.to(message.senderId.toString()).emit('message:seen', {
        messageId: message._id,
        userId: message.receiverId,
      });
    }
  }

  return message;
};

// Update delivery status
const updateDeliveryStatus = async (
  messageId: string,
  status: 'delivered' | 'seen'
): Promise<IMessage | null> => {
  const message = await Message.findByIdAndUpdate(
    messageId,
    { deliveryStatus: status },
    { new: true }
  );

  // Emit socket event to update delivery status
  if (global.io && message) {
    global.io.to(message.senderId.toString()).emit('message:delivery:status', {
      messageId: message._id,
      status: message.deliveryStatus,
    });
  }

  return message;
};

// Add reaction
const addReaction = async (
  messageId: string,
  userId: string,
  emoji: string
): Promise<IMessage | null> => {
  const message = await Message.findByIdAndUpdate(
    messageId,
    {
      $push: {
        reactions: {
          userId: new Types.ObjectId(userId),
          emoji,
          reactedAt: new Date(),
        },
      },
    },
    { new: true }
  );

  // Emit socket event to notify about reaction
  if (global.io && message) {
    // Emit to both sender and receiver
    global.io.to(message.senderId.toString()).emit('message:reaction', {
      messageId: message._id,
      userId,
      emoji,
    });
    global.io.to(message.receiverId.toString()).emit('message:reaction', {
      messageId: message._id,
      userId,
      emoji,
    });
  }

  return message;
};

// Remove reaction
const removeReaction = async (
  messageId: string,
  userId: string
): Promise<IMessage | null> => {
  const message = await Message.findByIdAndUpdate(
    messageId,
    {
      $pull: {
        reactions: { userId: new Types.ObjectId(userId) },
      },
    },
    { new: true }
  );

  // Emit socket event to notify about reaction removal
  if (global.io && message) {
    // Emit to both sender and receiver
    global.io.to(message.senderId.toString()).emit('message:reaction:removed', {
      messageId: message._id,
      userId,
    });
    global.io
      .to(message.receiverId.toString())
      .emit('message:reaction:removed', {
        messageId: message._id,
        userId,
      });
  }

  return message;
};

// Reply to a message
const replyToMessage = async (
  payload: IMessage,
  replyToId: string
): Promise<IMessage> => {
  const replyToMessage = await Message.findById(replyToId);
  if (!replyToMessage) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Message to reply to not found');
  }
  const newMessage = await Message.create({
    ...payload,
    replyTo: new Types.ObjectId(replyToId),
    deliveryStatus: 'sent',
  });

  if (payload.chatId) {
    const chat = await Chat.findById(payload.chatId);
    if (chat) {
      chat.lastMessage = new Types.ObjectId(newMessage._id);
      chat.updatedAt = newMessage.createdAt;
      await chat.save();
    }
  }

  // Emit socket event to notify about reply
  if (global.io) {
    // Emit to both sender and receiver
    global.io.to(payload.senderId.toString()).emit('message:replied', {
      message: newMessage,
    });
    global.io.to(payload.receiverId.toString()).emit('message:replied', {
      message: newMessage,
    });
  }

  return newMessage;
};

// Forward a message
const forwardMessage = async (
  messageId: string,
  senderId: string,
  chatIds: string[]
): Promise<IMessage[]> => {
  const originalMessage = await Message.findById(messageId);
  if (!originalMessage) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  const forwardedMessages: IMessage[] = [];
  for (const chatId of chatIds) {
    const newMessage = await Message.create({
      chatId: new Types.ObjectId(chatId),
      senderId: new Types.ObjectId(senderId),
      receiverId: originalMessage.receiverId,
      content: originalMessage.content,
      forwardedFrom: new Types.ObjectId(messageId),
      deliveryStatus: 'sent',
    });

    const chat = await Chat.findById(chatId);
    if (chat) {
      chat.lastMessage = new Types.ObjectId(newMessage._id);
      chat.updatedAt = newMessage.createdAt;
      await chat.save();
    }

    forwardedMessages.push(newMessage);
  }

  // Emit socket event to notify about forwarding
  if (global.io) {
    for (const chatId of chatIds) {
      global.io.to(chatId).emit('message:forwarded', {
        messages: forwardedMessages,
        forwardedBy: senderId,
      });
    }
  }

  return forwardedMessages;
};

// Pin a message
const pinMessage = async (
  messageId: string,
  chatId: string
): Promise<IMessage | null> => {
  const message = await Message.findByIdAndUpdate(
    messageId,
    { isPinned: true },
    { new: true }
  );

  if (message) {
    await Chat.findByIdAndUpdate(chatId, {
      $addToSet: { pinnedMessages: new Types.ObjectId(messageId) },
    });

    // Emit socket event about pinned message
    if (global.io) {
      global.io.to(chatId).emit('message:pinned', {
        messageId,
        chatId,
      });
    }
  }

  return message;
};

// Unpin a message
const unpinMessage = async (
  messageId: string,
  chatId: string
): Promise<IMessage | null> => {
  const message = await Message.findByIdAndUpdate(
    messageId,
    { isPinned: false },
    { new: true }
  );

  if (message) {
    await Chat.findByIdAndUpdate(chatId, {
      $pull: { pinnedMessages: new Types.ObjectId(messageId) },
    });

    // Emit socket event about unpinned message
    if (global.io) {
      global.io.to(chatId).emit('message:unpinned', {
        messageId,
        chatId,
      });
    }
  }

  return message;
};

// Search messages
const searchMessages = async (
  chatId: string,
  searchTerm: string,
  options: IPaginationOptions
): Promise<IPaginationResult<IMessage>> => {
  const query = {
    chatId: new Types.ObjectId(chatId),
    isDeleted: false,
    'content.text': { $regex: searchTerm, $options: 'i' },
  };

  options.populate = [
    {
      path: 'senderId',
      select: 'firstName lastName profileImage email',
    },
    {
      path: 'receiverId',
      select: 'firstName lastName profileImage email',
    },
  ];
  options.sortBy = options.sortBy || 'createdAt';
  return Message.paginate(query, options);
};

// Typing indicator
const sendTypingIndicator = async (chatId: string, userId: string) => {
  // Emit socket event for typing indicator
  if (global.io) {
    global.io.to(chatId).emit('typing:start', {
      userId,
      chatId,
    });
  }
};

// Stop typing indicator
const stopTypingIndicator = async (chatId: string, userId: string) => {
  // Emit socket event for stopping typing indicator
  if (global.io) {
    global.io.to(chatId).emit('typing:stop', {
      userId,
      chatId,
    });
  }
};

export const MessageService = {
  getAllMessagesByReceiverId,
  viewAllMessages,
  unviewedMessagesCount,
  sendMessage,
  updateMessage,
  deleteMessage,
  markMessageSeen,
  updateDeliveryStatus,
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
