/**
 * Booking lifecycle: every state change of a booking lives here.
 *
 *   Pending ──approve──> Confirmed ──hand_over──> InProgress ──return──> Completed   (Ski Hire, Transport)
 *   Pending ──approve──> Confirmed ──(start time)──> InProgress ──complete / auto──> Completed (Massage, Restaurant)
 *   (Ski Pass is Confirmed at payment and completes after its day)
 *   Pending/Confirmed ──reject (provider) / expiry (system)──> Cancelled, 100 % refund
 *   Pending/Confirmed ──cancel (customer, before start)──> Cancelled, 100 % or 90 % refund
 *
 * Each change is ONE atomic update guarded by the expected current state, so
 * double taps, two devices or a job running at the same time can't apply an
 * action twice (the loser gets 409).
 */
import Stripe from 'stripe';
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errors/AppErro';
import stripe from '../../utils/stripe';
import { config } from '../../config';
import { Booking } from './booking.model';
import { Payment } from '../payment/payment.model';
import { PaymentGateway, TransactionStatus } from '../payment/payment.interface';
import { WalletTransactionType } from '../wallet/wallet.interface';
import { changeBalance, payProvider, reverseProviderPayment } from '../wallet/ledger';
import { notify, emitBookingUpdated } from '../notification/notify';
import { LISTING_MODELS, MODEL_TO_CATEGORY, hourlyRateOf } from './booking.availability';
import { errorLogger } from '../../shared/logger';
import {
  FOREIGN_COMPLETION_FILTER,
  OVERWRITTEN_CANCEL_FILTER,
  OPEN_STATUSES,
  POLICY,
  computeLateFee,
  computeSchedule,
  customerCancelRefund,
  deriveStatus,
  formatBookingWhen,
  formatLocalDateTime,
  formatMinutes,
  formatMoney,
  isRental,
  splitServiceFee,
} from './booking.rules';
import { assertStripeConfigured } from './booking.create';

const round2 = (n: number) => Math.round(n * 100) / 100;
const toMinor = (amount: number) => Math.round(Number(amount) * 100);
const conflict = (m: string) => new AppError(StatusCodes.CONFLICT, m);

/* ------------------------------------------------------------------ */
/* Guard against completions made outside this lifecycle               */
/* ------------------------------------------------------------------ */

/**
 * Put back to open the bookings of this flow that something else marked
 * Completed (no `completedAt`; see isForeignCompletion), e.g. an old server
 * version still running its timer on the same database. The normal rules then
 * apply: a handed-over rental stays InProgress until returned (late fee) or
 * auto-returned 48 h after its end; other services complete at their real end.
 * Nothing was paid for them: payouts require `completedAt`.
 */
export const reopenForeignCompletions = async (scope: Record<string, any> = {}) => {
  const [reopenedRes, restoredRes] = await Promise.all([
    Booking.updateMany({ ...FOREIGN_COMPLETION_FILTER, ...scope }, { $set: { bookingStatus: 'Active' } }),
    // a cancelled (and refunded) booking overwritten to Completed: cancelled again
    Booking.updateMany({ ...OVERWRITTEN_CANCEL_FILTER, ...scope }, { $set: { bookingStatus: 'Cancelled' } }),
  ]);
  const reopened = reopenedRes.modifiedCount || 0;
  const restored = restoredRes.modifiedCount || 0;
  if (reopened || restored)
    try {
      errorLogger.error(
        `Booking(s) marked Completed outside the booking lifecycle: ${reopened} reopened, ${restored} set back to Cancelled. Is an old server version still running on this database?`,
      );
    } catch {
      /* ignore */
    }
  return reopened + restored;
};

/* ------------------------------------------------------------------ */
/* Loading + access                                                    */
/* ------------------------------------------------------------------ */

export const listingOfBooking = async (b: any) => {
  const category = b?.category || MODEL_TO_CATEGORY[b?.productModel];
  const entry = LISTING_MODELS[category];
  if (!entry) return null;
  return entry.model.findById(b.product).lean();
};

/**
 * Can the customer review this listing after the booking? Same rule as the
 * `review` action: not a no-show, and no review of this listing by them yet
 * (one review per customer per listing). Read from the database, not from a
 * possibly stale copy of the listing.
 */
export const canReviewAfter = async (b: any) => {
  if (b?.noShow) return false;
  const entry = LISTING_MODELS[b?.category || MODEL_TO_CATEGORY[b?.productModel]];
  if (!entry || !b?.product || !b?.user) return false;
  const reviewed = await entry.model.exists({ _id: b.product, 'reviews.userId': b.user });
  return !reviewed;
};

/** "We hope you enjoyed X." + the review invitation only when a review is possible */
const completedMessage = async (b: any, listing: any, opening: string) => {
  const canReview = await canReviewAfter(b);
  return {
    description: `${opening} ${titleOf(listing)}.${canReview ? ' You can now leave a review.' : ''}`,
    data: { canReview },
  };
};

/** Booking + its listing; checks the caller may act as provider (owner or Admin) */
export const loadForProvider = async (bookingId: string, user: JwtPayload) => {
  if (!Types.ObjectId.isValid(String(bookingId)))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid booking id.');
  await reopenForeignCompletions({ _id: bookingId });
  const booking: any = await Booking.findById(bookingId).lean();
  if (!booking) throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  const listing: any = await listingOfBooking(booking);
  const isOwner = listing && String(listing.owner) === String(user.userId);
  if (!isOwner && user.role !== 'Admin')
    throw new AppError(StatusCodes.FORBIDDEN, 'Only the provider of this listing can do this.');
  return { booking, listing };
};

export const loadForCustomer = async (bookingId: string, user: JwtPayload) => {
  if (!Types.ObjectId.isValid(String(bookingId)))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid booking id.');
  await reopenForeignCompletions({ _id: bookingId });
  const booking: any = await Booking.findById(bookingId).lean();
  if (!booking) throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  if (String(booking.user) !== String(user.userId))
    throw new AppError(StatusCodes.FORBIDDEN, 'This is not your booking.');
  const listing: any = await listingOfBooking(booking);
  return { booking, listing };
};

const titleOf = (listing: any) => listing?.title || 'your booking';
const by = (user?: JwtPayload) => (user?.role === 'Admin' ? 'admin' : 'provider');

/* ------------------------------------------------------------------ */
/* Refunds                                                             */
/* ------------------------------------------------------------------ */

const bookingPaymentOf = (bookingId: any) =>
  Payment.findOne({ booking: bookingId, purpose: { $ne: 'late_fee' } });

/**
 * Count one refund on the payment, once per refund id (Stripe can resend
 * webhooks, a job can retry): refundedAmount + status. false = already counted.
 */
export const recordRefund = async (paymentId: any, refundId: string, amount: number) => {
  const value = round2(amount);
  if (!refundId || value <= 0) return false;
  const p: any = await Payment.findOneAndUpdate(
    { _id: paymentId, refundIds: { $ne: refundId } },
    { $inc: { refundedAmount: value }, $push: { refundIds: refundId }, $set: { refundedAt: new Date() } },
    { new: true },
  ).lean();
  if (!p) return false;
  const total = round2(Number(p.amount) || 0);
  const refunded = round2(Math.min(Number(p.refundedAmount) || 0, total));
  await Payment.updateOne(
    { _id: p._id },
    {
      $set: {
        refundedAmount: refunded,
        status: refunded >= total ? TransactionStatus.REFUNDED : TransactionStatus.PARTIALLY_REFUNDED,
      },
    },
  );
  return true;
};

/**
 * Refunds this app already sent to Stripe for the booking but never counted
 * (e.g. the server stopped right after Stripe answered). Counts them now.
 */
const syncAppRefunds = async (payment: any, bookingId: any) => {
  const tx = String(payment?.transactionId || '');
  if (!payment || !tx.startsWith('pi_')) return payment;
  try {
    const list: any = await (stripe.refunds as any).list({ payment_intent: tx, limit: 100 });
    for (const r of list?.data || []) {
      if (r?.status === 'failed' || r?.status === 'canceled') continue;
      if (r?.metadata?.source !== 'app' || String(r?.metadata?.bookingId) !== String(bookingId)) continue;
      await recordRefund(payment._id, r.id, (Number(r.amount) || 0) / 100);
    }
  } catch {
    /* Stripe unreachable: the idempotency key still prevents a double refund */
  }
  return Payment.findById(payment._id);
};

/**
 * Refund the customer for a booking. Stripe payments go back to the card;
 * old non-Stripe payments go to the in-app wallet. Returns the amount sent now.
 *  - `amount`: refund up to this much (never more than what is left)
 *  - `target`: or: refund until payment.refundedAmount reaches this (retry-safe)
 * Safe to retry: earlier app refunds are synced first and the Stripe call uses
 * an idempotency key, so the customer is never refunded twice.
 * Throws 502 when Stripe refuses (`uncertain: true` when Stripe could not be
 * reached and the outcome is unknown).
 */
export const refundBookingPayment = async (booking: any, amount: number, opts: { target?: number } = {}) => {
  let payment: any = await bookingPaymentOf(booking._id);
  const tx = String(payment?.transactionId || booking.transactionId || '');
  if (payment && tx.startsWith('pi_')) payment = await syncAppRefunds(payment, booking._id);

  const total = round2(Number(payment?.amount ?? booking.totalPrice) || 0);
  const already = round2(Number(payment?.refundedAmount) || 0);
  const refundable =
    opts.target !== undefined
      ? round2(Math.min(opts.target, total) - already)
      : round2(Math.min(round2(amount), total - already));
  if (refundable <= 0) return 0;

  if (tx.startsWith('pi_')) {
    let refund: any;
    try {
      refund = await stripe.refunds.create(
        {
          payment_intent: tx,
          ...(refundable < total - already ? { amount: toMinor(refundable) } : {}),
          // tells the webhook this refund was made by the app
          metadata: { source: 'app', bookingId: String(booking._id) },
        },
        // same booking + same step = same Stripe refund, even if retried
        { idempotencyKey: `refund-${booking._id}-${toMinor(already)}-${toMinor(refundable)}` },
      );
    } catch (error: any) {
      const err: any = new AppError(
        StatusCodes.BAD_GATEWAY,
        `The refund could not be sent to the card: ${error?.message || 'Stripe error'}. Nothing was changed.`,
      );
      err.uncertain = error?.type === 'StripeConnectionError';
      throw err;
    }
    if (payment) await recordRefund(payment._id, refund?.id || `re-${booking._id}-${toMinor(already)}`, refundable);
  } else {
    await changeBalance(booking.user, refundable, WalletTransactionType.RECEIVE, booking.user);
    if (payment) await recordRefund(payment._id, `wallet-${new Types.ObjectId()}`, refundable);
  }
  return refundable;
};

/** Provider money for a cancelled booking that was already paid out */
export const undoProviderPayout = async (booking: any, ownerId: any) => {
  if (booking.providerPayout === 'held' || booking.providerPayout === 'reversed') return;
  // 'paid' (new) or empty (old bookings: credited in full at payment, no fee)
  const net = Number(booking.providerEarning ?? booking.totalPrice) || 0;
  const fee = Number(booking.platformFee) || 0;
  if (ownerId && net > 0) await reverseProviderPayment(ownerId, net, fee, booking.user);
};

/* ------------------------------------------------------------------ */
/* Cancellation: two steps, crash-safe                                 */
/*  1. one atomic update: status Cancelled + `pendingRefund` (what is owed) */
/*  2. settleCancellation: refund to the card, provider money, notify,  */
/*     clear `pendingRefund`. If the server stops between 1 and 2 (restart, */
/*     deploy, crash), the job runs step 2 later. Never refunds twice.   */
/* ------------------------------------------------------------------ */

const CLAIM_TIMEOUT_MS = 2 * 60000;

type CancelKind = 'customer' | 'full';

/** Step 1: cancel + remember the refund owed. Returns the booking before, or null */
const startCancellation = async (
  guard: Record<string, any>,
  booking: any,
  cancel: { by: 'user' | 'provider' | 'admin' | 'system'; reason?: string },
  refund: { amount: number; kept: number; percent: number; kind: CancelKind },
) => {
  const payment: any = await bookingPaymentOf(booking._id).lean();
  const total = round2(Number(payment?.amount ?? booking.totalPrice) || 0);
  const already = round2(Number(payment?.refundedAmount) || 0);
  const amount = round2(Math.max(0, Math.min(refund.amount, total - already)));
  const now = new Date();
  return Booking.findOneAndUpdate(
    { ...guard, _id: booking._id, bookingStatus: { $in: OPEN_STATUSES } },
    {
      $set: {
        bookingStatus: 'Cancelled',
        cancelledBy: cancel.by,
        cancelReason: cancel.reason,
        cancelledAt: now,
        pendingRefund: {
          amount,
          target: round2(already + amount),
          kept: refund.kept,
          percent: refund.percent,
          kind: refund.kind,
          startedAt: now,
          claimedAt: now, // this request settles it; the job only after a timeout
        },
      },
    },
    { new: true },
  ).lean();
};

/** Undo step 1 when Stripe refused the refund (the booking is as before) */
const abortCancellation = (b: any, previousStatus: string) =>
  Booking.updateOne(
    { _id: b._id, bookingStatus: 'Cancelled', pendingRefund: { $exists: true } },
    {
      $set: { bookingStatus: previousStatus },
      $unset: { cancelledBy: '', cancelReason: '', cancelledAt: '', pendingRefund: '' },
    },
  );

/**
 * Every cancellation text names the booking: the service and when it takes
 * place ("Après-Ski Massage on Tue 17 Nov, 12:00 PM CET"), so a customer or
 * provider with several bookings knows which one. Exact values in `data`.
 */
const notifyCancellation = async (b: any, listing: any, refunded: number) => {
  const percent = b.pendingRefund?.percent ?? 100;
  const reason = b.cancelReason;
  const when = formatBookingWhen(b);
  const on = when ? ` on ${when}` : '';
  const { startAt } = computeSchedule(b);
  const data = { startAt: startAt ?? null, refunded, percent, currency: config.stripe.currency };
  if (b.cancelledBy === 'user') {
    await notify(b.user, {
      title: 'Booking cancelled',
      description: `${titleOf(listing)}${on} was cancelled. ${formatMoney(refunded)} (${percent}%) is refunded to your card.`,
      data,
      booking: b,
      event: 'booking.cancelled',
    });
    await notify(listing?.owner, {
      title: 'Booking cancelled by customer',
      description: `A booking for ${titleOf(listing)}${on} was cancelled by the customer.${reason ? ` Reason: ${reason}` : ''}`,
      data: { startAt: data.startAt },
      booking: b,
      senderId: b.user,
      event: 'booking.cancelled',
    });
    return;
  }
  const system = b.cancelledBy === 'system';
  const what = system ? 'expired (not confirmed in time)' : 'was cancelled by the provider';
  await notify(b.user, {
    title: system ? 'Booking expired' : 'Booking cancelled',
    description: `${titleOf(listing)}${on} ${what}. ${formatMoney(refunded)} is refunded to your card.${reason ? ` Reason: ${reason}` : ''}`,
    data,
    booking: b,
    senderId: listing?.owner,
    event: system ? 'booking.expired' : 'booking.rejected',
  });
  if (system)
    await notify(listing?.owner, {
      title: 'Booking expired',
      description: `A booking for ${titleOf(listing)}${on} was not confirmed in time and has been refunded.`,
      data: { startAt: data.startAt },
      booking: b,
      event: 'booking.expired',
    });
};

/**
 * Step 2: send the refund owed by a cancellation, settle the provider's
 * money, notify both sides, clear `pendingRefund`. Called right after step 1
 * (with its claim) or by the job for a cancellation left unfinished.
 * Returns { booking, refunded } or null when someone else is settling it.
 */
export const settleCancellation = async (bookingId: any, claimedAt?: Date, now = new Date()) => {
  const claimGuard = claimedAt
    ? { 'pendingRefund.claimedAt': claimedAt }
    : {
        $or: [
          { 'pendingRefund.claimedAt': { $exists: false } },
          { 'pendingRefund.claimedAt': { $lte: new Date(now.getTime() - CLAIM_TIMEOUT_MS) } },
        ],
      };
  const b: any = await Booking.findOneAndUpdate(
    { _id: bookingId, bookingStatus: 'Cancelled', pendingRefund: { $exists: true }, ...claimGuard },
    { $set: { 'pendingRefund.claimedAt': now } },
    { new: true },
  ).lean();
  if (!b) return null;
  const pending = b.pendingRefund;

  // 1. the refund (retry-safe)
  const sent = await refundBookingPayment(b, pending.amount, { target: pending.target });
  const payment: any = await bookingPaymentOf(b._id).lean();
  const refunded = payment
    ? round2(Math.max(0, Math.min(pending.amount, (Number(payment.refundedAmount) || 0) - (pending.target - pending.amount))))
    : sent;

  // 2. close it (once): from here on the job won't touch it again
  const listing: any = await listingOfBooking(b);
  const set: Record<string, any> = { refundAmount: refunded, refundedAt: new Date() };
  const keptPaid = pending.kind === 'customer' && b.providerPayout === 'held' && pending.kept > 0 && !!listing?.owner;
  if (pending.kind === 'full' || b.providerPayout === 'held') set.providerPayout = keptPaid ? 'paid' : 'reversed';
  const closed: any = await Booking.findOneAndUpdate(
    { _id: b._id, 'pendingRefund.claimedAt': now },
    { $set: set, $unset: { pendingRefund: '' } },
    { new: true },
  ).lean();
  if (!closed) return null;

  // 3. provider money (after the close, so it can never run twice)
  if (pending.kind === 'full') {
    await undoProviderPayout(b, listing?.owner);
  } else if (keptPaid) {
    // late customer cancel: the provider keeps the non-refunded part, minus the
    // platform fee; the service fee in it stays with the platform
    await payBookingShare(b, listing, pending.kept);
  } else if (b.providerPayout !== 'held' && b.providerPayout !== 'reversed' && listing?.owner && refunded > 0) {
    // old bookings: the provider was credited the full price at payment
    await changeBalance(listing.owner, -refunded, WalletTransactionType.SEND, b.user);
  }

  await notifyCancellation(b, listing, refunded);
  emitBookingUpdated([b.user, listing?.owner], b, 'Cancelled');
  return { booking: await Booking.findById(b._id).lean(), refunded };
};

/**
 * Run step 2 right after step 1. If Stripe refuses, undo the cancellation
 * (409/502 to the caller, nothing changed). If Stripe can't be reached the
 * outcome is unknown: keep it pending, the job finishes it.
 */
const settleNow = async (b: any, previousStatus: string) => {
  try {
    const done = await settleCancellation(b._id, b.pendingRefund.claimedAt);
    if (done) return done;
  } catch (error: any) {
    if (!error?.uncertain) {
      await abortCancellation(b, previousStatus);
      throw error;
    }
  }
  return { booking: await Booking.findById(b._id).lean(), refunded: null as number | null };
};

/**
 * Cancel with a FULL refund: provider reject, admin cancel, approval expiry.
 * If the card refund is refused the booking is put back as it was.
 */
export const cancelWithFullRefund = async (
  bookingId: any,
  cancelledBy: 'provider' | 'admin' | 'system',
  reason?: string,
  extraGuard: Record<string, any> = {},
) => {
  const current: any = await Booking.findById(bookingId).lean();
  if (!current) throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  const total = round2(Number(current.totalPrice) || 0);
  const started = await startCancellation(
    { isHandOver: { $ne: true }, ...extraGuard },
    current,
    { by: cancelledBy, reason },
    { amount: total, kept: 0, percent: 100, kind: 'full' },
  );
  if (!started) throw conflict('This booking can no longer be cancelled.');
  const { booking } = await settleNow(started, current.bookingStatus);
  return booking;
};

/** Job: finish cancellations whose refund didn't complete (server stopped, Stripe unreachable) */
export const settlePendingRefunds = async (now = new Date()) => {
  // cancellations made before pendingRefund existed and never settled:
  // Cancelled, payout still held, no refund recorded, no card dispute
  const legacy: any[] = await Booking.find({
    bookingStatus: 'Cancelled',
    providerPayout: 'held',
    pendingRefund: { $exists: false },
    refundedAt: { $exists: false },
    cancelledAt: { $exists: true, $lte: new Date(now.getTime() - CLAIM_TIMEOUT_MS) },
    'dispute.status': { $exists: false },
  })
    .limit(50)
    .lean();
  for (const b of legacy) {
    const policy =
      b.cancelledBy === 'user'
        ? customerCancelRefund(b, new Date(b.cancelledAt))
        : { refund: round2(Number(b.totalPrice) || 0), kept: 0, percent: 100 };
    const payment: any = await bookingPaymentOf(b._id).lean();
    const total = round2(Number(payment?.amount ?? b.totalPrice) || 0);
    const already = round2(Number(payment?.refundedAmount) || 0);
    const amount = round2(Math.max(0, Math.min(policy.refund, total - already)));
    await Booking.updateOne(
      { _id: b._id, pendingRefund: { $exists: false }, refundedAt: { $exists: false } },
      {
        $set: {
          pendingRefund: {
            amount,
            target: round2(already + amount),
            kept: policy.kept,
            percent: policy.percent,
            kind: b.cancelledBy === 'user' ? 'customer' : 'full',
            startedAt: now,
          },
        },
      },
    );
  }

  const pending: any[] = await Booking.find({
    bookingStatus: 'Cancelled',
    pendingRefund: { $exists: true },
    $or: [
      { 'pendingRefund.claimedAt': { $exists: false } },
      { 'pendingRefund.claimedAt': { $lte: new Date(now.getTime() - CLAIM_TIMEOUT_MS) } },
    ],
  })
    .select('_id')
    .limit(50)
    .lean();
  let settled = 0;
  for (const { _id } of pending) {
    try {
      if (await settleCancellation(_id, undefined, now)) settled++;
    } catch (error: any) {
      try {
        errorLogger.error(`refund for cancelled booking ${_id} failed, will retry: ${error?.message}`);
      } catch {
        /* ignore */
      }
    }
  }
  return settled;
};

/* ------------------------------------------------------------------ */
/* Provider actions                                                    */
/* ------------------------------------------------------------------ */

export const approveBooking = async (bookingId: string, user: JwtPayload) => {
  const { booking, listing } = await loadForProvider(bookingId, user);
  if (booking.approvalDeadline && new Date(booking.approvalDeadline).getTime() <= Date.now())
    throw conflict('The approval time is over; this booking is being refunded.');

  const updated: any = await Booking.findOneAndUpdate(
    { _id: booking._id, bookingStatus: { $in: OPEN_STATUSES }, isPermitted: { $ne: true } },
    { $set: { isPermitted: true, approvedAt: new Date() } },
    { new: true },
  ).lean();
  if (!updated) throw conflict(`This booking is ${deriveStatus(booking)} and can't be approved.`);

  const when = formatBookingWhen(booking);
  await notify(booking.user, {
    title: 'Booking confirmed',
    description: `${titleOf(listing)}${when ? ` on ${when}` : ''} has been confirmed by the provider.`,
    data: { startAt: computeSchedule(booking).startAt ?? null },
    booking,
    senderId: user.userId,
    event: 'booking.approved',
  });
  emitBookingUpdated([booking.user, listing?.owner], booking, deriveStatus(updated));
  return updated;
};

export const rejectBooking = async (bookingId: string, user: JwtPayload, reason?: string) => {
  const { booking } = await loadForProvider(bookingId, user);
  const status = deriveStatus(booking);
  const { startAt } = computeSchedule(booking);
  if (status === 'Confirmed' && startAt && startAt.getTime() <= Date.now())
    throw conflict('This booking has already started and can no longer be rejected.');
  if (status !== 'Pending' && status !== 'Confirmed')
    throw conflict(`This booking is ${status} and can't be rejected.`);
  return cancelWithFullRefund(booking._id, by(user) as any, reason);
};

export const handOverBooking = async (bookingId: string, user: JwtPayload) => {
  const { booking, listing } = await loadForProvider(bookingId, user);
  if (!isRental(booking.category))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Hand-over is only for Ski Hire and Transport.');
  const { endAt } = computeSchedule(booking);
  if (endAt && endAt.getTime() <= Date.now())
    throw conflict('The rental period is already over.');
  // one vehicle: it can't go to this customer while the previous one has it
  if (booking.category === 'Transport') {
    const stillOut = await Booking.exists({
      _id: { $ne: booking._id },
      product: booking.product,
      bookingStatus: { $in: OPEN_STATUSES },
      isHandOver: true,
    });
    if (stillOut)
      throw conflict('This vehicle has not been returned by the previous customer yet. Mark that rental as returned first.');
  }

  const updated: any = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      bookingStatus: { $in: OPEN_STATUSES },
      isPermitted: true,
      isHandOver: { $ne: true },
    },
    { $set: { isHandOver: true, handedOverAt: new Date() } },
    { new: true },
  ).lean();
  if (!updated)
    throw conflict(
      booking.isPermitted ? 'This booking was already handed over or closed.' : 'Approve the booking first.',
    );

  await notify(booking.user, {
    title: 'Rental started',
    description: `${titleOf(listing)} has been handed over to you. Please return it by ${formatLocalDateTime(endAt)}.`,
    data: { returnBy: endAt ?? null },
    booking,
    senderId: user.userId,
    event: 'booking.handed_over',
  });
  emitBookingUpdated([booking.user, listing?.owner], booking, 'InProgress');
  return updated;
};

/**
 * Rental returned (provider "Mark as returned"): Completed + late fee.
 * Also used by the job for rentals never returned (actor 'system').
 */
export const returnRental = async (
  bookingId: string,
  user: JwtPayload | null,
  returnedAt = new Date(),
) => {
  const { booking, listing } = user
    ? await loadForProvider(bookingId, user)
    : { booking: await Booking.findById(bookingId).lean() as any, listing: null as any };
  if (!booking) throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  const theListing = listing || (await listingOfBooking(booking));
  if (!isRental(booking.category))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Use complete for this booking.');

  const { endAt } = computeSchedule(booking);
  const fee = computeLateFee(
    endAt,
    returnedAt,
    hourlyRateOf(theListing, booking.category),
    Number(booking.totalPrice) || 0,
  );

  const updated: any = await Booking.findOneAndUpdate(
    { _id: booking._id, bookingStatus: { $in: OPEN_STATUSES }, isHandOver: true },
    {
      $set: {
        bookingStatus: 'Completed',
        completedAt: new Date(),
        returnedAt,
        lateFee: { hours: fee.hours, amount: fee.amount, status: fee.amount > 0 ? 'due' : 'none' },
        // kept for older app versions
        overTimeHours: fee.hours,
        overTimeCharge: fee.amount,
      },
    },
    { new: true },
  ).lean();
  if (!updated)
    throw conflict(
      booking.isHandOver ? 'This rental was already returned.' : 'Hand over the rental first.',
    );

  await releaseProviderPayout(updated._id);

  // the real delay (not the charged, started hours): "returned 15 min late"
  const lateMinutes = endAt ? Math.max(0, Math.round((returnedAt.getTime() - endAt.getTime()) / 60000)) : 0;
  const startedHours = `${fee.hours} started hour${fee.hours === 1 ? '' : 's'}`;
  await notify(booking.user, {
    title: fee.amount > 0 ? 'Late return fee' : 'Rental completed',
    description:
      fee.amount > 0
        ? `${titleOf(theListing)} was returned ${formatMinutes(lateMinutes)} late. Late fee: ${formatMoney(fee.amount)} (${startedHours}). Please pay it in the app.`
        : `Thanks! ${titleOf(theListing)} has been returned.`,
    ...(fee.amount > 0 && {
      data: { lateMinutes, chargedHours: fee.hours, lateFee: fee.amount, currency: config.stripe.currency },
    }),
    booking,
    senderId: theListing?.owner,
    event: fee.amount > 0 ? 'booking.late_fee_due' : 'booking.completed',
  });
  emitBookingUpdated([booking.user, theListing?.owner], booking, 'Completed');
  return Booking.findById(updated._id).lean();
};

/** Service finished (Massage, Restaurant, Ski Pass): provider marks it done */
export const completeBooking = async (bookingId: string, user: JwtPayload) => {
  const { booking, listing } = await loadForProvider(bookingId, user);
  if (isRental(booking.category)) {
    if (booking.isHandOver) return returnRental(bookingId, user);
    throw conflict('Hand over the rental first, then mark it as returned.');
  }
  const { startAt } = computeSchedule(booking);
  if (!booking.isPermitted) throw conflict('Approve the booking first.');
  if (startAt && startAt.getTime() > Date.now())
    throw conflict('This booking has not started yet.');

  const updated: any = await Booking.findOneAndUpdate(
    { _id: booking._id, bookingStatus: { $in: OPEN_STATUSES }, isPermitted: true },
    { $set: { bookingStatus: 'Completed', completedAt: new Date() } },
    { new: true },
  ).lean();
  if (!updated) throw conflict('This booking is already closed.');

  await releaseProviderPayout(updated._id);
  await notify(booking.user, {
    title: 'Booking completed',
    ...(await completedMessage(booking, listing, 'Thanks for visiting')),
    booking,
    senderId: user.userId,
    event: 'booking.completed',
  });
  emitBookingUpdated([booking.user, listing?.owner], booking, 'Completed');
  return Booking.findById(updated._id).lean();
};

/* ------------------------------------------------------------------ */
/* Customer cancel                                                     */
/* ------------------------------------------------------------------ */

export const cancelByCustomer = async (bookingId: string, user: JwtPayload, reason?: string) => {
  const { booking } = await loadForCustomer(bookingId, user);
  const status = deriveStatus(booking);
  const { startAt } = computeSchedule(booking);
  if (status !== 'Pending' && status !== 'Confirmed')
    throw conflict(`This booking is ${status} and can't be cancelled.`);
  if (booking.isHandOver || (startAt && startAt.getTime() <= Date.now()))
    throw conflict('This booking has already started and can no longer be cancelled.');

  // 100 % if still Pending or more than 24 h before the start, otherwise 90 %
  const policy = customerCancelRefund(booking);
  const started = await startCancellation(
    { user: booking.user, isHandOver: { $ne: true } },
    booking,
    { by: 'user', reason },
    { amount: policy.refund, kept: policy.kept, percent: policy.percent, kind: 'customer' },
  );
  if (!started) throw conflict('This booking can no longer be cancelled.');

  const { booking: after, refunded } = await settleNow(started, booking.bookingStatus);
  return {
    booking: after,
    refund: {
      amount: refunded ?? started.pendingRefund?.amount ?? policy.refund,
      percent: policy.percent,
      // "pending" only if Stripe could not be reached: the server retries it
      status: refunded === null ? 'pending' : 'refunded',
    },
  };
};

/* ------------------------------------------------------------------ */
/* Provider payout                                                     */
/* ------------------------------------------------------------------ */

/** Pay the provider for a completed booking (once): price − platform fee */
/**
 * Rental never picked up (closed as a no-show by the job): tell both sides.
 * The customer keeps nothing back (no refund); the provider is paid.
 */
const notifyNoShow = async (b: any, listing: any) => {
  const after: any = await Booking.findById(b._id).select('totalPrice refundAmount providerEarning providerPayout').lean();
  const kept = round2((Number(after?.totalPrice ?? b.totalPrice) || 0) - (Number(after?.refundAmount) || 0));
  const title = titleOf(listing);
  await notify(b.user, {
    title: 'Not picked up',
    description: `${title} was not picked up, so the booking is closed as a no-show. The ${formatMoney(kept)} payment is not refunded.`,
    data: { noShow: true, kept, currency: config.stripe.currency },
    booking: b,
    senderId: listing?.owner,
    event: 'booking.no_show',
  });
  const paid = after?.providerPayout === 'paid' && after?.providerEarning != null;
  await notify(listing?.owner, {
    title: 'Booking closed as a no-show',
    description: paid
      ? `The customer did not pick up ${title}. The booking is closed as a no-show and ${formatMoney(after.providerEarning)} is added to your wallet.`
      : `The customer did not pick up ${title}. The booking is closed as a no-show; you keep the payment.`,
    data: { noShow: true, earning: paid ? Number(after.providerEarning) : null, currency: config.stripe.currency },
    booking: b,
    senderId: b.user,
    event: 'booking.no_show',
  });
};

export const releaseProviderPayout = async (bookingId: any) => {
  const booking: any = await Booking.findOneAndUpdate(
    // only bookings completed by this lifecycle (completedAt set), and
    // never while a card dispute (chargeback) is open
    {
      _id: bookingId,
      bookingStatus: 'Completed',
      completedAt: { $exists: true },
      providerPayout: 'held',
      'dispute.status': { $ne: 'open' },
    },
    { $set: { providerPayout: 'paid' } },
    { new: true },
  ).lean();
  if (!booking) return null;
  const listing: any = await listingOfBooking(booking);
  const kept = round2((Number(booking.totalPrice) || 0) - (Number(booking.refundAmount) || 0));
  if (!listing?.owner || kept <= 0) return booking;
  await payBookingShare(booking, listing, kept);
  return booking;
};

/**
 * Pay out money the platform keeps from a booking (`kept` = all of it, or
 * the part not refunded): the service fee in it (pro rata) goes to the
 * platform in full; on the rest the provider gets the net and the platform
 * its commission. Stores the split on the booking:
 *   platformFee = commission + service fee (everything the platform keeps)
 *   providerEarning = what the provider received
 */
export const payBookingShare = async (booking: any, listing: any, kept: number) => {
  const { serviceFee, providerGross } = splitServiceFee(booking, kept, listing);
  const split = await payProvider(listing.owner, providerGross, booking.user, serviceFee);
  await Booking.updateOne(
    { _id: booking._id },
    {
      $set: {
        platformFee: split.fee,
        providerEarning: split.net,
        // remember the fee the split used (older bookings didn't store it)
        ...(booking.serviceFee === undefined || booking.serviceFee === null
          ? { serviceFee: splitServiceFee(booking, Number(booking.totalPrice) || 0, listing).serviceFee }
          : {}),
      },
    },
  );
  return split;
};

/* ------------------------------------------------------------------ */
/* Late fee (Ski Hire / Transport)                                     */
/* ------------------------------------------------------------------ */

/** Step 1: Stripe payment sheet for the late fee */
export const createLateFeeIntent = async (bookingId: string, user: JwtPayload) => {
  assertStripeConfigured();
  const { booking } = await loadForCustomer(bookingId, user);
  if (booking.lateFee?.status !== 'due' || !(Number(booking.lateFee?.amount) > 0))
    throw conflict('There is no late fee to pay for this booking.');
  const amount = round2(Number(booking.lateFee.amount));

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: toMinor(amount),
      currency: config.stripe.currency,
      automatic_payment_methods: { enabled: true },
      description: 'Late return fee',
      metadata: {
        type: 'late_fee',
        bookingId: String(booking._id),
        userId: String(booking.user),
        amount: String(amount),
      },
    });
  } catch (error: any) {
    throw new AppError(StatusCodes.BAD_GATEWAY, error?.message || 'Could not start the payment.');
  }
  await Booking.updateOne({ _id: booking._id }, { $set: { 'lateFee.paymentIntentId': intent.id } });

  return {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    publishableKey: config.stripe.publishableKey,
    amount,
    currency: config.stripe.currency,
  };
};

/** Step 2 (app or webhook): verify with Stripe and mark the fee paid (once) */
export const confirmLateFee = async (paymentIntentId: string, user?: JwtPayload) => {
  if (!String(paymentIntentId || '').startsWith('pi_'))
    throw new AppError(StatusCodes.BAD_REQUEST, 'A valid paymentIntentId is required.');
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Payment not found.');
  }
  const meta = intent.metadata || {};
  if (meta.type !== 'late_fee') throw new AppError(StatusCodes.BAD_REQUEST, 'Not a late-fee payment.');
  if (user && meta.userId !== String(user.userId))
    throw new AppError(StatusCodes.FORBIDDEN, 'This payment belongs to another user.');
  if (intent.status !== 'succeeded')
    throw new AppError(StatusCodes.PAYMENT_REQUIRED, `Payment not completed (status: ${intent.status}).`);

  const booking: any = await Booking.findOneAndUpdate(
    {
      _id: meta.bookingId,
      'lateFee.status': 'due',
      'lateFee.amount': Number(meta.amount),
    },
    { $set: { 'lateFee.status': 'paid', 'lateFee.paidAt': new Date(), 'lateFee.paymentIntentId': intent.id } },
    { new: true },
  ).lean();
  if (!booking) {
    const current: any = await Booking.findById(meta.bookingId).lean();
    if (current?.lateFee?.status === 'paid') return current; // already done (webhook / retry)
    throw conflict('This late fee is not due.');
  }
  if (intent.amount_received !== toMinor(Number(meta.amount)))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Paid amount does not match the late fee.');

  await Payment.create({
    booking: booking._id,
    user: booking.user,
    transactionId: intent.id,
    amount: Number(meta.amount),
    currency: config.stripe.currency,
    status: TransactionStatus.PAID,
    gateway: PaymentGateway.STRIPE,
    paymentMethodType: 'Card',
    purpose: 'late_fee',
  }).catch(() => null);

  const listing: any = await listingOfBooking(booking);
  if (listing?.owner) {
    const split = await payProvider(listing.owner, Number(meta.amount), booking.user);
    await Booking.updateOne(
      { _id: booking._id },
      { $set: { 'lateFee.platformFee': split.fee, 'lateFee.providerEarning': split.net } },
    );
  }
  await notify(listing?.owner, {
    title: 'Late fee paid',
    description: `The customer paid the late fee of ${formatMoney(meta.amount)} for ${titleOf(listing)}.`,
    booking,
    senderId: booking.user,
    event: 'booking.late_fee_paid',
  });
  await notify(booking.user, {
    title: 'Late fee paid',
    description: 'Thank you, your late fee is paid.',
    booking,
    event: 'booking.late_fee_paid',
  });
  emitBookingUpdated([booking.user, listing?.owner], booking, 'Completed');
  return Booking.findById(booking._id).lean();
};

/* ------------------------------------------------------------------ */
/* Automatic rules (run by the cron job every minute)                  */
/* ------------------------------------------------------------------ */

const NON_RENTALS = ['Ski_Pass', 'Massage', 'Restaurant'];

/** Not approved in time -> cancelled + full refund */
export const expireUnapproved = async (now = new Date()) => {
  const due: any[] = await Booking.find({
    bookingStatus: { $in: OPEN_STATUSES },
    isPermitted: { $ne: true },
    approvalDeadline: { $lte: now },
  })
    .select('_id')
    .limit(100)
    .lean();
  let done = 0;
  for (const b of due) {
    try {
      await cancelWithFullRefund(b._id, 'system', 'Not confirmed by the provider in time', {
        isPermitted: { $ne: true },
      });
      done++;
    } catch {
      /* claimed elsewhere or refund failed: retried next run */
    }
  }
  return done;
};

/** Finished services -> Completed + provider paid */
export const completeFinished = async (now = new Date()) => {
  // approved bookings, or old bookings created before approval existed
  const candidates: any[] = await Booking.find({
    bookingStatus: { $in: OPEN_STATUSES },
    $or: [{ isPermitted: true }, { approvalDeadline: { $exists: false } }],
    $and: [{ $or: [{ endAt: { $lte: now } }, { endAt: { $exists: false } }] }],
  })
    .limit(300)
    .lean();

  let done = 0;
  for (const b of candidates) {
    const { endAt } = computeSchedule(b);
    if (!endAt || endAt.getTime() > now.getTime()) continue;
    let set: Record<string, any> | null = null;
    let guard: Record<string, any> = {};

    if (NON_RENTALS.includes(b.category)) {
      set = { bookingStatus: 'Completed', completedAt: now };
    } else if (!b.isHandOver) {
      // rental never picked up: closed as a no-show (not refunded)
      set = { bookingStatus: 'Completed', completedAt: now, noShow: true };
      guard = { isHandOver: { $ne: true } };
    } else if (endAt.getTime() + POLICY.OVERDUE_AUTO_RETURN_HOURS * 3600000 <= now.getTime()) {
      // handed over and never returned: close it, late fee up to now
      try {
        await returnRental(String(b._id), null, now);
        done++;
      } catch {
        /* ignore */
      }
      continue;
    }
    if (!set) continue;

    const updated = await Booking.findOneAndUpdate(
      { _id: b._id, bookingStatus: { $in: OPEN_STATUSES }, ...guard },
      { $set: set },
      { new: true },
    ).lean();
    if (!updated) continue;
    done++;
    await releaseProviderPayout(b._id);
    const listing: any = await listingOfBooking(b);
    if (set.noShow) await notifyNoShow(b, listing);
    else
      await notify(b.user, {
        title: 'Booking completed',
        ...(await completedMessage(b, listing, 'We hope you enjoyed')),
        booking: b,
        event: 'booking.completed',
      });
    emitBookingUpdated([b.user, listing?.owner], b, 'Completed');
  }
  return done;
};

/** Safety net: completed bookings whose payout wasn't released */
export const releaseHeldPayouts = async () => {
  const held: any[] = await Booking.find({
    bookingStatus: 'Completed',
    completedAt: { $exists: true },
    providerPayout: 'held',
  })
    .select('_id')
    .limit(200)
    .lean();
  for (const b of held) await releaseProviderPayout(b._id);
  return held.length;
};

/** Backfill startAt/endAt on bookings created before they existed */
export const backfillSchedule = async (limit = 200) => {
  const docs: any[] = await Booking.find({ startAt: { $exists: false } }).limit(limit).lean();
  for (const b of docs) {
    const { startAt, endAt } = computeSchedule(b);
    if (startAt && endAt) await Booking.updateOne({ _id: b._id }, { $set: { startAt, endAt } });
  }
  return docs.length;
};
