import { StatusCodes } from 'http-status-codes'; 
import { Request, Response } from 'express';
import { PrivacyPolicyService } from './privacyPolicy.service';
import sendResponse from './../../../shared/sendResponse';
import catchAsync from './../../../shared/catchAsync';
 

const getAllPrivacyFromDB = catchAsync(async (req: Request, res: Response) => {
  
  const result = await PrivacyPolicyService.getAllPrivacyFromDB();
 
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Privacy policy fetched successfully.',
    data: result,
  });
});
 
const getSinglePrivacyFromDB = catchAsync(async (req: Request, res: Response) => {
   const result = await PrivacyPolicyService.getSinglePrivacyFromDB();
 
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Privacy policy fetched successfully',
    data: result,
  });
});
 
 
const addPrivacyIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await PrivacyPolicyService.addPrivacyIntoDB();
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Privacy policy added successfully',
    data: result,
  });
});


const updatePrivacyFromDB = catchAsync(async (req: Request, res: Response) => {
  const result = await PrivacyPolicyService.updatePrivacyFromDB();
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Privacy policy updated successfully',
    data: result,
  });
});

const deletePrivacyFromDB = catchAsync(async (req: Request, res: Response) => {
  const result = await PrivacyPolicyService.deletePrivacyFromDB();
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Privacy policy deleted successfully',
    data: result,
  });
});

 

export const PrivacyPolicyController = {
  getAllPrivacyFromDB,
  getSinglePrivacyFromDB,
  addPrivacyIntoDB,
  updatePrivacyFromDB,
  deletePrivacyFromDB
};