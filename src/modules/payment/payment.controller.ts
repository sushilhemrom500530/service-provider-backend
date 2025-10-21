import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { Request, Response } from 'express';
import { PaymentService } from './payment.service';
import { IPayment } from './payment.interface';
import pick from '../../shared/pick';

// Process PayPal payment
const processPayPalPayment = catchAsync(async (req: Request, res: Response) => {
  const { bookingId, paypalOrderId, transactionId } = req.body;
  
  const result = await PaymentService.processPayPalPayment(
    bookingId,
    paypalOrderId,
    transactionId
  );
  
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'PayPal payment processed successfully',
    data: result,
  });
});

// Process Zelle payment
const processZellePayment = catchAsync(async (req: Request, res: Response) => {
  const { bookingId, zelleReference } = req.body;
  
  const result = await PaymentService.processZellePayment(bookingId, zelleReference);
  
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Zelle payment processed successfully. Awaiting confirmation.',
    data: result,
  });
});

// Process refund (Admin only)
const processRefund = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { refundAmount } = req.body;
  
  const result = await PaymentService.processRefund(id, refundAmount);
  
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Refund processed successfully',
    data: result,
  });
});

// Get all payments (Admin only)
const getAllPayments = catchAsync(async (req: Request, res: Response) => {
  const filters = req.query;
  const paginationOptions = pick(req.query, [
    'page',
    'limit',
    'sortBy',
    'populate',
  ]);
  
  const result = await PaymentService.getAllPayments(filters, paginationOptions);
  
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Payments fetched successfully',
    data: result,
  });
});

// Get current user's payments
const getUserPayments = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.userId;
  const paginationOptions = pick(req.query, [
    'page',
    'limit',
    'sortBy',
    'populate',
  ]);
  
  const result = await PaymentService.getUserPayments(userId, paginationOptions);
  
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'User payments fetched successfully',
    data: result,
  });
});

// Get payment by ID
const getPaymentById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const result = await PaymentService.getPaymentById(id);
  
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Payment fetched successfully',
    data: result,
  });
});

export const PaymentController = {
  processPayPalPayment,
  processZellePayment,
  processRefund,
  getAllPayments,
  getUserPayments,
  getPaymentById,
};