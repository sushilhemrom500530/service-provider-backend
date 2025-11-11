import { generateTransactionId } from './../../utils/generateTransactionId';
import stripe from './../../utils/stripe';
import { config } from './../../config/index';
import { updateOrCreateWallet } from './../wallet/wallet.service';
import { Types } from 'mongoose';
import { Payment } from './../payment/payment.model';
import {
  TransactionStatus,
  PaymentGateway,
  IPayment,
} from '../payment/payment.interface';

interface IProcessPaymentPayload {
  bookingId: string;
  userId: string;
  amount: number;
  currency?: string;
  category?: string;
  ownerId?: string;
}

export const processToPayment = async (payload: IProcessPaymentPayload) => {
  const {
    bookingId,
    userId,
    amount,
    currency = 'usd',
    category,
    ownerId,
  } = payload;

  // Generate unique transaction ID
  const transactionId = generateTransactionId();

  // Create a Stripe Checkout session
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: category || 'Booking Payment',
              description: `Booking ID: ${bookingId}`,
            },
            unit_amount: Math.round(amount * 100), // Stripe expects cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${config.client.url}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.client.url}/payment/cancel`,
      metadata: {
        bookingId: bookingId.toString(),
        userId: userId.toString(),
        transactionId: transactionId.toString(),
        amount: amount.toString(),
        currency: currency.toString(),
      },
    });

    const paymentPayload: IPayment = {
      booking: new Types.ObjectId(bookingId),
      user: new Types.ObjectId(userId),
      amount,
      currency,
      transactionId,
      sessionId: session?.id,
      status: TransactionStatus.PENDING,
      gateway: PaymentGateway.STRIPE,
      paymentMethodType: 'Card',
    };
    // create payment
    await Payment.create(paymentPayload);

    // create wallet or update
    // await updateOrCreateWallet(ownerId, userId, amount);

    return {
      sessionId: session.id,
      sessionUrl: session.url,
    };
  } catch (error) {
    throw new Error(error);
  }
};
