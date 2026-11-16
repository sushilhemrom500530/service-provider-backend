import { getIO } from './socketInstance';

/**
 * Send a real-time event to every connected device of a user.
 * Each socket joins a room named after its userId on connect
 * (socket/index.ts), so this reaches all of the user's sessions.
 * Never throws: when sockets aren't running (scripts/tests) it does nothing.
 */
export const emitToUserId = (userId: unknown, event: string, data: unknown) => {
  const id = userId ? String((userId as any)?._id ?? userId) : '';
  if (!id) return;
  try {
    getIO().to(id).emit(event, data);
  } catch {
    /* socket server not initialised */
  }
};

export const SOCKET_BOOKING_UPDATED = 'booking:updated';
export const SOCKET_NOTIFICATION_NEW = 'notification:new';
