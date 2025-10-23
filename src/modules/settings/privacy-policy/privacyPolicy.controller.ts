import { StatusCodes } from 'http-status-codes'; 
import { Request, Response } from 'express';
import { PrivacyPolicyService } from './privacyPolicy.service';
import sendResponse from './../../../shared/sendResponse';
import catchAsync from './../../../shared/catchAsync';
import { JwtPayload } from 'jsonwebtoken';
 

const getAllPrivacyFromDB = catchAsync(async (req: Request, res: Response) => {

  const user = req.user as JwtPayload;

  const result = await PrivacyPolicyService.getAllPrivacyFromDB(user);
 
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Privacy policy fetched successfully.',
    data: result,
  });
});
 
 
const addPrivacyIntoDB = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await PrivacyPolicyService.addPrivacyIntoDB(req.body, user);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Privacy policy added successfully',
    data: result,
  });
});


const updatePrivacyFromDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  const result = await PrivacyPolicyService.updatePrivacyFromDB(id as string, req.body, user);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Privacy policy updated successfully',
    data: result,
  });
});
 
 

export const PrivacyPolicyController = {
  getAllPrivacyFromDB, 
  addPrivacyIntoDB,
  updatePrivacyFromDB, 
};