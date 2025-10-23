import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { BookingService } from './booking.service';
import { IBooking } from './booking.interface';

const getAllBookingFromDB = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;

  const result = await BookingService.getAllBookingFromDB(user);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Booking fetched successfully.',
    data: result,
  });
});

const getSingleBookingFromDB = catchAsync(
  async (req: Request, res: Response) => {
    const id = req.params.id;
    const user = req.user as JwtPayload;

    const result = await BookingService.getSingleBookingFromDB(id, user);
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Booking fetched successfully',
      data: result,
    });
  }
);

const getMyBookingIntoDB = catchAsync(async (req: Request, res: Response) => {
  
  const user = req.user as JwtPayload;

  const result = await BookingService.getMyBooking(user);

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'My Booking fetched successfully',
    data: result,
  });
});


const addBookingIntoDB = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const formData = req.body;
  const result = await BookingService.addBookingIntoDB(user, formData as IBooking);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Booking successfully',
    data: result,
  });
});

const updateBookingIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await BookingService.updateBookingIntoDB(req);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Booking updated successfully',
    data: result,
  });
});

const deleteBookingIntoDB = catchAsync(async (req: Request, res: Response) => {
  const result = await BookingService.deleteBookingIntoDB(req);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Booking deleted successfully',
    data: result,
  });
});

export const BookingController = {
  getAllBookingFromDB,
  getSingleBookingFromDB,
  addBookingIntoDB,
  updateBookingIntoDB,
  deleteBookingIntoDB,
  getMyBookingIntoDB,
};
