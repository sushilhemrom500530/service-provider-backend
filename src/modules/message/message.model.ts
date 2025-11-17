import mongoose, { Schema } from 'mongoose';
import paginationPlugin from '../../common/plugins/pagination.plugin';
import { IMessage, IMessageModel, MessageType } from './message.interface';

const messageSchema = new Schema<IMessage>(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: false,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender ID is required'],
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Receiver ID is required'],
    },
    content: {
      messageType: {
        type: String,
        enum: Object.values(MessageType),
        required: [true, 'Message type is required'],
        default: MessageType.TEXT,
      },
      text: {
        type: String,
        trim: true,
        maxlength: [4000, 'Message text cannot exceed 4000 characters'],
        required: function () {
          return (
            this.content.messageType === MessageType.TEXT &&
            (!this.content.fileUrls || this.content.fileUrls.length === 0)
          );
        },
      },
      fileUrls: {
        type: [String],
        validate: {
          validator: function (urls: string[]) {
            return Array.isArray(urls) && urls.length <= 10;
          },
          message: 'Maximum 10 files are allowed per message',
        },
        default: [],
      },
      thumbnails: {
        type: [String],
        default: [],
      },
      fileMetadata: [
        {
          originalName: String,
          size: Number,
          mimeType: String,
          duration: Number, // For audio/video files
        },
      ],
    },
    // Message status and tracking
    deliveryStatus: {
      type: String,
      enum: ['sent', 'delivered', 'seen'],
      default: 'sent',
    },
    seenBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        seenAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    deliveredTo: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        deliveredAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Message interactions
    reactions: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        emoji: {
          type: String,
          trim: true,
          required: true,
          maxlength: [10, 'Emoji cannot exceed 10 characters'],
        },
        reactedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Message relationships
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    forwardedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },

    // Message management
    isPinned: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        deletedAt: {
          type: Date,
          default: Date.now,
        },
        deleteType: {
          type: String,
          enum: ['soft', 'hard'],
          default: 'soft',
        },
      },
    ],
    unsentBy: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        unsentAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Additional metadata
    editHistory: [
      {
        originalContent: String,
        editedAt: Date,
        editedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      },
    ],

    // Message expiration (for disappearing messages)
    expiresAt: {
      type: Date,
    },

    // Message priority (for urgent messages)
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
  }
);

// Compound indexes for better query performance
messageSchema.index({ chatId: 1, createdAt: -1 }); // Chat messages chronologically
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 }); // Direct messages
messageSchema.index({ senderId: 1, deliveryStatus: 1 }); // Sender's message status
messageSchema.index({ receiverId: 1, deliveryStatus: 1, createdAt: -1 }); // Receiver's unread messages
messageSchema.index({ chatId: 1, isPinned: 1 }); // Pinned messages in chat
messageSchema.index({ 'seenBy.userId': 1, 'seenBy.seenAt': -1 }); // Message read receipts
messageSchema.index({ replyTo: 1 }); // Reply chains
messageSchema.index({ 'content.messageType': 1, createdAt: -1 }); // Filter by message type

// Sparse indexes for optional fields
messageSchema.index({ expiresAt: 1 }, { sparse: true }); // Expiring messages
messageSchema.index({ 'reactions.userId': 1 }, { sparse: true });

// Virtual for unread count
messageSchema.virtual('isUnread').get(function () {
  return this.deliveryStatus !== 'seen';
});

// Instance methods
messageSchema.methods.markAsSeen = function (userId: string) {
  const alreadySeen = this.seenBy.some(
    (seen: any) => seen.userId.toString() === userId.toString()
  );

  if (!alreadySeen) {
    this.seenBy.push({ userId, seenAt: new Date() });
    this.deliveryStatus = 'seen';
  }

  return this.save();
};

messageSchema.methods.markAsDelivered = function (userId: string) {
  const alreadyDelivered = this.deliveredTo.some(
    (delivered: any) => delivered.userId.toString() === userId.toString()
  );

  if (!alreadyDelivered) {
    this.deliveredTo.push({ userId, deliveredAt: new Date() });
    if (this.deliveryStatus === 'sent') {
      this.deliveryStatus = 'delivered';
    }
  }

  return this.save();
};

messageSchema.methods.addReaction = function (userId: string, emoji: string) {
  // Remove existing reaction from this user
  this.reactions = this.reactions.filter(
    (reaction: any) => reaction.userId.toString() !== userId.toString()
  );

  // Add new reaction
  this.reactions.push({ userId, emoji, reactedAt: new Date() });

  return this.save();
};

messageSchema.methods.removeReaction = function (userId: string) {
  this.reactions = this.reactions.filter(
    (reaction: any) => reaction.userId.toString() !== userId.toString()
  );

  return this.save();
};

// Static methods
messageSchema.statics.getUnreadCount = function (
  userId: string,
  chatId?: string
) {
  const query: any = {
    receiverId: userId,
    deliveryStatus: { $ne: 'seen' },
    isDeleted: false,
  };

  if (chatId) {
    query.chatId = chatId;
  }

  return this.countDocuments(query);
};

messageSchema.statics.markChatMessagesAsSeen = function (
  chatId: string,
  userId: string
) {
  return this.updateMany(
    {
      chatId,
      receiverId: userId,
      deliveryStatus: { $ne: 'seen' },
      'seenBy.userId': { $ne: userId },
    },
    {
      $push: { seenBy: { userId, seenAt: new Date() } },
      $set: { deliveryStatus: 'seen' },
    }
  );
};

// Pre-save middleware
messageSchema.pre('save', function (next) {
  // Validate content based on message type
  if (this.content.messageType === MessageType.TEXT) {
    if (
      !this.content.text &&
      (!this.content.fileUrls || this.content.fileUrls.length === 0)
    ) {
      next(
        new Error(
          'Text messages must have either text content or file attachments'
        )
      );
      return;
    }
  }

  // Set expiration for disappearing messages if specified
  if (this.priority === 'urgent' && !this.expiresAt) {
    // Urgent messages expire after 24 hours if not seen
    this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  next();
});

// Add pagination plugin
messageSchema.plugin(paginationPlugin);

const Message = mongoose.model<IMessage, IMessageModel>(
  'Message',
  messageSchema
);

export default Message;
