import { StatusCodes } from 'http-status-codes'; 
import { Request, Response } from 'express';
import { AboutUsService } from './about.service';
import sendResponse from './../../../shared/sendResponse';
import catchAsync from './../../../shared/catchAsync';
 

const getAllAboutFromDB = catchAsync(async (req: Request, res: Response) => {
  
  const result = await AboutUsService.getAllAboutFromDB();
 
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'About us fetched successfully.',
    data: result,
  });
});
 
const getSingleAboutFromDB = catchAsync(async (req: Request, res: Response) => {
   const result = await AboutUsService.getSingleAboutFromDB();
 
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'About us fetched successfully',
    data: result,
  });
});
 
 
const addAboutIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await AboutUsService.addAboutIntoDB();
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'About us added successfully',
    data: result,
  });
});


const updateAboutFromDB = catchAsync(async (req: Request, res: Response) => {
  const result = await AboutUsService.updateAboutFromDB();
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'About us updated successfully',
    data: result,
  });
});

const deleteAboutFromDB = catchAsync(async (req: Request, res: Response) => {
  const result = await AboutUsService.deleteAboutFromDB();
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'About us deleted successfully',
    data: result,
  });
});

 

export const AboutUsController = {
  getAllAboutFromDB,
  getSingleAboutFromDB,
  addAboutIntoDB,
  updateAboutFromDB,
  deleteAboutFromDB
};