/**
 * One way to tell a user something:
 *  1. saves the notification (notifications list / unread badge)
 *  2. pushes it live over the socket ("notification:new")
 * Push notifications (FCM) can be added here later in one place.
 * Never throws: a failed notification must not break a booking action.
 */
import { Notification } from './notification.model';
import {
  emitToUserId,
  SOCKET_BOOKING_UPDATED,
  SOCKET_NOTIFICATION_NEW,
} from '../../socket/socketEmitter';
import { errorLogger } from '../../shared/logger';

export type NotifyInput = {
  title: string;
  description: string;
  type?: string;
  event?: string;
  booking?: any;
  senderId?: any;
};

const idOrUndefined = (v: any) => (v ? String(v?._id ?? v) : undefined);

export const notify = async (receiverId: any, input: NotifyInput) => {
  if (!receiverId) return;
  try {
    const doc: any = await Notification.create({
      receiverId: idOrUndefined(receiverId),
      senderId: idOrUndefined(input.senderId),
      title: input.title,
      description: input.description,
      type: input.type || (input.booking ? 'booking' : 'system'),
      event: input.event,
      booking: idOrUndefined(input.booking),
    });
    emitToUserId(receiverId, SOCKET_NOTIFICATION_NEW, toNotificationDto(doc));
  } catch (error: any) {
    try {
      errorLogger.error(`notify failed: ${error?.message}`);
    } catch {
      /* ignore */
    }
  }
};

/** Live "something changed on this booking" signal for open screens */
export const emitBookingUpdated = (userIds: any[], booking: any, status: string) => {
  const payload = { id: String(booking?._id ?? booking), status };
  for (const u of userIds) emitToUserId(u, SOCKET_BOOKING_UPDATED, payload);
};

export const toNotificationDto = (n: any) => ({
  id: String(n._id),
  title: n.title,
  description: n.description,
  type: n.type,
  event: n.event || null,
  bookingId: n.booking ? String(n.booking?._id ?? n.booking) : null,
  isRead: !!n.isRead,
  createdAt: n.createdAt,
});
