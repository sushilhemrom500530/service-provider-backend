/**
 * Booking service facade. The logic lives in focused files:
 *   booking.rules.ts         status, actions, schedule, refund + late-fee rules (pure)
 *   booking.availability.ts  listing registry + per-date availability
 *   booking.create.ts        /intent -> payment -> /create (+ webhook)
 *   booking.lifecycle.ts     approve, reject, hand-over, return, complete, cancel, late fee, jobs
 *   booking.query.ts         lists and detail
 *   booking.serializer.ts    the JSON the app receives
 */
import Stripe from 'stripe';
import { StatusCodes } from 'http-status-codes';
import AppError from '../../errors/AppErro';
import stripe from '../../utils/stripe';
import { config } from '../../config';
import { createBookingIntent, createBookingFromPayment, bookFromWebhook, reconcileDrafts } from './booking.create';
import { adminRefund, onExternalRefund, onDisputeOpened, onDisputeClosed } from './booking.settlement';
import {
  approveBooking,
  rejectBooking,
  handOverBooking,
  returnRental,
  completeBooking,
  cancelByCustomer,
  createLateFeeIntent,
  confirmLateFee,
  releaseProviderPayout,
  cancelWithFullRefund,
  expireUnapproved,
  completeFinished,
  releaseHeldPayouts,
  backfillSchedule,
} from './booking.lifecycle';
import {
  getMyBookings,
  getProviderBookings,
  getAllBookingsAdmin,
  getBookingById,
} from './booking.query';
import { getAvailability } from './booking.availability';
import { loadContext, toBookingDetail } from './booking.serializer';

/** Booking document -> detail for the given viewer */
const detail = async (booking: any, viewer: 'customer' | 'provider' | 'admin') => {
  if (!booking) return null;
  const ctx = await loadContext([booking]);
  return toBookingDetail(booking, viewer, ctx);
};

/** POST /booking/webhook (Stripe, raw body) */
const handleStripeWebhook = async (rawBody: Buffer, signature?: string) => {
  if (!config.stripe.webhookSecret)
    throw new AppError(StatusCodes.SERVICE_UNAVAILABLE, 'Stripe webhook secret is not configured.');
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature || '', config.stripe.webhookSecret);
  } catch (error: any) {
    throw new AppError(StatusCodes.BAD_REQUEST, `Webhook signature verification failed: ${error?.message}`);
  }
  const obj: any = event.data.object;
  if (event.type === 'refund.created') return { received: true, ...(await onExternalRefund(obj)) };
  if (event.type === 'charge.dispute.created') return { received: true, ...(await onDisputeOpened(obj)) };
  if (event.type === 'charge.dispute.closed') return { received: true, ...(await onDisputeClosed(obj)) };
  if (event.type !== 'payment_intent.succeeded') return { received: true, handled: false };

  const intent = event.data.object as Stripe.PaymentIntent;
  if (intent.metadata?.type === 'late_fee') {
    await confirmLateFee(intent.id).catch(() => null);
    return { received: true, handled: true };
  }
  const result = await bookFromWebhook(intent);
  return { received: true, ...result };
};

export const BookingService = {
  // create
  createBookingIntent,
  createBookingFromPayment,
  handleStripeWebhook,
  getAvailability,
  // read
  getMyBookings,
  getProviderBookings,
  getAllBookingsAdmin,
  getBookingById,
  // actions
  approveBooking,
  rejectBooking,
  handOverBooking,
  returnRental,
  completeBooking,
  cancelByCustomer,
  createLateFeeIntent,
  confirmLateFee,
  // money + jobs
  releaseProviderPayout,
  cancelWithFullRefund,
  expireUnapproved,
  completeFinished,
  releaseHeldPayouts,
  backfillSchedule,
  reconcileDrafts,
  adminRefund,
  detail,
};
