import { JwtPayload } from 'jsonwebtoken';
import catchAsync from './../../shared/catchAsync';
import { Request, Response } from 'express';
import sendResponse from './../../shared/sendResponse';
import { StatusCodes } from 'http-status-codes'; 
import { WithdrawService } from './Withdraw.service';



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

// const updateWalletProfit = catchAsync(async (req: Request, res: Response) => {
//     const user = req.user as JwtPayload;
//     const {profit} = req.body;

//   const result = await WithdrawService.updateProfit(user, profit as number);

//   sendResponse(res, {
//     code: StatusCodes.OK,
//     message: 'Profit updated successfully',
//     data: result,
//   });
// });


export const WithdrawController = {
  // updateWalletProfit,
  getAllFromDB
};