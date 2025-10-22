import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { Request, Response } from 'express';
import { SkiPassService } from './skipass.service';
import { JwtPayload } from 'jsonwebtoken';




const getAllSkiPassFromDB = catchAsync(async (req: Request, res: Response) => {
  const result = {name:"sushil", id:"20259"} 

 
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
    message: 'PayPal payment processed successfully',
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

 

export const SkiPassController = {
  getAllSkiPassFromDB,
  getSingleSkipPassFromDB,
  addSkiPassIntoDB,
};