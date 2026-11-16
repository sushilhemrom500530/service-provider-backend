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
import {
  OPEN_STATUSES,
  POLICY,
  computeLateFee,
  computeSchedule,
  customerCancelRefund,
  deriveStatus,
  isRental,
} from './booking.rules';
import { assertStripeConfigured } from './booking.create';

const round2 = (n: number) => Math.round(n * 100) / 100;
const toMinor = (amount: number) => Math.round(Number(amount) * 100);
const conflict = (m: string) => new AppError(StatusCodes.CONFLICT, m);

/* ------------------------------------------------------------------ */
/* Loading + access                                                    */
/* ------------------------------------------------------------------ */

export const listingOfBooking = async (b: any) => {
  const category = b?.category || MODEL_TO_CATEGORY[b?.productModel];
  const entry = LISTING_MODELS[category];
  if (!entry) return null;
  return entry.model.findById(b.product).lean();
};

/** Booking + its listing; checks the caller may act as provider (owner or Admin) */
export const loadForProvider = async (bookingId: string, user: JwtPayload) => {
  if (!Types.ObjectId.isValid(String(bookingId)))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid booking id.');
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

/**
 * Refund `amount` of the booking payment to the customer.
 * Stripe payments go back to the card; old non-Stripe payments go to the
 * in-app wallet. Throws 502 if Stripe refuses.
 */
export const refundBookingPayment = async (booking: any, amount: number) => {
  const value = round2(amount);
  if (value <= 0) return 0;
  const payment: any = await Payment.findOne({
    booking: booking._id,
    purpose: { $ne: 'late_fee' },
  });
  const total = round2(Number(payment?.amount ?? booking.totalPrice) || 0);
  const already = round2(Number(payment?.refundedAmount) || 0);
  const refundable = round2(Math.min(value, total - already));
  if (refundable <= 0) return 0;

  const tx = String(payment?.transactionId || booking.transactionId || '');
  if (tx.startsWith('pi_')) {
    try {
      await stripe.refunds.create({
        payment_intent: tx,
        ...(refundable < total - already ? { amount: toMinor(refundable) } : {}),
        // tells the webhook this refund was made (and accounted) by the app
        metadata: { source: 'app', bookingId: String(booking._id) },
      });
    } catch (error: any) {
      throw new AppError(
        StatusCodes.BAD_GATEWAY,
        `The refund could not be sent to the card: ${error?.message || 'Stripe error'}. Nothing was changed.`,
      );
    }
  } else {
    await changeBalance(booking.user, refundable, WalletTransactionType.RECEIVE, booking.user);
  }

  if (payment) {
    const refundedAmount = round2(already + refundable);
    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: {
          refundedAmount,
          refundedAt: new Date(),
          status:
            refundedAmount >= total
              ? TransactionStatus.REFUNDED
              : TransactionStatus.PARTIALLY_REFUNDED,
        },
      },
    );
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

/**
 * Cancel with a FULL refund: provider reject, admin cancel, approval expiry.
 * Refund first; if the card refund fails the booking is put back as it was.
 */
export const cancelWithFullRefund = async (
  bookingId: any,
  cancelledBy: 'provider' | 'admin' | 'system',
  reason?: string,
  extraGuard: Record<string, any> = {},
) => {
  const before: any = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      bookingStatus: { $in: OPEN_STATUSES },
      isHandOver: { $ne: true },
      ...extraGuard,
    },
    {
      $set: {
        bookingStatus: 'Cancelled',
        cancelledBy,
        cancelReason: reason,
        cancelledAt: new Date(),
      },
    },
    { new: false },
  ).lean();
  if (!before) throw conflict('This booking can no longer be cancelled.');

  const listing: any = await listingOfBooking(before);
  let refunded = 0;
  try {
    refunded = await refundBookingPayment(before, Number(before.totalPrice) || 0);
  } catch (error) {
    await Booking.updateOne(
      { _id: before._id },
      {
        $set: { bookingStatus: before.bookingStatus },
        $unset: { cancelledBy: '', cancelReason: '', cancelledAt: '' },
      },
    );
    throw error;
  }

  await undoProviderPayout(before, listing?.owner);
  await Booking.updateOne(
    { _id: before._id },
    { $set: { providerPayout: 'reversed', refundAmount: refunded, refundedAt: new Date() } },
  );

  const what = cancelledBy === 'system' ? 'expired (not confirmed in time)' : 'was cancelled by the provider';
  await notify(before.user, {
    title: cancelledBy === 'system' ? 'Booking expired' : 'Booking cancelled',
    description: `${titleOf(listing)} ${what}. ${refunded} ${config.stripe.currency.toUpperCase()} is refunded to your card.${reason ? ` Reason: ${reason}` : ''}`,
    booking: before,
    senderId: listing?.owner,
    event: cancelledBy === 'system' ? 'booking.expired' : 'booking.rejected',
  });
  if (cancelledBy === 'system')
    await notify(listing?.owner, {
      title: 'Booking expired',
      description: `A booking for ${titleOf(listing)} was not confirmed in time and has been refunded.`,
      booking: before,
      event: 'booking.expired',
    });
  emitBookingUpdated([before.user, listing?.owner], before, 'Cancelled');
  return Booking.findById(before._id).lean();
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

  await notify(booking.user, {
    title: 'Booking confirmed',
    description: `${titleOf(listing)} has been confirmed by the provider.`,
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
    description: `${titleOf(listing)} has been handed over to you. Please return it by ${endAt?.toISOString()}.`,
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

  await notify(booking.user, {
    title: fee.amount > 0 ? 'Late return fee' : 'Rental completed',
    description:
      fee.amount > 0
        ? `${titleOf(theListing)} was returned ${fee.hours} h late. Late fee: ${fee.amount} ${config.stripe.currency.toUpperCase()}. Please pay it in the app.`
        : `Thanks! ${titleOf(theListing)} has been returned.`,
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
    description: `Thanks for visiting ${titleOf(listing)}. You can now leave a review.`,
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
  const { booking, listing } = await loadForCustomer(bookingId, user);
  const status = deriveStatus(booking);
  const { startAt } = computeSchedule(booking);
  if (status !== 'Pending' && status !== 'Confirmed')
    throw conflict(`This booking is ${status} and can't be cancelled.`);
  if (booking.isHandOver || (startAt && startAt.getTime() <= Date.now()))
    throw conflict('This booking has already started and can no longer be cancelled.');

  const policy = customerCancelRefund(booking);

  const before: any = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      user: booking.user,
      bookingStatus: { $in: OPEN_STATUSES },
      isHandOver: { $ne: true },
    },
    {
      $set: {
        bookingStatus: 'Cancelled',
        cancelledBy: 'user',
        cancelReason: reason,
        cancelledAt: new Date(),
      },
    },
    { new: false },
  ).lean();
  if (!before) throw conflict('This booking can no longer be cancelled.');

  let refunded = 0;
  try {
    refunded = await refundBookingPayment(before, policy.refund);
  } catch (error) {
    await Booking.updateOne(
      { _id: before._id },
      {
        $set: { bookingStatus: before.bookingStatus },
        $unset: { cancelledBy: '', cancelReason: '', cancelledAt: '' },
      },
    );
    throw error;
  }

  // provider money: keeps the non-refunded part (minus the platform fee)
  const set: Record<string, any> = { refundAmount: refunded, refundedAt: new Date() };
  if (before.providerPayout === 'held') {
    if (policy.kept > 0 && listing?.owner) {
      const split = await payProvider(listing.owner, policy.kept, before.user);
      Object.assign(set, { providerPayout: 'paid', platformFee: split.fee, providerEarning: split.net });
    } else set.providerPayout = 'reversed';
  } else if (before.providerPayout !== 'reversed' && listing?.owner && refunded > 0) {
    // old bookings: the provider was credited the full price at payment
    await changeBalance(listing.owner, -refunded, WalletTransactionType.SEND, before.user);
  }
  await Booking.updateOne({ _id: before._id }, { $set: set });

  await notify(before.user, {
    title: 'Booking cancelled',
    description: `${refunded} ${config.stripe.currency.toUpperCase()} (${policy.percent}%) is refunded to your card.`,
    booking: before,
    event: 'booking.cancelled',
  });
  await notify(listing?.owner, {
    title: 'Booking cancelled by customer',
    description: `A booking for ${titleOf(listing)} was cancelled by the customer.${reason ? ` Reason: ${reason}` : ''}`,
    booking: before,
    senderId: before.user,
    event: 'booking.cancelled',
  });
  emitBookingUpdated([before.user, listing?.owner], before, 'Cancelled');
  return { booking: await Booking.findById(before._id).lean(), refund: { amount: refunded, percent: policy.percent } };
};

/* ------------------------------------------------------------------ */
/* Provider payout                                                     */
/* ------------------------------------------------------------------ */

/** Pay the provider for a completed booking (once): price − platform fee */
export const releaseProviderPayout = async (bookingId: any) => {
  const booking: any = await Booking.findOneAndUpdate(
    // never pay out while a card dispute (chargeback) is open
    { _id: bookingId, bookingStatus: 'Completed', providerPayout: 'held', 'dispute.status': { $ne: 'open' } },
    { $set: { providerPayout: 'paid' } },
    { new: true },
  ).lean();
  if (!booking) return null;
  const listing: any = await listingOfBooking(booking);
  const gross = round2((Number(booking.totalPrice) || 0) - (Number(booking.refundAmount) || 0));
  if (!listing?.owner || gross <= 0) return booking;
  const split = await payProvider(listing.owner, gross, booking.user);
  await Booking.updateOne(
    { _id: booking._id },
    { $set: { platformFee: split.fee, providerEarning: split.net } },
  );
  return booking;
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
    description: `The customer paid the late fee of ${meta.amount} ${config.stripe.currency.toUpperCase()} for ${titleOf(listing)}.`,
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
    if (!set.noShow)
      await notify(b.user, {
        title: 'Booking completed',
        description: `We hope you enjoyed ${titleOf(listing)}. You can now leave a review.`,
        booking: b,
        event: 'booking.completed',
      });
    emitBookingUpdated([b.user, listing?.owner], b, 'Completed');
  }
  return done;
};

/** Safety net: completed bookings whose payout wasn't released */
export const releaseHeldPayouts = async () => {
  const held: any[] = await Booking.find({ bookingStatus: 'Completed', providerPayout: 'held' })
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
