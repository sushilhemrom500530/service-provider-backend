import mongoose, { Schema } from 'mongoose';
import { ChatType, IChat } from './chat.interface';
import paginationPlugin from '../../common/plugins/pagination.plugin';

const chatSchema = new Schema<IChat>(
  {
    chatType: {
      type: String,
      enum: [ChatType.GROUP, ChatType.SINGLE],
      required: [true, 'Chat type is required'],
      default: ChatType.SINGLE,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Participants are required'],
      },
    ],
    chatName: {
      type: String,
      trim: true,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    isGroupChat: {
      type: Boolean,
      default: false,
    },
    groupAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    pinnedMessages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
      },
    ],
    groupSettings: {
      allowAddParticipants: {
        type: Boolean,
        default: true,
      },
      allowRemoveParticipants: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
  }
);

chatSchema.plugin(paginationPlugin);

export const Chat: Model<IChat> =
  mongoose.models.SkiPass || mongoose.model<IChat>('Chat', chatSchema);

// const Chat = mongoose.model<IChat, IChatModel>('Chat', chatSchema);
// export default Chat;
