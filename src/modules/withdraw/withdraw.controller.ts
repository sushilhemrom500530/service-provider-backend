import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { WithdrawService } from './withdraw.service';

const getAllFromDB = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await WithdrawService.getAllFromDB(req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Withdrawals fetched.', data, meta });
});

const getMyWithdrawals = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await WithdrawService.getMyWithdrawals(req.user as JwtPayload, req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Withdrawals fetched.', data, meta });
});

const sendWithdrawRequest = catchAsync(async (req: Request, res: Response) => {
  const data = await WithdrawService.sendWithdrawRequest(req.user as JwtPayload, req.body);
  sendResponse(res, { code: StatusCodes.CREATED, message: 'Withdrawal requested.', data });
});

const acceptWithdrawRequest = catchAsync(async (req: Request, res: Response) => {
  const { withdrawalId, status, note } = req.body || {};
  const data = await WithdrawService.acceptWithdrawRequest(
    req.user as JwtPayload,
    String(withdrawalId),
    status,
    note,
  );
  sendResponse(res, {
    code: StatusCodes.OK,
    message: status === 'accept' ? 'Withdrawal marked as paid.' : 'Withdrawal rejected.',
    data,
  });
});

export const WithdrawController = {
  getAllFromDB,
  getMyWithdrawals,
  sendWithdrawRequest,
  acceptWithdrawRequest,
};
