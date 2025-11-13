import catchAsync from './../../shared/catchAsync';
import sendResponse from './../../shared/sendResponse';
import { StatusCodes } from 'http-status-codes';
import { MetaService } from './meta.service';
import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';

const getProviderDashboardData = catchAsync(
  async (req: Request, res: Response) => {
    const user = req?.user;
    const result = await MetaService.getProviderDashboard(user as JwtPayload);
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Provider Meta fetched successfully',
      data: result,
    });
  }
);

const getAdminDashboardData = catchAsync(
  async (req: Request, res: Response) => {
    const user = req?.user;
    const result = await MetaService.getAdminDashboard(user as JwtPayload);
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Admin Meta fetched successfully',
      data: result,
    });
  }
);

const getAdminServiceManagement = catchAsync(
  async (req: Request, res: Response) => {
    const user = req?.user;
    const result = await MetaService.getCommonService(user as JwtPayload);
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Common Service fetched successfully',
      data: result,
    });
  }
);

export const MetaController = {
  getProviderDashboardData,
  getAdminDashboardData,
  getAdminServiceManagement,

};
