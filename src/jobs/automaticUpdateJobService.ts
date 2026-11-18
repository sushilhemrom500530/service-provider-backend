/**
 * Booking automation, every minute (one run at a time):
 *  0. reopen bookings marked Completed outside this lifecycle (e.g. an old
 *     server version still running on the same database); no payout for them
 *  0b. finish cancellations whose refund did not complete (server stopped
 *     between the cancel and the refund, or Stripe was unreachable)
 *  1. backfill startAt/endAt on older bookings; book (or refund) payments
 *     that succeeded but never became a booking (app closed, no webhook)
 *  2. expire bookings the provider didn't approve in time (full refund)
 *  3. complete finished services; close never-picked-up rentals (no-show);
 *     close rentals not returned 48 h after the end (late fee to then)
 *  4. pay providers for completed bookings still waiting (safety net)
 * The rules themselves are in modules/booking (booking.rules / booking.lifecycle).
 */
import cron from 'node-cron';
import { BookingService } from '../modules/booking/booking.service';
import { errorLogger } from '../shared/logger';

let running = false;

export const runBookingAutomation = async (now = new Date()) => {
  if (running) return null;
  running = true;
  try {
    const reopened = await BookingService.reopenForeignCompletions();
    const backfilled = await BookingService.backfillSchedule();
    const refunds = await BookingService.settlePendingRefunds(now);
    const recovered = await BookingService.reconcileDrafts(now);
    const expired = await BookingService.expireUnapproved(now);
    const completed = await BookingService.completeFinished(now);
    const paid = await BookingService.releaseHeldPayouts();
    return { reopened, backfilled, refunds, recovered, expired, completed, paid };
  } catch (error: any) {
    try {
      errorLogger.error(`booking automation failed: ${error?.stack || error?.message}`);
    } catch {
      /* ignore */
    }
    return null;
  } finally {
    running = false;
  }
};

export const startAllCronJobs = () => {
  cron.schedule('* * * * *', () => {
    void runBookingAutomation();
  });
};
