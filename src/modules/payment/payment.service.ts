 import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import Payment from './payment.model';
import {
  IPayment,
  TransactionStatus,
  PaymentGateway,
} from './payment.interface';
import { Booking } from '../booking/booking.model';
import { generateTransactionId } from '../../utils/generateTransactionId';
import stripe from '../../utils/stripe';
import { config } from '../../config';
import { PaymentStatus, PaymentMethod } from '../booking/booking.interface';

interface IProcessPaymentPayload {
  bookingId: string;
  userId: string;
  amount: number;
  currency?: string;
}
 
const processToPayment = async (payload: IProcessPaymentPayload) => {
  const { bookingId, userId, amount, currency = 'usd' } = payload;

 
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found');
  }

  //  Generate unique transaction ID
  const transactionId = generateTransactionId();

  //  Create a Stripe Checkout session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: booking?.productName || 'Booking Payment',
            description: `Booking ID: ${booking._id}`,
          },
          unit_amount: Math.round(amount * 100), // Stripe expects amount in cents
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${config.client.url}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.client.url}/payment/cancel`,
    metadata: {
      bookingId: booking._id.toString(),
      userId,
      transactionId,
    },
  });

  const paymentPayload: IPayment = {
    booking: new Types.ObjectId(bookingId),
    user: new Types.ObjectId(userId),
    amount,
    currency,
    transactionId,
    status: TransactionStatus.PENDING,
    gateway: PaymentGateway.STRIPE,
  };

  // await Payment.create(paymentPayload);
 
  return {
    sessionId: session.id,
    sessionUrl: session.url,
    paymentPayload
  };
};

export const PaymentService = {
  processToPayment,
};
