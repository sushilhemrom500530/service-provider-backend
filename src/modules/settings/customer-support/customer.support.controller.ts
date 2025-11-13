import { StatusCodes } from 'http-status-codes'; 
import { Request, Response } from 'express'; 
import sendResponse from './../../../shared/sendResponse';
import catchAsync from './../../../shared/catchAsync';
import { JwtPayload } from 'jsonwebtoken';
import { CustomerSupportService } from './customer.support.service';
 

const getSupport = catchAsync(async (req: Request, res: Response) => {

  const user = req.user as JwtPayload;

  const result = await CustomerSupportService.getSupport();
 
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Support fetched successfully.',
    data: result,
  });
});
 
 
const createSupport = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await CustomerSupportService.createSupport(user, req.body);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Support added successfully',
    data: result,
  });
});


const updateSupport = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  const result = await CustomerSupportService.updateSupport(user ,id as string, req.body);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Support updated successfully',
    data: result,
  });
});
 
 

export const CustomerSupportController = {
  getSupport, 
  createSupport,
  updateSupport, 
};