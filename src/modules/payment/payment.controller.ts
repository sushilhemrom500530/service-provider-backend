import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { Request, Response } from 'express';
import { IPayment } from './payment.interface';
import pick from '../../shared/pick';
import { PaymentService } from './payment.service';
import { Wallet } from './../wallet/wallet.model';

// Process PayPal payment
const getAllPayment = catchAsync(async (req: Request, res: Response) => {
  // const { bookingId, paypalOrderId, transactionId } = req.body;

  const result = await PaymentService.getAllPayment();

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Payment Retrieved successfully',
    data: result,
  });
});

export const PaymentController = {
  getAllPayment,
};
