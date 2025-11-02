import catchAsync from './../../shared/catchAsync';
import sendResponse from './../../shared/sendResponse';
import { StatusCodes } from 'http-status-codes';
import { MetaService } from './meta.service';
import { Request, Response } from 'express';



const getProviderDashboardData = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.user; 
    const result = await MetaService.getProviderDashboard(
      userId,
      chatId as string
    );
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Provider  fetched successfully',
      data: { count },
    });
  }
);


export const MetaController = {
  getProviderDashboardData,
};
