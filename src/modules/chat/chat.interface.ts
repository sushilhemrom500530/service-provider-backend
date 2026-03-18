import { Document, Model, Types } from "mongoose";

// Message Types
export enum MessageType {
  TEXT = "text",
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  FILE = "file",
  MEDIA = "media",
}

// Message Status
export enum MessageStatus {
  SENT = "sent",
  DELIVERED = "delivered",
  READ = "read",
  DELETED = "deleted",
}

// Chat Type
export enum ChatType {
  PRIVATE = "private",
  GROUP = "group",
}

// Message Interface
export interface IMessage extends Document {
  _id: Types.ObjectId;
  chatId: Types.ObjectId;
  sender: Types.ObjectId;
  receiver: Types.ObjectId;
  content?: string;
  messageType: MessageType;
  mediaUrl?: string;
  mediaType?: string;
  mediaSize?: number;
  status: MessageStatus;
  readBy: Types.ObjectId[];
  deliveredTo: Types.ObjectId[];
  isEdited: boolean;
  editedAt?: Date;
  deletedBy: Types.ObjectId[];
  replyTo?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Chat Interface
export interface IChat extends Document {
  _id: Types.ObjectId;
  participants: Types.ObjectId[];
  chatType: ChatType;
  lastMessage?: Types.ObjectId;
  lastMessageAt?: Date;
  unreadCount: Map<string, number>;
  isActive: boolean;
  deletedBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

// Blocked User Interface
export interface IBlockedUser extends Document {
  _id: Types.ObjectId;
  blocker: Types.ObjectId;
  blocked: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Online User Interface
export interface IOnlineUser {
  userId: string;
  socketId: string;
  lastSeen: Date;
  isOnline: boolean;
}

// Chat Model Interface
export interface IChatModel extends Model<IChat> {
  findChatByParticipants(
    participant1: Types.ObjectId,
    participant2: Types.ObjectId,
  ): Promise<IChat | null>;
}

// Message Model Interface
export interface IMessageModel extends Model<IMessage> {
  getChatMessages(
    chatId: Types.ObjectId,
    limit?: number,
    offset?: number,
  ): Promise<IMessage[]>;
}

// Blocked User Model Interface
export interface IBlockedUserModel extends Model<IBlockedUser> {
  isBlocked(
    userId: Types.ObjectId,
    otherUserId: Types.ObjectId,
  ): Promise<boolean>;
}
