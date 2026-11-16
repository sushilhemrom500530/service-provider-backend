import { Schema, model } from 'mongoose';
import { IBooking } from './booking.interface';

const bookingItemSchema = new Schema(
  {
    itemId: {
      type: Schema.Types.ObjectId,
      ref: 'Items',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
  },
  { _id: false },
);

const bookingSchema = new Schema<IBooking>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // This field references different product models dynamically
    product: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'productModel', // tells Mongoose which model to use
    },

    // Dynamic ref name stored here
    productModel: {
      type: String,
      required: true,
      enum: ['SkiPass', 'SkiHire', 'Transport', 'Restaurant', 'Massage'],
    },

    category: {
      type: String,
      required: true,
      enum: ['Ski_Pass', 'Ski_Hire', 'Transport', 'Restaurant', 'Massage'],
    },

    personCount: { type: Number },
    ticketNumber: { type: String },

    date: { type: Date },
    time: { type: String },

    startDateAndTime: { type: Date },
    endDateAndTime: { type: Date },

    bookingItems: [bookingItemSchema],

    bookingSeatCount: { type: Number },
    slots: [
      {
        type: Schema.Types.ObjectId,
        ref: 'slots',
        required: true,
      },
    ],
    duration: { type: String },
    bookingAgentText: { type: String }, // For booking agent

    bookingStatus: {
      type: String,
      enum: ['Active', 'Pending', 'Completed', 'Cancelled', 'Deleted'],
      default: 'Active',
      required: true,
    },

    totalPrice: {
      type: Number,
      required: true,
    },

    phoneNumber: {
      type: String,
    },
    address: {
      type: String,
    },
    destination: {
      type: String,
    },

    isPermitted: {
      type: Boolean,
      default: false,
    },
    isHandOver: {
      type: Boolean,
      default: false,
    },

    // ---------- booking lifecycle (approval / hand-over / payout) ----------
    // provider must approve before this time, otherwise the booking expires
    // and is refunded (only set on bookings that need approval)
    approvalDeadline: { type: Date },
    approvedAt: { type: Date },
    // equipment / vehicle given to the customer, and returned
    handedOverAt: { type: Date },
    returnedAt: { type: Date },
    // late return, recorded when the provider completes the booking
    overTimeHours: { type: Number },
    overTimeCharge: { type: Number },
    // who cancelled and why (reject, expiry, customer)
    cancelledBy: {
      type: String,
      enum: ['user', 'provider', 'admin', 'system'],
    },
    cancelReason: { type: String },
    // provider money: held until the booking is completed
    // (empty on old bookings = paid to the provider at payment time)
    providerPayout: {
      type: String,
      enum: ['held', 'paid', 'reversed'],
    },
    // platform fee (admin profitCharge %) taken when the provider was paid,
    // and what the provider actually received
    platformFee: { type: Number },
    providerEarning: { type: Number },

    // ---------- normalised schedule (every category) ----------
    // when the service starts / ends, used by jobs, tabs and timers
    startAt: { type: Date },
    endAt: { type: Date },
    // restaurant: the booked slot's times (kept even if the listing changes)
    slotTime: {
      startTime: { type: String },
      endTime: { type: String },
    },
    // rental never picked up: completed automatically, not refunded
    noShow: { type: Boolean },
    // refund paid to the customer (customer cancel / reject / expiry)
    refundAmount: { type: Number },
    refundedAt: { type: Date },
    cancelledAt: { type: Date },
    completedAt: { type: Date },
    // late return of a rental (Ski Hire / Transport)
    lateFee: {
      hours: { type: Number },
      amount: { type: Number },
      status: { type: String, enum: ['none', 'due', 'paid'] },
      paymentIntentId: { type: String },
      paidAt: { type: Date },
      platformFee: { type: Number },
      providerEarning: { type: Number },
    },
    // card dispute / chargeback opened by the customer's bank
    dispute: {
      status: { type: String, enum: ['open', 'won', 'lost'] },
      amount: { type: Number },
      reason: { type: String },
      openedAt: { type: Date },
      closedAt: { type: Date },
      // provider money taken back while the dispute is open
      recoveredNet: { type: Number },
      recoveredFee: { type: Number },
    },
  },
  {
    timestamps: true,
  },
);

bookingSchema.index({ product: 1, bookingStatus: 1, startAt: 1 });
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ bookingStatus: 1, approvalDeadline: 1 });
bookingSchema.index({ bookingStatus: 1, endAt: 1 });

export const Booking = model<IBooking>('Booking', bookingSchema);
