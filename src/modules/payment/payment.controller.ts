import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { Request, Response } from 'express'; 
import { IPayment } from './payment.interface';
import pick from '../../shared/pick';
import { PaymentService } from './payment.service';

// Process PayPal payment
const processToPayment = catchAsync(async (req: Request, res: Response) => {
  // const { bookingId, paypalOrderId, transactionId } = req.body;
  
  const result = await PaymentService.processToPayment(req.body);
  
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Payment processed successfully',
    data: result,
  });
});
 
export const PaymentController = {
  processToPayment, 
};