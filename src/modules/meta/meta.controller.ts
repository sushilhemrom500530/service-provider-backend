import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { MetaService } from './meta.service';

const me = (req: Request) => req.user as JwtPayload;

const getProviderDashboardData = catchAsync(async (req: Request, res: Response) => {
  const data = await MetaService.getProviderDashboard(me(req), req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Provider dashboard.', data });
});

const getAdminDashboardData = catchAsync(async (req: Request, res: Response) => {
  const data = await MetaService.getAdminDashboard(me(req), req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Admin dashboard.', data });
});

const getAdminServiceManagement = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await MetaService.getCommonService(me(req), req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Bookings fetched.', data, meta });
});

const getAdminRestaurantService = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await MetaService.getRestaurantManagement(me(req), req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Bookings fetched.', data, meta });
});

const getSingleService = catchAsync(async (req: Request, res: Response) => {
  const data = await MetaService.getSingleService(me(req), String(req.params.id));
  sendResponse(res, { code: StatusCodes.OK, message: 'Booking fetched.', data });
});

export const MetaController = {
  getProviderDashboardData,
  getAdminDashboardData,
  getAdminServiceManagement,
  getAdminRestaurantService,
  getSingleService,
};
