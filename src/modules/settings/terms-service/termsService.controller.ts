import { StatusCodes } from 'http-status-codes'; 
import { Request, Response } from 'express';
import { TermsAndServiceService } from './termsService.service';
import sendResponse from './../../../shared/sendResponse';
import catchAsync from './../../../shared/catchAsync';
import { JwtPayload } from 'jsonwebtoken';
 

const getAllTermsFromDB = catchAsync(async (req: Request, res: Response) => {

  const user = req.user as JwtPayload;
  
  const result = await TermsAndServiceService.getAllTermsFromDB(user);
 
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Terms and condition fetched successfully.',
    data: result,
  });
});
 
 
 
const addTermsIntoDB = catchAsync(async (req: Request, res: Response) => {
   const user = req.user as JwtPayload;
  const result = await TermsAndServiceService.addTermsIntoDB(req.body, user);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Terms and condition added successfully',
    data: result,
  });
});


const updateTermsFromDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  const result = await TermsAndServiceService.updateTermsFromDB(id as string,req.body, user);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Terms and condition updated successfully',
    data: result,
  });
});

 
 

export const TermsAndServiceController = {
  getAllTermsFromDB, 
  addTermsIntoDB,
  updateTermsFromDB, 
};