import { JwtPayload } from 'jsonwebtoken';
import catchAsync from './../../shared/catchAsync';
import { Request, Response } from 'express';
import sendResponse from './../../shared/sendResponse';
import { StatusCodes } from 'http-status-codes';
import { WalletService } from './wallet.service';

const updateWalletProfit = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const { profit } = req.body;

  const result = await WalletService.updateProfit(user, profit as number);

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Profit updated successfully',
    data: result,
  });
});

const addWallet = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const { profit } = req.body;

  const result = await WalletService.addWallet(user, profit as number);

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Wallet added successfully',
    data: result,
  });
});

export const WalletController = {
  updateWalletProfit,
  addWallet,
};
