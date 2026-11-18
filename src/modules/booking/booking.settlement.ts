/**
 * Money corrections after the fact. They keep the platform, the provider and
 * the customer in sync whatever happens outside the normal flow:
 *
 *  - Admin refund (complaint resolved): full or partial, any booking state.
 *  - Refund made directly in the Stripe dashboard (webhook refund.created).
 *  - Card dispute / chargeback (webhooks charge.dispute.created / closed):
 *    the provider's share is frozen (or taken back) until the bank decides.
 *
 * Rule for the provider: they only ever keep their share of money the
 * platform actually keeps.
 */
import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errors/AppErro';
import { Booking } from './booking.model';
import { Payment } from '../payment/payment.model';
import { TransactionStatus } from '../payment/payment.interface';
import { WalletTransactionType } from '../wallet/wallet.interface';
import { changeBalance, getAdminUserId } from '../wallet/ledger';
import { notify, emitBookingUpdated } from '../notification/notify';
import { User } from '../user/user.model';
import { OPEN_STATUSES, computeSchedule, formatBookingWhen, formatMoney } from './booking.rules';
import { listingOfBooking, payBookingShare, recordRefund, refundBookingPayment, settleCancellation } from './booking.lifecycle';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const notifyAdmins = async (title: string, description: string, booking: any, event: string) => {
  const admins = await User.find({ role: 'Admin' }).select('_id').lean();
  for (const a of admins) await notify(a._id, { title, description, booking, event, type: 'booking' });
};

/**
 * Account for `amount` that went back to the customer (already sent to the
 * card by the caller). Open booking -> cancelled; provider's share adjusted.
 */
const accountRefund = async (booking: any, amount: number, by: 'admin' | 'system', reason?: string) => {
  const listing: any = await listingOfBooking(booking);
  const total = round2(booking.totalPrice);
  const refundedBefore = round2(booking.refundAmount);
  const refundedNow = round2(Math.min(amount, total - refundedBefore));
  const refundedAfter = round2(refundedBefore + refundedNow);
  const set: Record<string, any> = { refundAmount: refundedAfter, refundedAt: new Date() };

  if (OPEN_STATUSES.includes(booking.bookingStatus)) {
    Object.assign(set, {
      bookingStatus: 'Cancelled',
      cancelledBy: by === 'system' ? 'admin' : by,
      cancelReason: reason,
      cancelledAt: new Date(),
    });
  }

  if (booking.providerPayout === 'held') {
    // provider not paid yet: an open booking settles now on what is left
    if (set.bookingStatus === 'Cancelled') {
      const kept = round2(total - refundedAfter);
      if (kept > 0 && listing?.owner) {
        // the service fee in what is kept stays with the platform
        await payBookingShare(booking, listing, kept);
        set.providerPayout = 'paid';
      } else set.providerPayout = 'reversed';
    }
    // completed + held (e.g. dispute): release later pays total − refundAmount
  } else if (booking.providerPayout !== 'reversed' && listing?.owner && refundedNow > 0) {
    // provider was already paid: take back their share of the refunded part
    const share = total > 0 ? refundedNow / total : 0;
    const net = round2((Number(booking.providerEarning ?? total) || 0) * share);
    const fee = round2((Number(booking.platformFee) || 0) * share);
    await changeBalance(listing.owner, -net, WalletTransactionType.SEND, booking.user);
    if (fee > 0) {
      const adminId = await getAdminUserId();
      if (adminId) await changeBalance(adminId, -fee, WalletTransactionType.SEND, listing.owner);
    }
    Object.assign(set, {
      providerEarning: round2((Number(booking.providerEarning ?? total) || 0) - net),
      platformFee: round2((Number(booking.platformFee) || 0) - fee),
      ...(refundedAfter >= total ? { providerPayout: 'reversed' } : {}),
    });
  }

  await Booking.updateOne({ _id: booking._id }, { $set: set });

  const when = formatBookingWhen(booking);
  const on = when ? ` on ${when}` : '';
  const startAt = computeSchedule(booking).startAt ?? null;
  await notify(booking.user, {
    title: 'Refund issued',
    description: `${formatMoney(refundedNow)} has been refunded to your card for ${listing?.title || 'your booking'}${on}.${reason ? ` ${reason}` : ''}`,
    data: { startAt, refunded: refundedNow },
    booking,
    event: 'booking.refunded',
  });
  await notify(listing?.owner, {
    title: 'Booking refunded',
    description: `${formatMoney(refundedNow)} of a booking for ${listing?.title || 'your listing'}${on} was refunded to the customer.${reason ? ` Reason: ${reason}` : ''}`,
    data: { startAt, refunded: refundedNow },
    booking,
    event: 'booking.refunded',
  });
  emitBookingUpdated([booking.user, listing?.owner], booking, set.bookingStatus ? 'Cancelled' : 'Completed');
  return Booking.findById(booking._id).lean();
};

/** PATCH /booking/:id/admin-refund { amount?, reason } (admin) */
export const adminRefund = async (bookingId: string, user: JwtPayload, amount?: unknown, reason?: string) => {
  if (user.role !== 'Admin') throw new AppError(StatusCodes.FORBIDDEN, 'Admins only.');
  if (!Types.ObjectId.isValid(String(bookingId)))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid booking id.');
  const booking: any = await Booking.findById(bookingId).lean();
  if (!booking) throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');

  const remaining = round2(round2(booking.totalPrice) - round2(booking.refundAmount));
  if (remaining <= 0) throw new AppError(StatusCodes.CONFLICT, 'This booking is already fully refunded.');
  const value = amount === undefined || amount === null || amount === '' ? remaining : round2(Number(amount));
  if (!(value > 0) || value > remaining)
    throw new AppError(StatusCodes.BAD_REQUEST, `amount must be between 0.01 and ${remaining}.`);

  // send to the card first; nothing changes if Stripe refuses
  const sent = await refundBookingPayment(booking, value);
  if (sent <= 0) throw new AppError(StatusCodes.CONFLICT, 'Nothing left to refund on this payment.');
  return accountRefund(booking, sent, 'admin', reason || 'Refunded by support.');
};

/* ------------------------------------------------------------------ */
/* Stripe webhooks                                                     */
/* ------------------------------------------------------------------ */

const bookingOfIntent = async (paymentIntentId: unknown) => {
  if (!paymentIntentId) return { payment: null as any, booking: null as any };
  const payment: any = await Payment.findOne({ transactionId: String(paymentIntentId) }).lean();
  const booking: any = payment ? await Booking.findById(payment.booking).lean() : null;
  return { payment, booking };
};

/** refund.created made OUTSIDE the app (Stripe dashboard): account for it */
export const onExternalRefund = async (refund: any) => {
  const { payment, booking } = await bookingOfIntent(refund?.payment_intent);
  if (!payment || !booking || payment.purpose === 'late_fee') return { handled: false };
  const amount = round2((Number(refund.amount) || 0) / 100);
  if (amount <= 0) return { handled: false };

  if (refund?.metadata?.source === 'app') {
    // made by the app: normally already counted. If the server stopped right
    // after Stripe answered, count it now and finish the cancellation.
    if (!refund?.id) return { handled: false };
    const counted = await recordRefund(payment._id, refund.id, amount);
    if (booking.pendingRefund) await settleCancellation(booking._id).catch(() => null);
    return { handled: counted };
  }
  // Stripe resends webhooks: count each dashboard refund once (by refund id)
  const refundId = refund?.id || `re-external-${payment._id}-${Date.now()}`;
  if (!(await recordRefund(payment._id, refundId, amount))) return { handled: false };
  await accountRefund(booking, amount, 'system', 'Refunded by support.');
  return { handled: true };
};

/** charge.dispute.created: freeze / take back the provider's share */
export const onDisputeOpened = async (dispute: any) => {
  const { payment, booking } = await bookingOfIntent(dispute?.payment_intent);
  if (!booking || payment?.purpose === 'late_fee') return { handled: false };
  if (booking.dispute?.status === 'open') return { handled: false };

  const listing: any = await listingOfBooking(booking);
  const set: Record<string, any> = {
    dispute: {
      status: 'open',
      amount: round2((Number(dispute.amount) || 0) / 100),
      reason: dispute.reason,
      openedAt: new Date(),
    },
  };
  if (booking.providerPayout !== 'held' && booking.providerPayout !== 'reversed' && listing?.owner) {
    const net = round2(booking.providerEarning ?? booking.totalPrice);
    const fee = round2(booking.platformFee);
    await changeBalance(listing.owner, -net, WalletTransactionType.SEND, booking.user);
    if (fee > 0) {
      const adminId = await getAdminUserId();
      if (adminId) await changeBalance(adminId, -fee, WalletTransactionType.SEND, listing.owner);
    }
    set.dispute.recoveredNet = net;
    set.dispute.recoveredFee = fee;
  }
  await Booking.updateOne({ _id: booking._id }, { $set: set });

  await notify(listing?.owner, {
    title: 'Payment disputed',
    description: `The customer's bank disputed a payment for ${listing?.title || 'your listing'}. Your earning for it is on hold until the bank decides.`,
    booking,
    event: 'booking.disputed',
  });
  await notifyAdmins('Card dispute opened', `Booking ${booking._id}: ${dispute.reason || 'dispute'} (${formatMoney(set.dispute.amount)}). Answer it in Stripe.`, booking, 'booking.disputed');
  return { handled: true };
};

/** charge.dispute.closed: won -> provider gets the money back; lost -> refund recorded */
export const onDisputeClosed = async (dispute: any) => {
  const { booking } = await bookingOfIntent(dispute?.payment_intent);
  if (!booking || booking.dispute?.status !== 'open') return { handled: false };
  const won = dispute.status === 'won';
  const listing: any = await listingOfBooking(booking);

  await Booking.updateOne(
    { _id: booking._id, 'dispute.status': 'open' },
    { $set: { 'dispute.status': won ? 'won' : 'lost', 'dispute.closedAt': new Date() } },
  );

  if (won) {
    const net = round2(booking.dispute?.recoveredNet);
    const fee = round2(booking.dispute?.recoveredFee);
    if (net > 0 && listing?.owner) await changeBalance(listing.owner, net, WalletTransactionType.RECEIVE, booking.user);
    if (fee > 0) {
      const adminId = await getAdminUserId();
      if (adminId) await changeBalance(adminId, fee, WalletTransactionType.RECEIVE, listing?.owner);
    }
  } else {
    // the bank returned the money to the customer
    const lost = round2((Number(dispute.amount) || 0) / 100);
    const set: Record<string, any> = {
      refundAmount: round2(round2(booking.refundAmount) + lost),
      refundedAt: new Date(),
      providerPayout: 'reversed',
    };
    if (OPEN_STATUSES.includes(booking.bookingStatus))
      Object.assign(set, { bookingStatus: 'Cancelled', cancelledBy: 'admin', cancelReason: 'Card dispute lost', cancelledAt: new Date() });
    // provider share was already taken back when the dispute opened
    if (!booking.dispute?.recoveredNet && booking.providerPayout === 'paid' && listing?.owner)
      await changeBalance(listing.owner, -round2(booking.providerEarning), WalletTransactionType.SEND, booking.user);
    await Booking.updateOne({ _id: booking._id }, { $set: set });
  }

  await notify(listing?.owner, {
    title: won ? 'Dispute won' : 'Dispute lost',
    description: won
      ? `The bank decided in your favour; your earning for ${listing?.title || 'the booking'} is released.`
      : `The bank refunded the customer for ${listing?.title || 'the booking'}.`,
    booking,
    event: won ? 'booking.dispute_won' : 'booking.dispute_lost',
  });
  emitBookingUpdated([booking.user, listing?.owner], booking, 'Completed');
  return { handled: true };
};
