import catchAsync from './../../shared/catchAsync';
import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { CommonService } from './common.service';
import sendResponse from './../../shared/sendResponse';
import { StatusCodes } from 'http-status-codes';

const getSkiPassCategory = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;

  const result = await CommonService.getSkiPassCategory(user);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski Pass category fetched successfully.',
    data: result,
  });
});

const getSkiHireCategory = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await CommonService.getSkiHireCategory(user);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski Hire category fetched successfully.',
    data: result,
  });
});

const getRestaurantCategory = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user as JwtPayload;
    const result = await CommonService.getRestaurantCategory(user);
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Restaurant category fetched successfully.',
      data: result,
    });
  }
);

const getTransportCategory = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await CommonService.getTransportCategory(user);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Transport category fetched successfully.',
    data: result,
  });
});

const getMassageCategory = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await CommonService.getMassageCategory(user);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Massage category fetched successfully.',
    data: result,
  });
});

export const CommonController = {
  getSkiPassCategory,
  getSkiHireCategory,
  getRestaurantCategory,
  getTransportCategory,
  getMassageCategory,
};
