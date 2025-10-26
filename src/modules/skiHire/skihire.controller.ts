import { StatusCodes } from 'http-status-codes'; 
import { Request, Response } from 'express'; 
import { JwtPayload } from 'jsonwebtoken';
import catchAsync from './../../shared/catchAsync';
import sendResponse from './../../shared/sendResponse'; 
import { IReview } from './../common/common.interface';
 

const getAllSkiHireFromDB = catchAsync(async (req: Request, res: Response) => {

  const user = req.user as JwtPayload;
  
  const result = await SkiHireService.getAllSkiHireFromDB(user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski Hire fetched successfully.',
    data: result,
  });
});
 
const getSingleSkiHireFromDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  
  const result = await SkiHireService.getSingleSkiHireFromDB(id, user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski Hire fetched successfully',
    data: result,
  });
});
 
 
const addSkiHireIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await SkiHireService.addSkiHireIntoDB(req)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski Hire added successfully',
    data: result,
  });
});


const reviewSkiHire = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const id = req.params.id;
  const reviewData = req.body;
  const result = await SkiHireService.reviewSkiHire(id as string, user, reviewData as IReview)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Review successfully',
    data: result,
  });
});

const updateSkiHireIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await SkiHireService.updateSkiHireIntoDB(req)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski Hire added successfully',
    data: result,
  });
});

const deleteSkiHireIntoDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  const result = await SkiHireService.deleteSkiHireIntoDB(id, user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski Hire added successfully',
    data: result,
  });
});

 

export const SkiHireController = {
  getAllSkiHireFromDB,
  getSingleSkiHireFromDB,
  addSkiHireIntoDB,
  reviewSkiHire,
  updateSkiHireIntoDB,
  deleteSkiHireIntoDB
};