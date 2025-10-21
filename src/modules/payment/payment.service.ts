import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import Payment from './payment.model';
import Booking from '../booking/booking.model';
import { IPayment, PaymentGateway, TransactionStatus } from './payment.interface';
import { IPaginationOptions } from '../../types/pagination';
import { BookingService } from '../booking/booking.service';
import { PaymentStatus, PaymentMethod } from '../booking/booking.interface';

// Create a payment record
const createPayment = async (payload: IPayment) => {
  // Validate booking exists
  const booking = await Booking.findById(payload.bookingId);
  if (!booking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found');
  }
  
  // Set user from booking
  payload.userId = booking.userId;
  
  // Create the payment
  const result = await Payment.create(payload);
  return result;
};

// Process PayPal payment
const processPayPalPayment = async (
  bookingId: string,
  paypalOrderId: string,
  transactionId: string
) => {
  // Validate booking exists
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found');
  }
  
  // Create payment record
  const paymentPayload: IPayment = {
    bookingId: new Types.ObjectId(bookingId),
    userId: booking.userId,
    amount: booking.totalPrice || 0,
    currency: booking.currency,
    paymentMethod: PaymentGateway.PAYPAL,
    paypalOrderId,
    transactionId,
    status: TransactionStatus.COMPLETED,
  };
  
  const payment = await createPayment(paymentPayload);
  
  // Update booking payment status
  await BookingService.updatePaymentStatus(bookingId, PaymentStatus.PAID, {
    paymentMethod: PaymentMethod.PAYPAL,
    paymentId: payment._id?.toString(),
    paymentIntentId: paypalOrderId,
  });
  
  return payment;
};

// Process Zelle payment
const processZellePayment = async (
  bookingId: string,
  zelleReference: string
) => {
  // Validate booking exists
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found');
  }
  
  // Create payment record
  const paymentPayload: IPayment = {
    bookingId: new Types.ObjectId(bookingId),
    userId: booking.userId,
    amount: booking.totalPrice || 0,
    currency: booking.currency,
    paymentMethod: PaymentGateway.ZELLE,
    zelleReference,
    status: TransactionStatus.PENDING, // Zelle payments need manual verification
  };
  
  const payment = await createPayment(paymentPayload);
  
  // Update booking payment status
  await BookingService.updatePaymentStatus(bookingId, PaymentStatus.PENDING, {
    paymentMethod: PaymentMethod.ZELLE,
    paymentId: payment._id?.toString(),
    zelleReference,
  });
  
  return payment;
};

// Process refund for a payment
const processRefund = async (paymentId: string, refundAmount?: number) => {
  // Get payment details
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Payment not found');
  }
  
  // If no refund amount specified, refund the full amount
  const amountToRefund = refundAmount || payment.amount;
  
  // Process refund based on payment method
  if (payment.paymentMethod === PaymentGateway.PAYPAL) {
    // For PayPal, this would call the PayPal refund API
    // In a real implementation, you would process the actual refund through PayPal
    console.log(`Processing PayPal refund for ${amountToRefund} ${payment.currency}`);
  } else if (payment.paymentMethod === PaymentGateway.ZELLE) {
    // For Zelle, this would involve manual processing
    console.log(`Processing manual Zelle refund for ${amountToRefund} ${payment.currency}`);
  }
  
  // Update payment status to refunded
  const updatedPayment = await Payment.findByIdAndUpdate(
    paymentId,
    { 
      status: TransactionStatus.REFUNDED,
      amount: amountToRefund // Store the refunded amount
    },
    { new: true }
  );
  
  if (!updatedPayment) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Payment not found');
  }
  
  // Update booking payment status
  await BookingService.updatePaymentStatus(
    payment.bookingId.toString(),
    PaymentStatus.REFUNDED
  );
  
  return updatedPayment;
};

// Get all payments with pagination
const getAllPayments = async (
  filters: Record<string, any> = {},
  paginationOptions: IPaginationOptions = {}
) => {
  const defaultOptions: IPaginationOptions = {
    page: 1,
    limit: 10,
    sortBy: '-createdAt',
    populate: [
      {
        path: 'booking',
        select: 'serviceId bookingDate bookingTime totalPrice',
      },
      {
        path: 'user',
        select: 'firstName lastName email',
      },
    ],
  };
  
  const options = { ...defaultOptions, ...paginationOptions };
  
  const result = await Payment.paginate(filters, options);
  return result;
};

// Get payments by user
const getUserPayments = async (
  userId: string,
  paginationOptions: IPaginationOptions = {}
) => {
  const defaultOptions: IPaginationOptions = {
    page: 1,
    limit: 10,
    sortBy: '-createdAt',
    populate: [
      {
        path: 'booking',
        select: 'serviceId bookingDate bookingTime totalPrice',
      },
    ],
  };
  
  const options = { ...defaultOptions, ...paginationOptions };
  const filters = { userId: new Types.ObjectId(userId) };
  
  const result = await Payment.paginate(filters, options);
  return result;
};

// Get payment by ID
const getPaymentById = async (id: string) => {
  const payment = await Payment.findById(id)
    .populate([
      {
        path: 'booking',
        select: 'serviceId bookingDate bookingTime totalPrice status',
      },
      {
        path: 'user',
        select: 'firstName lastName email',
      },
    ]);
  
  if (!payment) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Payment not found');
  }
  
  return payment;
};

export const PaymentService = {
  createPayment,
  processPayPalPayment,
  processZellePayment,
  processRefund,
  getAllPayments,
  getUserPayments,
  getPaymentById,
};