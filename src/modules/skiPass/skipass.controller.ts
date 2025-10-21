import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { Request, Response } from 'express';




const getAllSkiPassFromDB = catchAsync(async (req: Request, res: Response) => {
  const result = {name:"sushil", id:"20259"} 

 
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Ski pass fetched successfully.',
    data: result,
  });
});
 
const getSingleSkipPassFromDB = catchAsync(async (req: Request, res: Response) => {
  const result = {name:"sushil", id:"20259"}
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'PayPal payment processed successfully',
    data: result,
  });
});
 
 
const addSkiPassIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = {name:"sushil", id:"20259"}
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
};