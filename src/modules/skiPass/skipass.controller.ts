import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { Request, Response } from 'express';
import { SkiPassService } from './skipass.service';
import { JwtPayload } from 'jsonwebtoken'; 
import { IReview } from './../common/common.interface';


const getAllSkiPassFromDB = catchAsync(async (req: Request, res: Response) => {

  const user = req.user as JwtPayload;
  
  const result = await SkiPassService.getAllSkiPassFromDB(user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski pass fetched successfully.',
    data: result,
  });
});
 
const getSingleSkipPassFromDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  
  const result = await SkiPassService.getSingleSkipPassFromDB(id, user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski pass fetched successfully',
    data: result,
  });
});
 
 
const addSkiPassIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await SkiPassService.addSkiPassIntoDB(req)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski pass added successfully',
    data: result,
  });
});


const reviewSkiPass = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const id = req.params.id;
  const reviewData = req.body;
  const result = await SkiPassService.reviewSkiPass(id as string, user, reviewData as IReview)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Review successfully',
    data: result,
  });
});
 
const updateSkiPassIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await SkiPassService.updateSkiPassIntoDB(req)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski pass updated successfully',
    data: result,
  });
});


const deleteSkiPassIntoDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  const result = await SkiPassService.deleteSkiPassIntoDB(id, user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski pass added successfully',
    data: result,
  });
});

 

export const SkiPassController = {
  getAllSkiPassFromDB,
  getSingleSkipPassFromDB,
  addSkiPassIntoDB,
  reviewSkiPass,
  updateSkiPassIntoDB,
  deleteSkiPassIntoDB, 
};