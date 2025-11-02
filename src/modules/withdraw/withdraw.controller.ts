import { JwtPayload } from 'jsonwebtoken';
import catchAsync from './../../shared/catchAsync';
import { Request, Response } from 'express';
import sendResponse from './../../shared/sendResponse';
import { StatusCodes } from 'http-status-codes'; 
import { WithdrawService } from './Withdraw.service';
import { IWithdrawRequest } from './withdraw.inteface';

 
const getAllFromDB = catchAsync(async (req: Request, res: Response) => {
    const user = req.user as JwtPayload;
    const {profit} = req.body;

  const result = await WithdrawService.getAllFromDB(user, profit as number);

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Withdraw Retrieved successfully',
    data: result,
  });
});


const sendWithdrawRequest = catchAsync(async (req: Request, res: Response) => {
    const user = req.user as JwtPayload;
    const formData= req.body;

  const result = await WithdrawService.sendWithdrawRequest(user, formData as IWithdrawRequest);

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Withdraw Request Sent successfully',
    data: result,
  });
});
 


const acceptWithdrawRequest = catchAsync(async (req: Request, res: Response) => {
    const user = req.user as JwtPayload;
    const {withdrawalId}= req.body;

  const result = await WithdrawService.acceptWithdrawRequest(user, withdrawalId as string);

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Withdraw Request Sent successfully',
    data: result,
  });
});
 


export const WithdrawController = { 
  getAllFromDB,
  sendWithdrawRequest,
  acceptWithdrawRequest
};