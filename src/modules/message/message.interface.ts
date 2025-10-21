import { Model, Types } from 'mongoose';
import { IPaginationOptions, IPaginationResult } from '../../types/pagination';
export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  DOCUMENT = 'document',
  MIXED = 'mixed',
  STORYMESSAGE = 'storyMessage', // For story messages
}

export interface IFileMetadata {
  originalName?: string;
  size?: number;
  mimeType?: string;
  duration?: number;
}

export interface IContent {
  messageType: MessageType;
  text?: string;
  fileUrls?: string[];
  thumbnails?: string[];
  fileMetadata?: IFileMetadata[];
}

export interface ISeenBy {
  userId: Types.ObjectId;
  seenAt: Date;
}

export interface IDeliveredTo {
  userId: Types.ObjectId;
  deliveredAt: Date;
}

export interface IReaction {
  userId: Types.ObjectId;
  emoji: string;
  reactedAt: Date;
}

export interface IDeletedBy {
  userId: Types.ObjectId;
  deletedAt: Date;
  deleteType: 'soft' | 'hard';
}

export interface IUnsentBy {
  userId: Types.ObjectId;
  unsentAt: Date;
}

export interface IEditHistory {
  originalContent: string;
  editedAt: Date;
  editedBy: Types.ObjectId;
}

export interface IMessage {
  _id?: string;
  chatId: Types.ObjectId;
  senderId: Types.ObjectId;
  receiverId: Types.ObjectId;
  content: IContent;

  // Message status and tracking
  deliveryStatus: 'sent' | 'delivered' | 'seen';
  seenBy?: ISeenBy[];
  deliveredTo?: IDeliveredTo[];

  // Message interactions
  reactions?: IReaction[];

  // Message relationships
  replyTo?: Types.ObjectId;
  forwardedFrom?: Types.ObjectId;

  // Message management
  isPinned: boolean;
  isDeleted: boolean;
  deletedBy?: IDeletedBy[];
  unsentBy?: IUnsentBy[];

  // Additional metadata
  editHistory?: IEditHistory[];

  // Message expiration (for disappearing messages)
  expiresAt?: Date;

  // Message priority (for urgent messages)
  priority: 'low' | 'normal' | 'high' | 'urgent';

  // Timestamps
  createdAt?: Date;
  updatedAt?: Date;

  // Virtual for unread status
  isUnread?: boolean;

  // Instance methods
  markAsSeen?(userId: string): Promise<IMessage>;
  markAsDelivered?(userId: string): Promise<IMessage>;
  addReaction?(userId: string, emoji: string): Promise<IMessage>;
  removeReaction?(userId: string): Promise<IMessage>;
}

export interface IMessageModel extends Model<IMessage> {
  paginate(
    filter: Record<string, any>,
    options: IPaginationOptions
  ): Promise<IPaginationResult<IMessage>>;

  // Static methods
  getUnreadCount(userId: string, chatId?: string): Promise<number>;
  markChatMessagesAsSeen(chatId: string, userId: string): Promise<any>;
}