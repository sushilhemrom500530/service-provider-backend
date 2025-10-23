import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import { JwtPayload } from 'jsonwebtoken';
import { Booking } from './booking.model';
import { IBooking, BookingStatus } from './booking.interface';
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

export const updateBookingIntoDB = async (
  user: JwtPayload,
  payload: BookingStatus,
  bookingId: string
) => {
  // Check user
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  const existsBooking = await Booking.findById(bookingId).populate({
    path: 'productId',
    select: 'ownerId',
  });

  if (!existsBooking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  }

  // Check ownership
  const ownerId = existsBooking.productId?.ownerId;
  if (ownerId?.toString() !== isExistsUser._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not the owner of this product. Cannot update booking status.'
    );
  }

  const result = await Booking.findByIdAndUpdate(
    bookingId,
    { $set: { bookingStatus: payload } },
    { new: true }
  )
    .populate('userId', 'fullName email')
    .populate('productId');

  return result;
};

export const refundBookingIntoDB = async (
  user: JwtPayload,
  payload: Partial<any | {}>,
  bookingId: string
) => {
  // Check user
  const isExistsUser = await User.findOne({
    _id: payload?.userId,
    email: user?.email,
  });

  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  const existsBooking = await Booking.findById(bookingId).populate({
    path: 'productId',
    select: 'ownerId',
  });

  if (!existsBooking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  } 

  const result = await Booking.findByIdAndUpdate(
    bookingId,
    { $set: { bookingStatus: 'Cancel' } },
    { new: true }
  )
    .populate('userId', 'fullName email')
    .populate('productId');

  // Identify the correct product model dynamically
  const productId = existsBooking?.productId;
  const productModel = existsBooking?.productModel; // e.g. "SkiPass" or "Restaurant"

  if (!productId || !productModel) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid product reference.');
  }

  // Map model names to actual mongoose models
  const productModels: Record<string, any> = {
    SkiPass,
    // SkiHire,
    // Transport,
    // Restaurant,
    // Massage,
  };

  const ProductModel = productModels[productModel];
  if (!ProductModel) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `Invalid product model: ${productModel}`
    );
  }

  // Find the product
  const product = await ProductModel.findById(productId);
  if (!product) {
    throw new AppError(StatusCodes.NOT_FOUND, `${productModel} not found.`);
  }

  // Prevent duplicate refunds
  const alreadyRefunded = product.refunds?.some(
    (refund: IReview) =>
      refund.userId.toString() === isExistsUser._id.toString()
  );

  if (alreadyRefunded) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'You have already refunded or canceled this product.'
    );
  }

  // Add refund info
  const newRefund: IReview = {
    userId: isExistsUser._id,
    reason: payload.reason,
    createdAt: new Date(),
  } as IReview;

  if (!product.refunds) product.refunds = [];
  product.refunds.push(newRefund);

  await product.save();

  return result;
};

export const deleteBookingIntoDB = async (id: string, user: JwtPayload) => {
  // check user
  const isExistsUser = await User.findById(user?.userId);
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  // Check if booking exists
  const existsBooking = await Booking.findById(id);
  if (!existsBooking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  }

  // Ensure only the booking owner can delete
  if (existsBooking.userId.toString() !== isExistsUser._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to delete this booking.'
    );
  }

  //  const result = await Booking.findByIdAndUpdate(
  //   id,
  //   { $set: { bookingStatus: 'Delete' } },
  //   { new: true }
  // );
  // Delete the booking permanently
  const result = await Booking.findByIdAndDelete(id);

  if (!result) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      'Failed to delete booking.'
    );
  }
  return result;
};

export const BookingService = {
  getAllBookingFromDB,
  getSingleBookingFromDB,
  addBookingIntoDB,
  updateBookingIntoDB,
  refundBookingIntoDB,
  deleteBookingIntoDB,
  getMyBooking,
};
