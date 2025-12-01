import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import catchAsync from './../../shared/catchAsync';
import sendResponse from './../../shared/sendResponse';
import { RestaurantService } from './restaurant.service';
import { IReview } from './../common/common.interface';

const getAllRestaurantFromDB = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user as JwtPayload;
    const result = await RestaurantService.getAllRestaurantFromDB(
      user,
      req.query as any
    );
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Restaurant fetched successfully.',
      data: result,
    });
  }
);

const getAllMyRestaurantFromDB = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user as JwtPayload;
    const result = await RestaurantService.getAllMyRestaurantFromDB(
      user,
      req.query as any
    );
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Restaurant fetched successfully.',
      data: result,
    });
  }
);

const getSingleRestaurantFromDB = catchAsync(
  async (req: Request, res: Response) => {
    const id = req.params.id;
    const user = req.user as JwtPayload;

    const result = await RestaurantService.getSingleRestaurantFromDB(id, user);
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Restaurant fetched successfully',
      data: result,
    });
  }
);

const addRestaurantIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await RestaurantService.addRestaurantIntoDB(req as any);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Restaurant added successfully',
    data: result,
  });
});

const reviewRestaurant = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const id = req.params.id;
  const reviewData = req.body;
  const result = await RestaurantService.reviewRestaurant(
    id as string,
    user,
    reviewData as IReview
  );
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Review successfully',
    data: result,
  });
});

const updateRestaurantIntoDB = catchAsync(
  async (req: Request, res: Response) => {
    const result = await RestaurantService.updateRestaurantIntoDB(req as any);
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Restaurant updated successfully',
      data: result,
    });
  }
);

const updateRestaurantServiceFee = catchAsync(
  async (req: Request, res: Response) => {
    const result = await RestaurantService.updateServiceFee(
      req.body as any
    );
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Restaurant Service fee updated successfully',
      data: result,
    });
  }
);

const deleteRestaurantIntoDB = catchAsync(
  async (req: Request, res: Response) => {
    const id = req.params.id;
    const user = req.user as JwtPayload;
    const result = await RestaurantService.deleteRestaurantIntoDB(id, user);
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Restaurant deleted successfully',
      data: result,
    });
  }
);

export const RestaurantController = {
  getAllRestaurantFromDB,
  getAllMyRestaurantFromDB,
  getSingleRestaurantFromDB,
  addRestaurantIntoDB,
  reviewRestaurant,
  updateRestaurantIntoDB,
  deleteRestaurantIntoDB,
  updateRestaurantServiceFee,
};
