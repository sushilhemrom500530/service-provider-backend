import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { BookingService } from './booking.service';
import { IBooking, BookingStatus } from './booking.interface';

const getAllBookingFromDB = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;

  const result = await BookingService.getAllBookingFromDB(
    user,
    req.query as any
  );
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

  const result = await BookingService.getMyBooking(user, req.query as any);

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'My Booking fetched successfully',
    data: result,
  });
});

const getMyBookingForHome = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;

  // Get selectedDate from query or default to today in YYYY-MM-DD
  let { selectedDate } = req.query;
  if (!selectedDate) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    selectedDate = `${yyyy}-${mm}-${dd}`; // e.g., "2025-11-02"
  }

  const result = await BookingService.getMyBookingForHome(
    user,
    selectedDate as string
  );

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'My Booking fetched successfully',
    data: result,
  });
});

const addBookingIntoDB = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const formData = req.body;
  const result = await BookingService.addBookingIntoDB(
    user,
    formData as IBooking
  );
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Booking successfully',
    data: result,
  });
});

const updateBookingStatus = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  const payload = req.body;
  const result = await BookingService.updateBookingIntoDB(
    user,
    payload as any,
    id as string
  );
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Booking updated successfully',
    data: result,
  });
});

const updatePermitBookingStatus = catchAsync(
  async (req: Request, res: Response) => {
    const id = req.params.id;
    const user = req.user as JwtPayload;
    const { isPermitted } = req.body;
    const result = await BookingService.updatePermitBookingIntoDB(
      user,
      isPermitted as boolean,
      id as string
    );
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Booking Permitted successfully',
      data: result,
    });
  }
);

const refundBookingIntoDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  const refundData = req.body;
  const result = await BookingService.refundBookingIntoDB(
    user,
    refundData as any,
    id as string
  );
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Booking cancelled successfully',
    data: result,
  });
});

const deleteBookingIntoDB = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  const result = await BookingService.deleteBookingIntoDB(id as string, user);
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
  updateBookingStatus,
  updatePermitBookingStatus,
  refundBookingIntoDB,
  deleteBookingIntoDB,
  getMyBookingIntoDB,
  getMyBookingForHome,
};
