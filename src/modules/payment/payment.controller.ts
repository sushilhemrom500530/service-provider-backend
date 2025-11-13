import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { Request, Response } from 'express';
import { IPayment } from './payment.interface';
import pick from '../../shared/pick';
import { PaymentService } from './payment.service';
import { Wallet } from './../wallet/wallet.model'; 


const getAllPayment = catchAsync(async (req: Request, res: Response) => { 
  const user = req.user; 
  const result = await PaymentService.getAllPayment(req.query as any );

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Payment Retrieved successfully',
    data: result,
  });
});


const findById = catchAsync(async (req: Request, res: Response) => { 
  const paymentId = req.params.id; 
  const result = await PaymentService.paymentFindById(paymentId as string );

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Payment Retrieved successfully',
    data: result,
  });
});


const deletePayment = catchAsync(async (req: Request, res: Response) => { 
  const deleteId = req.params.id; 
  const result = await PaymentService.deletePaymentById(deleteId as string );

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Payment Deleted successfully',
    data: result,
  });
});



export const PaymentController = {
  getAllPayment,
  findById,
  deletePayment
};
