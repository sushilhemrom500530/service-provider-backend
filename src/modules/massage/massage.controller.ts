import { StatusCodes } from 'http-status-codes'; 
import { Request, Response } from 'express'; 
import { JwtPayload } from 'jsonwebtoken'; 
import catchAsync from './../../shared/catchAsync';
import sendResponse from './../../shared/sendResponse';  
import { IReview } from './../common/common.interface';
import { MassageService } from './massage.service';


const getAllMassageFromDB = catchAsync(async (req: Request, res: Response) => {

  const user = req.user as JwtPayload;
  
  const result = await MassageService.getAllMassageFromDB(user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Massage fetched successfully.',
    data: result,
  });
});
 
const getSingleMassageFromDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  
  const result = await MassageService.getSingleMassageFromDB(id, user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Massage fetched successfully',
    data: result,
  });
});
 
 
const addMassageIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await MassageService.addMassageIntoDB(req)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Massage added successfully',
    data: result,
  });
});


const reviewMassage = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const id = req.params.id;
  const reviewData = req.body;
  const result = await MassageService.reviewMassage(id as string, user, reviewData as IReview)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Review successfully',
    data: result,
  });
});
 
const updateMassageIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await MassageService.updateMassageIntoDB(req)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Massage updated successfully',
    data: result,
  });
});


const deleteMassageIntoDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  const result = await MassageService.deleteMassageIntoDB(id, user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Massage added successfully',
    data: result,
  });
});

 

export const MassageController = {
  getAllMassageFromDB,
  getSingleMassageFromDB,
  addMassageIntoDB,
  reviewMassage,
  updateMassageIntoDB,
  deleteMassageIntoDB, 
};