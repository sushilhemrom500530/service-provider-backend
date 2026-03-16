import { model, Schema, Types } from 'mongoose';
import {
  IChat,
  IMessage,
  IBlockedUser,
  IChatModel,
  IMessageModel,
  IBlockedUserModel,
  MessageType,
  MessageStatus,
  ChatType,
} from './chat.interface';

// Message Schema
const messageSchema = new Schema<IMessage, IMessageModel>(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      trim: true,
    },
    messageType: {
      type: String,
      enum: Object.values(MessageType),
      required: true,
      default: MessageType.TEXT,
    },
    mediaUrl: {
      type: String,
    },
    mediaType: {
      type: String,
    },
    mediaSize: {
      type: Number,
    },
    status: {
      type: String,
      enum: Object.values(MessageStatus),
      default: MessageStatus.SENT,
    },
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    deliveredTo: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    deletedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
  },
  {
    timestamps: true,
    collection: 'messages',
    versionKey: false,
  },
);

// Message Indexes
messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });

// Message Static Methods
messageSchema.statics.getChatMessages = async function (
  chatId: Types.ObjectId,
  limit: number = 50,
  offset: number = 0,
): Promise<IMessage[]> {
  return await this.find({ chatId })
    .populate('sender', 'name email profileImage')
    .populate('replyTo')
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);
};

// Chat Schema
const chatSchema = new Schema<IChat, IChatModel>(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    chatType: {
      type: String,
      enum: Object.values(ChatType),
      default: ChatType.PRIVATE,
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
    lastMessageAt: {
      type: Date,
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    deletedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
    collection: 'chats',
    versionKey: false,
  },
);

// Chat Indexes
chatSchema.index({ participants: 1 });
chatSchema.index({ lastMessageAt: -1 });

// Chat Static Methods
chatSchema.statics.findChatByParticipants = async function (
  participant1: Types.ObjectId,
  participant2: Types.ObjectId,
): Promise<IChat | null> {
  return await this.findOne({
    chatType: ChatType.PRIVATE,
    participants: { $all: [participant1, participant2], $size: 2 },
  });
};

// Blocked User Schema
const blockedUserSchema = new Schema<IBlockedUser, IBlockedUserModel>(
  {
    blocker: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    blocked: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'blockedUsers',
    versionKey: false,
  },
);

// Blocked User Indexes
blockedUserSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

// Blocked User Static Methods
blockedUserSchema.statics.isBlocked = async function (
  userId: Types.ObjectId,
  otherUserId: Types.ObjectId,
): Promise<boolean> {
  const block = await this.findOne({
    $or: [
      { blocker: userId, blocked: otherUserId },
      { blocker: otherUserId, blocked: userId },
    ],
  });
  return !!block;
};

// Export Models
export const Message = model<IMessage, IMessageModel>('Message', messageSchema);

export const Chat = model<IChat, IChatModel>('Chat', chatSchema);

export const BlockedUser = model<IBlockedUser, IBlockedUserModel>(
  'BlockedUser',
  blockedUserSchema,
);
