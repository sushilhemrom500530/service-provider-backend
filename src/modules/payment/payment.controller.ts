import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { PaymentService } from './payment.service';

const getAllPayment = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await PaymentService.getAllPayment(req.user as JwtPayload, req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Payments fetched.', data, meta });
});

const findById = catchAsync(async (req: Request, res: Response) => {
  const data = await PaymentService.paymentFindById(String(req.params.id));
  sendResponse(res, { code: StatusCodes.OK, message: 'Payment fetched.', data });
});

export const PaymentController = {
  getAllPayment,
  findById,
};
