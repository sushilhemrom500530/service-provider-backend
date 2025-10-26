import { Schema, model } from 'mongoose';
import { IBooking } from './booking.interface';

const bookingItemSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false }
);

const bookingSchema = new Schema<IBooking>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // This field references different product models dynamically
    productId: {
      type: Schema.Types.ObjectId,
      required: false,
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

    date: { type: Date },
    time: { type: String },

    startDateAndTime: { type: Date },
    endDateAndTime: { type: Date },

    items: [bookingItemSchema],
    orderType: { type: String },
    itemCount: { type: Number },
    duration: { type: String },
    bookingAgentText: { type: String },

    bookingStatus: {
      type: String,
      enum: ['Active', 'Pending', 'Completed', 'Cancelled', 'Deleted'],
      default: 'Pending',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Booking = model<IBooking>('Booking', bookingSchema);
