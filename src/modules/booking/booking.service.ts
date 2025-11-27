import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import { JwtPayload } from 'jsonwebtoken';
import { Booking } from './booking.model';
import { IBooking, BookingStatus, ProductModelName } from './booking.interface';
import { SkiPass } from './../skiPass/skipass.model';
import { SkiHire } from './../skiHire/skihire.model';
import { Transport } from './../transport/transport.model';
import { Restaurant } from './../restaurant/restaurant.model';
import { Massage } from './../massage/massage.model';
import { processToPayment } from './../common/common.payment';
import { Wallet } from './../wallet/wallet.model';
import { WalletTransactionType } from './../wallet/wallet.interface';
import { format } from 'date-fns';
import { IRefund } from '../common/common.interface';

const getAllBookingFromDB = async (user: JwtPayload, query: any) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  const page = Number(query?.page) || 1;
  const limit = Number(query?.limit) || 10;
  const skip = (page - 1) * limit;

  const search = query?.search || '';

  const filters: any = {};

  if (search) {
    filters['product.title'] = { $regex: search, $options: 'i' };
  }

  // Step 1: Build base Booking query (NO product.owner filter here)
  let bookingQuery = Booking.find(filters)
    .populate({
      path: 'product',
      match:
        isExistsUser.role === 'Provider'
          ? { owner: isExistsUser._id } // Filter here
          : {},
      select:
        '-items -totalPrice -serviceArea -__v -reviews -refunds -averageRating -createdAt -updatedAt',
    })
    .populate('user', 'fullName email address phoneNumber')
    .sort({ createdAt: -1 });

  // Step 2: Execute without pagination to count real results
  const allBookings = await bookingQuery.clone();

  // Step 3: Remove bookings where product = null (not matched)
  const filtered = allBookings.filter(b => b.product !== null);

  const total = filtered.length;

  // Step 4: Apply pagination manually
  const result = filtered.slice(skip, skip + limit);

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    result,
  };
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

  const product = booking?.product as any;
  // const product = booking?.product || [];
  const productItems = product?.items || [];
  // const enrichedBookingItems = booking?.bookingItems.map((bi: any) => {
  const enrichedBookingItems = (booking?.bookingItems || []).map((bi: any) => {
    const matchedItem =
      productItems.find(
        (itm: any) => itm._id.toString() === bi.itemId.toString()
      ) || null;

    return {
      ...bi,
      item: matchedItem ? { ...matchedItem } : null,
    };
  });

  const slots = (booking?.slots || [])
    .map((slotId: any) => {
      return product.slots.find(
        (s: any) => s._id.toString() === slotId.toString()
      );
    })
    .filter(Boolean);

  delete product.items;

  return {
    ...booking,
    product,
    bookingItems: enrichedBookingItems,
    slots,
  };
};

const getMyBooking = async (user: JwtPayload, query: any) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser)
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  // Get user bookings and populate related data
  const bookings = await Booking.find({ user: isExistsUser._id })
    .populate({
      path: 'product',
      select:
        '-owner -totalPrice -__v -reviews -refunds -averageRating -createdAt -updatedAt',
    })
    .populate(
      'user',
      '_id fullName email profileUrl address phoneNumber status'
    )
    .sort({ createdAt: -1 });

  // Pagination
  const page = Number(query?.page) || 1;
  const limit = Number(query?.limit) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  // Search & Category filter
  const search = query?.search?.toLowerCase() || '';
  const category = query?.category?.toLowerCase() || '';

  const msToTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Map and enrich bookings
  let bookingsWithTimeInfo = bookings.map(booking => {
    const startTime = new Date(booking?.startDateAndTime);
    const endTime = new Date(booking?.endDateAndTime);

    let label: string | undefined;
    if (['Ski_Hire', 'Transport'].includes(booking?.category)) {
      const now = new Date();
      if (now < endTime) {
        const timeLeft = endTime.getTime() - now.getTime();
        label = `Time Left: ${msToTime(timeLeft)}`;
      } else {
        const overTime = now.getTime() - endTime.getTime();
        label = `Over Time: ${msToTime(overTime)}`;
      }
    }

    const product = booking.product
      ? booking.product.toObject?.() || booking.product
      : null;
    const productItems = product?.items || [];

    const enrichedBookingItems = (booking.bookingItems || []).map((bi: any) => {
      const matchedItem = productItems.find(
        (itm: any) => itm?._id?.toString() === bi?.itemId?.toString()
      );
      return {
        ...(bi ? bi.toObject?.() || bi : {}),
        item: matchedItem ? { ...matchedItem } : null,
      };
    });

    if (product) delete product.items;

    const bookingObj: any = {
      ...booking.toObject(),
      product,
      bookingItems: enrichedBookingItems,
    };

    if (label) bookingObj.timeLabel = label;

    return bookingObj;
  });

  // Apply search filter
  if (search) {
    bookingsWithTimeInfo = bookingsWithTimeInfo.filter(b =>
      b.product?.title?.toLowerCase().includes(search)
    );
  }

  // FIXED BUG: category optional
  if (category) {
    bookingsWithTimeInfo = bookingsWithTimeInfo.filter(
      b => b.category?.toLowerCase() === category
    );
  }

  // Apply pagination
  const paginatedResult = bookingsWithTimeInfo.slice(startIndex, endIndex);

  return {
    pagination: {
      total: bookingsWithTimeInfo.length,
      page,
      limit,
      totalPages: Math.ceil(bookingsWithTimeInfo.length / limit),
    },
    result: paginatedResult,
  };
};

const getMyBookingForHome = async (user: JwtPayload, selectedDate: string) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser)
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  const bookings = await Booking.find({ user: isExistsUser._id })
    .populate('user', 'fullName email address phoneNumber')
    .populate(
      'product',
      'title category serviceArea amount startDateAndTime endDateAndTime time'
    )
    .sort({ createdAt: -1 });

  // Format time into "hh:mm am - hh:mm pm"
  const formatTimeRange = (start: Date, end: Date) => {
    const startStr = format(start, 'hh:mm a');
    const endStr = format(end, 'hh:mm a');
    return `${startStr}–${endStr}`;
  };

  const formatSingleTime = (time: string | Date) => {
    if (!time) return '';
    try {
      const parsed = typeof time === 'string' ? new Date(time) : time;
      return format(parsed, 'hh:mm a');
    } catch {
      return time?.toString() || '';
    }
  };

  // Default to today if no date provided
  const targetDate = selectedDate
    ? new Date(selectedDate)
    : new Date(new Date().toISOString().split('T')[0]);

  const filtered = bookings.filter(b => {
    if (b.category === 'Ski_Hire' && b.startDateAndTime) {
      const d = new Date(b.startDateAndTime);
      return (
        d.getFullYear() === targetDate.getFullYear() &&
        d.getMonth() === targetDate.getMonth() &&
        d.getDate() === targetDate.getDate()
      );
    }
    if (b.category === 'Ski_Pass' && b.date) {
      const d = new Date(b.date);
      return (
        d.getFullYear() === targetDate.getFullYear() &&
        d.getMonth() === targetDate.getMonth() &&
        d.getDate() === targetDate.getDate()
      );
    }
    return false;
  });

  // Simplify data output
  const simplified = filtered.map(b => {
    const type =
      b.category
        ?.replace('_', '')
        ?.replace(/([A-Z])/g, ' $1')
        ?.trim() || '';
    const person = b.personCount || 0;

    let time = '';
    if (b.startDateAndTime && b.endDateAndTime) {
      time = formatTimeRange(b.startDateAndTime, b.endDateAndTime);
    } else if (b.time) {
      time = b.time;
    }

    return {
      type: type.charAt(0).toUpperCase() + type.slice(1),
      person,
      time,
    };
  });

  return simplified;
};

const addBookingIntoDB = async (user: JwtPayload, payload: IBooking) => {
  const { totalPrice: transportPrice } = payload;
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
    // for (const bookedItem of payload?.bookingItems) {
    for (const bookedItem of payload?.bookingItems ?? []) {
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

    for (const item of validatedItems) {
      const index = product?.items.findIndex(
        (i: any) => i?._id.toString() === item?.itemId.toString()
      );
      if (index !== -1) product.items[index].quantity -= item.requestedQty;
    }

    totalPrice = validatedItems.reduce((sum, item) => sum + item.total, 0);
  } else if (productOwner?.providerType === 'Transport') {
    // Booking without items (just personCount, date, time)
    // if (!payload?.personCount || !payload?.date || !payload?.time) {
    //   throw new AppError(
    //     StatusCodes.BAD_REQUEST,
    //     'personCount, date, and time are required for this booking type.'
    //   );
    // }
    totalPrice = transportPrice || 0;
  } else {
    totalPrice = product?.amount || 0; // fallback to product price if exists
  }

  // Determine productModel
  let productModel: ProductModelName;
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
  };

  // return {bookingData, product, validatedItems};

  //  Restaurant slot validation & update
  if (productOwner?.providerType === 'Restaurant') {
    const { slots = [] } = payload;
    if (!slots.length)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'At least one slot is required.'
      );

    const bookedIds = slots.map(id => id.toString());
    const available = product.availableSlots || [];
    const availableIds = available.map((s: any) => s._id.toString());

    // Find invalid slot IDs
    const invalid = bookedIds.filter(id => !availableIds.includes(id));
    if (invalid.length)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Invalid or unavailable slot(s) id : ${invalid.join(', ')}`
      );

    // Remove booked slots from availableSlots
    const updatedAvailableSlots = available.filter(
      (s: any) => !bookedIds.includes(s._id.toString())
    );

    // Update Restaurant’s availableSlots in DB
    await Restaurant.updateOne(
      { _id: product._id },
      { $set: { availableSlots: updatedAvailableSlots } }
    );

    // Create booking
    const result = await Booking.create(bookingData);
    if (!result)
      throw new AppError(StatusCodes.BAD_REQUEST, 'Booking not created.');

    return result;
  }

  // Ski Hire quantity logic
  if (productOwner?.providerType === 'Ski_Hire') {
    const bookingItems = payload.bookingItems || [];
    if (!bookingItems.length)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'At least one booking item is required.'
      );

    // Fetch current SkiHire data again (to ensure fresh state)
    const skiHire = await SkiHire.findById(product._id);
    if (!skiHire)
      throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire product not found.');

    const updatedItems = skiHire.items.map(item => {
      // const booked = bookingItems.find(b => b.itemId.toString() === item?._id.toString());
      const itemIdStr = (item as any)?._id?.toString();
      const booked = bookingItems.find(
        b => itemIdStr && b.itemId.toString() === itemIdStr
      );
      if (booked) {
        // if (item?.availableQty < booked.quantity)
        const availableQty = item?.availableQty ?? 0;
        if (availableQty < booked.quantity)
          throw new AppError(
            StatusCodes.BAD_REQUEST,
            `Insufficient quantity for ${item.productName}. Available: ${availableQty}`
          );
        const itemObj = (item as any)?.toObject?.() ?? item;
        return {
          // ...item.toObject(),
          // availableQty: item?.availableQty - booked.quantity,
          ...itemObj,
          availableQty: availableQty - booked?.quantity,
        };
      }
      return item;
    });

    await SkiHire.updateOne(
      { _id: skiHire._id },
      { $set: { items: updatedItems } }
    );

    const result = await Booking.create(bookingData);
    if (!result)
      throw new AppError(StatusCodes.BAD_REQUEST, 'Booking not created.');

    return result;
  }

  // wallet calculation
  const ownerWallet = await Wallet.findOne({ user: productOwner?._id });

  if (!ownerWallet) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Owner wallet not found.');
  }

  //  const userWallet = await Wallet.findOne({ user: isExistsUser._id });
  // if (!userWallet) {
  //   throw new AppError(StatusCodes.NOT_FOUND, 'User wallet not found.');
  // }

  // if (userWallet.balance < totalPrice) {
  //   throw new AppError(
  //     StatusCodes.BAD_REQUEST,
  //     'Insufficient wallet balance for this booking.'
  //   );
  // }

  // Decrease user wallet balance
  // userWallet.balance -= totalPrice;
  // userWallet.transactions.push({
  //   user: isExistsUser._id,
  //   balance: totalPrice,
  //   type: WalletTransactionType.WITHDRAW,
  // });
  // await userWallet.save();

  // Increase owner wallet balance

  if (ownerWallet) {
    ownerWallet.balance += totalPrice;
    ownerWallet.transactions.push({
      user: productOwner?._id,
      balance: totalPrice,
      type: WalletTransactionType.EARN,
    });
    await ownerWallet.save();
  }

  const result = await Booking.create(bookingData);
  if (!result)
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Something went wrong. Booking not created.'
    );
  // Process to payment
  const paymentRequest = await processToPayment({
    bookingId: result?._id as string,
    userId: isExistsUser?._id?.toString(),
    amount: result.totalPrice,
    category: result?.category,
    ownerId: productOwner?._id?.toString(),
  });
// create invite url hitt 

  return paymentRequest;
};

const updateBookingIntoDB = async (
  user: JwtPayload,
  payload: BookingStatus,
  bookingId: string
) => {
  // Verify logged-in user
  const isExistsUser = await User.findOne({ email: user?.email });
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
  // const ownerId = existsBooking.product?.owner?.toString();
  const productDoc = existsBooking.product as any;
  const ownerId = productDoc?.owner?.toString?.();

  // allow condition
  if (user.role !== 'Admin' && ownerId !== isExistsUser?._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not allowed to update this booking.'
    );
  }
  // Update booking status
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
  // const owner = existsBooking?.product?.owner;
  // if (owner?.toString() !== isExistsUser._id.toString()) {
  const productDoc = existsBooking.product as any;
  const owner = productDoc?.owner;
  if (owner?.toString?.() !== isExistsUser._id.toString()) {
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
    (refund: IRefund) =>
      refund.userId.toString() === isExistsUser._id.toString()
  );

  if (alreadyRefunded) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'You have already refunded or canceled this product.'
    );
  }

  // Add refund info
  const newRefund = {
    userId: isExistsUser._id,
    reason: payload.reason,
    createdAt: new Date(),
  } as IRefund;

  if (!product.refunds) product.refunds = [];
  product.refunds.push(newRefund);

  await product.save();

  return result;
};

const deleteBookingIntoDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  // Check if booking exists
  const existsBooking = await Booking.findById(id);
  if (!existsBooking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  }

  // Safely extract user ID from booking
  const bookingUserId =
    existsBooking.user?._id?.toString?.() || existsBooking.user?.toString?.();

  if (!bookingUserId) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Booking user is missing.');
  }

  // Ensure only the booking owner can delete
  if (bookingUserId !== isExistsUser._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to delete this booking. Only the booking owner can delete it.'
    );
  }

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
  getMyBookingForHome,
};
