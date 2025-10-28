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
import { SkiHire } from './../skiHire/skihire.model';
import { Transport } from './../transport/transport.model';
import { Restaurant } from './../restaurant/restaurant.model';
import { Massage } from './../massage/massage.model';

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
        populate: { path: 'owner', select: 'fullName email providerType' },
      })
      .populate('userId', 'fullName email address phoneNumber')
      .sort({ createdAt: -1 });
  } else if (isExistsUser.role === 'Provider') {
    //  Only see bookings for their own products
    result = await Booking.find()
      .populate({
        path: 'productId',
        populate: { path: 'owner', select: 'fullName email providerType' },
      })
      .populate('userId', 'fullName email address phoneNumber')
      .sort({ createdAt: -1 });

    result = result.filter(
      (booking: any) =>
        booking.productId?.owner?._id?.toString() ===
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

  // Get user bookings and populate related data
  const bookings = await Booking.find({ userId: isExistsUser._id })
    .populate('userId', 'fullName email address phoneNumber')
    .populate('productId')
    .sort({ createdAt: -1 });

  const msToTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    // const seconds = totalSeconds % 60;
    return `${hours}h ${minutes}m`;
  };

  const now = new Date();

  const bookingsWithTimeInfo = bookings.map(booking => {
    const startTime = new Date(booking.startDateAndTime);
    const endTime = new Date(booking.endDateAndTime);

    let label: string = '';

    if (now < endTime) {
      // Booking is ongoing
      const timeLeft = endTime.getTime() - now.getTime();
      label = `Time Left: ${msToTime(timeLeft)}`;
    } else {
      // Booking expired
      const overTime = now.getTime() - endTime.getTime();
      label = `Over Time: ${msToTime(overTime)}`;
    }

    return {
      ...booking.toObject(),
      timeLabel: label,
    };
  });

  return bookingsWithTimeInfo;
};

export const addBookingIntoDB = async (user: JwtPayload, payload: IBooking) => {
  // check user
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  if (!isExistsUser?._id.equals(payload?.userId)) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User ID mismatch.');
  }

  if (
    ['Delete', 'Blocked', 'Banned', 'Inactive', 'Unverified'].includes(
      isExistsUser?.status
    )
  ) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User status is not active.');
  }
  // for find model collection
  const models: Record<string, any> = {
    SkiPass,
    SkiHire,
    Transport,
    Restaurant,
    Massage,
  };

  let product = null;
  let foundModelName = null;
  let selectedMenuType: string | null = null;

  if (payload?.productId) {
    for (const [name, Model] of Object.entries(models)) {
      const found = await Model.findById(payload?.productId).populate('owner');
      if (found) {
        product = found;
        foundModelName = name;
        break;
      }
    }

    if (!product) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        'Product not found in any collection.'
      );
    }
  }

  // Find product owner
  const productOwner = await User.findById(product?.owner);
  if (!productOwner) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Product owner not found.');
  }

  //  add validation for booking items
  if (
    (productOwner?.providerType === 'Restaurant' ||
      productOwner?.providerType === 'Ski_Hire') &&
    (!payload?.items || payload.items.length === 0)
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Booking items are required for this product type.'
    );
  }

  if (!Array.isArray(product?.items)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'This product does not support booking items.'
    );
  }

  // Validate booking items
  const validatedItems = [];

  for (const bookedItem of payload?.items || []) {
    const foundItem = product?.items.find(
      (menuItem: any) => menuItem?._id.toString() === bookedItem?.itemId
    );

    if (!foundItem) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Item with ID ${bookedItem?.itemId} not found in product menu.`
      );
    }

    if (bookedItem.quantity > foundItem.quantity) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Not enough quantity for item "${foundItem?.name}". Only ${foundItem?.quantity} available.`
      );
    }

    // Push the validated item
    validatedItems.push({
      itemId: foundItem?._id,
      name: foundItem?.name,
      price: foundItem?.price,
      requestedQty: bookedItem?.quantity,
      availableQty: foundItem?.quantity,
      total: foundItem?.price * bookedItem.quantity,
    });
  }

  const menuTypesSet = new Set(
    validatedItems.map(item => {
      const foundItem = product.items.find(
        i => i._id.toString() === item.itemId.toString()
      );
      return foundItem?.menuType;
    })
  );

  if (menuTypesSet.size === 1) {
    selectedMenuType = Array.from(menuTypesSet)[0]; // all same, store the menuType
  } else {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'All booked items must have the same menuType.'
    );
  } 

  if (validatedItems.length === 0) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'No valid booking items found.'
    );
  }

  for (const item of validatedItems) {
    const index = product?.items.findIndex(
      (i: any) => i?._id.toString() === item?.itemId.toString()
    );
    if (index !== -1) {
      product.items[index].quantity -= item.requestedQty;
    }
  }

  const totalPrice = validatedItems.reduce((sum, item) => sum + item.total, 0);

  // Determine the model name based on provider type
  let productModel: string;
  switch (productOwner?.providerType) {
    case 'Ski_Pass':
      productModel = 'SkiPass';
      break;
    case 'Ski_Hire':
      productModel = 'SkiHire';
      break;
    case 'Transport':
      productModel = 'Transport';
      break;
    case 'Restaurant':
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
    totalPrice,
    user: isExistsUser?._id,
    category: productOwner?.providerType,
    productModel,
    menyType: selectedMenuType,
  };

  // const result = await Booking.create(bookingData);
  // if (!result) {
  //   throw new AppError(
  //     StatusCodes.BAD_REQUEST,
  //     'Something went wrong. Booking not created.'
  //   );
  // }

  return { bookingData, product, validatedItems };
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
  // console.log('find current user ===========>', isExistsUser);
  const existsBooking = await Booking.findById(bookingId).populate({
    path: 'productId',
    select: 'owner',
  });

  if (!existsBooking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  }

  // Check ownership
  const owner = existsBooking.productId?.owner;
  if (owner?.toString() !== isExistsUser._id.toString()) {
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
    select: 'owner',
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
    SkiHire,
    Transport,
    Restaurant,
    Massage,
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
