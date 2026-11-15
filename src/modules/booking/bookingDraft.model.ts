import { Schema, model, Types } from 'mongoose';

/**
 * The booking request saved by POST /booking/intent, keyed by its Stripe
 * PaymentIntent. It lets the Stripe webhook create the booking when the app
 * is closed after paying, and makes sure only ONE booking is created per
 * payment when the app and the webhook both try.
 *
 *  pending    -> created with the PaymentIntent, not paid/booked yet
 *  processing -> someone (app or webhook) is creating the booking now
 *  completed  -> booking created (see `booking`)
 *  failed     -> booking rejected after payment, payment refunded
 */
export type BookingDraftStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IBookingDraft {
  paymentIntentId: string;
  user: Types.ObjectId;
  userEmail: string;
  payload: Record<string, any>;
  status: BookingDraftStatus;
  booking?: Types.ObjectId;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const bookingDraftSchema = new Schema<IBookingDraft>(
  {
    paymentIntentId: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userEmail: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking' },
    error: { type: String },
  },
  { timestamps: true, minimize: false },
);

// drafts are only needed around the payment; remove them after 30 days
bookingDraftSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const BookingDraft = model<IBookingDraft>('BookingDraft', bookingDraftSchema);
