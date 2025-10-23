import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import { JwtPayload } from 'jsonwebtoken';
import { Booking } from './booking.model';
import { IBooking } from './booking.interface';
import { SkiPass } from './../skiPass/skipass.model';

const getAllBookingFromDB = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  let result;

  if (isExistsUser.role === 'Admin') {
    // Admin sees all bookings
    result = await Booking.find()
      .populate({
        path: 'productId',
        populate: { path: 'ownerId', select: 'fullName email providerType' },
      })
      .populate('userId', 'fullName email address phoneNumber')
      .sort({ createdAt: -1 });
  } else if (isExistsUser.role === 'Provider') {
    //  Only see bookings for their own products
    result = await Booking.find()
      .populate({
        path: 'productId',
        populate: { path: 'ownerId', select: 'fullName email providerType' },
      })
      .populate('userId', 'fullName email address phoneNumber')
      .sort({ createdAt: -1 });

    result = result.filter(
      (booking: any) =>
        booking.productId?.ownerId?._id?.toString() ===
        isExistsUser._id.toString()
    );
  } else {
    throw new AppError(StatusCodes.FORBIDDEN, 'Invalid role.');
  }
  return result;
};

const getSingleBookingFromDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser)
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  const result = await Booking.findById(id)
    .populate('userId', 'fullName email address phoneNumber')
    .populate('productId');

  return result;
};

const getMyBooking = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser)
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  const result = await Booking.find({ userId: isExistsUser._id })
    .populate('userId', 'fullName email address phoneNumber')
    .populate('productId')
    .sort({ createdAt: -1 });

  return result;
};

export const addBookingIntoDB = async (user: JwtPayload, payload: IBooking) => {
  // check user
  const isExistsUser = await User.findById(payload?.userId);
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  if (
    ['Delete', 'Blocked', 'Banned', 'Inactive', 'Unverified'].includes(
      isExistsUser?.status
    )
  ) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User status is not active.');
  }

  let product;

  if (payload?.productId) {
    product = await SkiPass.findById(payload?.productId);
    if (!product) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Product not found.');
    }
  }

  const productOwner = await User.findById(product?.ownerId);
  if (!productOwner) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Product owner not found.');
  }

  // determine the model name based on provider type
  let productModel: string;
  switch (productOwner.providerType) {
    case 'Ski_Pass':
      productModel = 'SkiPass';
      break;
    case 'Ski_Hire':
      productModel = 'SkiHire';
      break;
    case 'Transport':
      productModel = 'Transport';
      break;
    case 'Restaurant_Booking':
      productModel = 'Restaurant';
      break;
    case 'Massage':
      productModel = 'Massage';
      break;
    default:
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid provider type.');
  }

  const bookingData = {
    ...payload,
    category: productOwner.providerType,
    productModel,
  };

  const result = await Booking.create(bookingData);
  if (!result) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Something went wrong. Booking not created.'
    );
  }

  return result;
};

export const updateBookingIntoDB = async (req: Request, res: Response) => {
  // check user
  const user = await User.findById(req?.body?.ownerId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  const result = { name: 'booking', status: 'success' };

  return result;
};

export const deleteBookingIntoDB = async (req: Request, res: Response) => {
  // check user
  const user = await User.findById(req?.body?.ownerId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  const result = { name: 'booking', status: 'success' };

  return result;
};

export const BookingService = {
  getAllBookingFromDB,
  getSingleBookingFromDB,
  addBookingIntoDB,
  updateBookingIntoDB,
  deleteBookingIntoDB,
  getMyBooking,
};
