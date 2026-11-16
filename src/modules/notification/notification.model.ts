import mongoose, { Schema } from 'mongoose';
import { INotification } from './notification.interface';

const NotificationSchema: Schema = new Schema(
  {
    // who caused it (provider, customer); empty for system notifications
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    title: {
      type: String,
    },
    description: {
      type: String,
    },
    // booking | payment | withdraw | review | system
    type: {
      type: String,
      default: 'system',
    },
    // what the app should open when the notification is tapped
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
    },
    // short machine-readable event, e.g. "booking.approved"
    event: {
      type: String,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

NotificationSchema.index({ receiverId: 1, createdAt: -1 });

export const Notification =
  mongoose.models.Notification ||
  mongoose.model<INotification>('Notification', NotificationSchema);
