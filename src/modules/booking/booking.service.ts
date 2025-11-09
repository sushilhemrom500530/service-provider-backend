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
import { processToPayment } from './../common/common.payment';

const getAllBookingFromDB = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  // Fetch all bookings first
  let result = await Booking.find()
    .populate({
      path: 'product',
      select:
        '-items -totalPrice -serviceArea -__v -reviews -refunds -averageRating -createdAt -updatedAt',
    })
    .populate('user', 'fullName email address phoneNumber')
    .sort({ createdAt: -1 });

  // Filter by provider (if needed)
  if (isExistsUser?.role === 'Provider') {
    result = result.filter(
      (booking: any) =>
        booking.product?.owner?._id?.toString() === isExistsUser._id.toString()
    );
  } else if (isExistsUser.role !== 'Admin') {
    throw new AppError(StatusCodes.FORBIDDEN, 'Invalid role.');
  }

  return result;
};

const getSingleBookingFromDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser)
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  const booking = await Booking.findById(id)
    .populate({
      path: 'product',
      select:
        '-owner -totalPrice -__v -reviews -refunds -averageRating -createdAt -updatedAt',
    })
    .populate(
      'user',
      '_id fullName email profileUrl address phoneNumber status'
    )
    .lean();

  if (!booking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  }

  const product = booking.product;
  const productItems = product?.items || [];

  const enrichedBookingItems = booking.bookingItems.map((bi: any) => {
    const matchedItem = productItems.find(
      (itm: any) => itm._id.toString() === bi.itemId.toString()
    );

    return {
      ...bi,
      item: matchedItem ? { ...matchedItem } : null,
    };
  });

  delete product.items;

  return {
    ...booking,
    product,
    bookingItems: enrichedBookingItems,
  };
};
const getMyBooking = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser)
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  // Get user bookings and populate related data
  const bookings = await Booking.find({ user: isExistsUser._id })
    .populate('user', 'fullName email address phoneNumber')
    .populate(
      'product',
      ' -totalPrice -__v -reviews -refunds -averageRating -createdAt -updatedAt'
    )
    .sort({ createdAt: -1 });

  const msToTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const now = new Date();

  const bookingsWithTimeInfo = bookings?.map(booking => {
    const startTime = new Date(booking?.startDateAndTime);
    const endTime = new Date(booking?.endDateAndTime);

    let label: string | undefined;

    // Only calculate time info for Ski_Hire or Transport
    if (['Ski_Hire', 'Transport'].includes(booking?.category)) {
      if (now < endTime) {
        // Booking is ongoing
        const timeLeft = endTime.getTime() - now.getTime();
        label = `Time Left: ${msToTime(timeLeft)}`;
      } else {
        // Booking expired
        const overTime = now.getTime() - endTime.getTime();
        label = `Over Time: ${msToTime(overTime)}`;
      }
    }

    // Enrich booking items with product item details
    const product = booking.product?.toObject?.() || booking.product;
    const productItems = product?.items || [];

    const enrichedBookingItems = booking.bookingItems.map((bi: any) => {
      const matchedItem = productItems.find(
        (itm: any) => itm._id.toString() === bi.itemId.toString()
      );

      return {
        ...(bi.toObject?.() || bi),
        item: matchedItem ? { ...matchedItem } : null,
      };
    });

    // Remove full product items array to avoid duplication
    delete product.items;

    const bookingObj: any = {
      ...booking.toObject(),
      product,
      bookingItems: enrichedBookingItems,
    };

    if (label) bookingObj?.timeLabel = label;

    return bookingObj;
  });

  return bookingsWithTimeInfo;
};

const addBookingIntoDB = async (user: JwtPayload, payload: IBooking) => {
  // check user
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  // console.log('user is : ', isExistsUser);

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
  // Prepare models for dynamic ref
  const models: Record<string, any> = {
    SkiPass,
    SkiHire,
    Transport,
    Restaurant,
    Massage,
  };
  let product = null;
  let foundModelName: string | null = null;
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

    if (!product)
      throw new AppError(
        StatusCodes.NOT_FOUND,
        'Product not found in any collection.'
      );
  }

  // Product owner check
  const productOwner = await User.findById(product?.owner);
  if (!productOwner)
    throw new AppError(StatusCodes.NOT_FOUND, 'Product owner not found.');

  // Conditional booking based on type
  let validatedItems: any[] = [];
  let totalPrice = 0;

  const isItemBooking =
    payload?.bookingItems && payload?.bookingItems.length > 0;

  if (isItemBooking) {
    // Booking with items
    if (
      (productOwner?.providerType === 'Restaurant' ||
        productOwner?.providerType === 'Ski_Hire') &&
      (!payload?.bookingItems || payload?.bookingItems.length === 0)
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

    for (const bookedItem of payload?.bookingItems) {
      const foundItem = product?.items.find(
        (menuItem: any) => menuItem?._id.toString() === bookedItem?.itemId
      );
      if (!foundItem) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Item with ID ${bookedItem?.itemId} not found in product menu.`
        );
      }

      if (bookedItem?.quantity > foundItem?.quantity) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Not enough quantity for item "${foundItem?.name}". Only ${foundItem?.quantity} available.`
        );
      }

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
      validatedItems?.map(item => {
        const foundItem = product?.items.find(
          i => i?._id.toString() === item?.itemId.toString()
        );
        return foundItem?.menuType;
      })
    );

    if (menuTypesSet?.size === 1)
      selectedMenuType = Array.from(menuTypesSet)[0];
    else
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'All booked items must have the same menuType.'
      );

    for (const item of validatedItems) {
      const index = product?.items.findIndex(
        (i: any) => i?._id.toString() === item?.itemId.toString()
      );
      if (index !== -1) product.items[index].quantity -= item.requestedQty;
    }

    totalPrice = validatedItems.reduce((sum, item) => sum + item.total, 0);
  } else {
    // Booking without items (just personCount, date, time)
    if (!payload?.personCount || !payload?.date || !payload?.time) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'personCount, date, and time are required for this booking type.'
      );
    }

    totalPrice = product?.amount || 0; // fallback to product price if exists
  }

  // Determine productModel
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

  // Create booking
  const bookingData: Partial<IBooking> = {
    ...payload,
    totalPrice,
    product: payload?.productId,
    user: isExistsUser._id,
    category: productOwner?.providerType,
    productModel,
    menyType: selectedMenuType,
  };

  const result = await Booking.create(bookingData);
  if (!result)
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Something went wrong. Booking not created.'
    );
  // Process to payment
  const paymentRequest = await processToPayment({
    bookingId: result?._id,
    userId: isExistsUser?._id,
    amount: result.totalPrice,
    category: result?.category,
    ownerId: productOwner?._id,
  });

  return paymentRequest;
};

const updateBookingIntoDB = async (
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
    path: 'product',
    select: 'owner',
  });

  if (!existsBooking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  }

  // Check ownership
  const owner = existsBooking?.product?.owner;
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
    .populate('user', 'fullName email')
    .populate('product');

  return result;
};

const updatePermitBookingIntoDB = async (
  user: JwtPayload,
  isPermitted: boolean,
  bookingId: string
) => {
  // Check user
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }
  // console.log('find current user ===========>', isExistsUser);
  const existsBooking = await Booking.findById(bookingId).populate({
    path: 'product',
    select: 'owner',
  });

  if (!existsBooking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  }

  // Check ownership
  const owner = existsBooking?.product?.owner;
  if (owner?.toString() !== isExistsUser._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not the owner of this product. Cannot update booking status.'
    );
  }

  const result = await Booking.findByIdAndUpdate(
    bookingId,
    { $set: { isPermitted } },
    { new: true }
  )
    .populate('user', 'fullName email')
    .populate('product');

  return result;
};

const refundBookingIntoDB = async (
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
    path: 'product',
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
    .populate('user', 'fullName email')
    .populate('product');

  // Identify the correct product model dynamically
  const productId = existsBooking?.product;
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

const deleteBookingIntoDB = async (id: string, user: JwtPayload) => {
  // check user
  const isExistsUser = await User.findOne({ email: user?.email });
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
  updatePermitBookingIntoDB,
  refundBookingIntoDB,
  deleteBookingIntoDB,
  getMyBooking,
};
