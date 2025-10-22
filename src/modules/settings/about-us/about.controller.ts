import { StatusCodes } from 'http-status-codes'; 
import { Request, Response } from 'express';
import { AboutUsService } from './about.service';
import sendResponse from './../../../shared/sendResponse';
import catchAsync from './../../../shared/catchAsync';
import { JwtPayload } from 'jsonwebtoken';
 

const getAllAboutFromDB = catchAsync(async (req: Request, res: Response) => {
  
  const result = await AboutUsService.getAllAboutFromDB();
 
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'About us fetched successfully.',
    data: result,
  });
});
 
  
const addAboutIntoDB = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await AboutUsService.addAboutIntoDB(req.body, user);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'About us added successfully',
    data: result,
  });
});


const updateAboutFromDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  const result = await AboutUsService.updateAboutFromDB(id as string,req.body, user);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'About us updated successfully',
    data: result,
  });
});
 

export const AboutUsController = {
  getAllAboutFromDB, 
  addAboutIntoDB,
  updateAboutFromDB, 
};