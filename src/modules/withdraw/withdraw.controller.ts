import { JwtPayload } from 'jsonwebtoken';
import catchAsync from './../../shared/catchAsync';
import { Request, Response } from 'express';
import sendResponse from './../../shared/sendResponse';
import { StatusCodes } from 'http-status-codes';
import { IWithdraw } from './withdraw.inteface';
import { WithdrawService } from './withdraw.service';

const getAllFromDB = catchAsync(async (req: Request, res: Response) => {
  const result = await WithdrawService.getAllFromDB(req.query as any);

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Withdraw Retrieved successfully',
    data: result,
  });
});

const sendWithdrawRequest = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const formData = req.body;

  const result = await WithdrawService.sendWithdrawRequest(
    user,
    formData as IWithdraw,
  );

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Withdraw Request Sent successfully',
    data: result,
  });
});

const acceptWithdrawRequest = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user as JwtPayload;
    const { withdrawalId, status } = req.body;

    const result = await WithdrawService.acceptWithdrawRequest(
      user,
      withdrawalId as string,
      status as 'accept' | 'reject',
    );

    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Withdraw Request Sent successfully',
      data: result,
    });
  },
);

export const WithdrawController = {
  getAllFromDB,
  sendWithdrawRequest,
  acceptWithdrawRequest,
};
