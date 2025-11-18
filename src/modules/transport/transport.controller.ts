import { StatusCodes } from 'http-status-codes'; 
import { Request, Response } from 'express'; 
import { JwtPayload } from 'jsonwebtoken'; 
import catchAsync from './../../shared/catchAsync';
import sendResponse from './../../shared/sendResponse';  
import { IReview } from './../common/common.interface'; 
import { TransportService } from './transport.service';


const getAllTransportFromDB = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await TransportService.getAllTransportFromDB(user, req.query as any)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Transport fetched successfully.',
    data: result,
  });
});


const getAllMyTransportFromDB = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await TransportService.getAllMyTransportFromDB(user, req.query as any)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Transport fetched successfully.',
    data: result,
  });
});
 
const getSingleTransportFromDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  
  const result = await TransportService.getSingleTransportFromDB(id, user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Transport fetched successfully',
    data: result,
  });
});
 
 
const addTransportIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await TransportService.addTransportIntoDB(req)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Transport added successfully',
    data: result,
  });
});


const reviewTransport = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const id = req.params.id;
  const reviewData = req.body;
  const result = await TransportService.reviewTransport(id as string, user, reviewData as IReview)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Review successfully',
    data: result,
  });
});
 
const updateTransportIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await TransportService.updateTransportIntoDB(req)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Transport updated successfully',
    data: result,
  });
});


const deleteTransportIntoDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  const result = await TransportService.deleteTransportIntoDB(id, user)
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Transport added successfully',
    data: result,
  });
});

 

export const TransportController = {
  getAllTransportFromDB,
  getAllMyTransportFromDB,
  getSingleTransportFromDB,
  addTransportIntoDB,
  reviewTransport,
  updateTransportIntoDB,
  deleteTransportIntoDB, 
};