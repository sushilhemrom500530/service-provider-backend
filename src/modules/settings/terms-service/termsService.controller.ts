import { StatusCodes } from 'http-status-codes'; 
import { Request, Response } from 'express';
import { TermsAndServiceService } from './termsService.service';
import sendResponse from './../../../shared/sendResponse';
import catchAsync from './../../../shared/catchAsync';
 

const getAllTermsFromDB = catchAsync(async (req: Request, res: Response) => {
  
  const result = await TermsAndServiceService.getAllTermsFromDB();
 
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Terms and condition fetched successfully.',
    data: result,
  });
});
 
const getSingleTermsFromDB = catchAsync(async (req: Request, res: Response) => {
   const result = await TermsAndServiceService.getSingleTermsFromDB();
 
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Terms and condition fetched successfully',
    data: result,
  });
});
 
 
const addTermsIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await TermsAndServiceService.addTermsIntoDB();
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Terms and condition added successfully',
    data: result,
  });
});


const updateTermsFromDB = catchAsync(async (req: Request, res: Response) => {
  const result = await TermsAndServiceService.updateTermsFromDB();
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Terms and condition updated successfully',
    data: result,
  });
});

const deleteTermsFromDB = catchAsync(async (req: Request, res: Response) => {
  const result = await TermsAndServiceService.deleteTermsFromDB();
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Terms and condition deleted successfully',
    data: result,
  });
});

 

export const TermsAndServiceController = {
  getAllTermsFromDB,
  getSingleTermsFromDB,
  addTermsIntoDB,
  updateTermsFromDB,
  deleteTermsFromDB
};