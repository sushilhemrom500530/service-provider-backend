import { StatusCodes } from 'http-status-codes'; 
import { Request, Response } from 'express'; 
import { JwtPayload } from 'jsonwebtoken';
import catchAsync from './../../shared/catchAsync';
import sendResponse from './../../shared/sendResponse';
 

const getAllRestaurantFromDB = catchAsync(async (req: Request, res: Response) => {

  const user = req.user as JwtPayload;
  
  const result = await RestaurantService.getAllRestaurantFromDB(user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski pass fetched successfully.',
    data: result,
  });
});
 
const getSingleSkipPassFromDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  
  const result = await RestaurantService.getSingleRestaurantFromDB(id, user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski pass fetched successfully',
    data: result,
  });
});
 
 
const addRestaurantIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await RestaurantService.addRestaurantIntoDB(req)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski pass added successfully',
    data: result,
  });
});


const reviewRestaurant = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const id = req.params.id;
  const reviewData = req.body;
  const result = await RestaurantService.reviewRestaurant(id as string, user, reviewData as IReview)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Review successfully',
    data: result,
  });
});

const updateRestaurantIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await RestaurantService.updateRestaurantIntoDB(req)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski pass added successfully',
    data: result,
  });
});

const deleteRestaurantIntoDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  const result = await RestaurantService.deleteRestaurantIntoDB(id, user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski pass added successfully',
    data: result,
  });
});

 

export const RestaurantController = {
  getAllRestaurantFromDB,
  getSingleSkipPassFromDB,
  addRestaurantIntoDB,
  reviewRestaurant,
  updateRestaurantIntoDB,
  deleteRestaurantIntoDB
};