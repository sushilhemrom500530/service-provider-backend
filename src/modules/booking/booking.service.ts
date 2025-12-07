import mongoose, { Types } from 'mongoose';
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
import { isPastDate } from './../../utils/isPassTimeCheck';
import { Payment } from './../payment/payment.model';
import { generateTransactionId } from './../../utils/generateTransactionId';
import { Notification } from './../notification/notification.model';
import {
  TransactionStatus,
  PaymentGateway,
  IPayment,
} from './../payment/payment.interface';

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

  // ---- FIX: SEARCH PRODUCT TITLE ----
  if (search) {
    const productIds: string[] = [];
    const models = [SkiPass, SkiHire, Transport, Restaurant, Massage];

    for (const Model of models) {
      const matched = await Model.find({
        title: { $regex: search, $options: 'i' },
      }).select('_id');

      if (matched.length > 0) {
        productIds.push(...matched.map(p => p._id.toString()));
      }
    }

    if (productIds.length === 0) {
      return {
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
        result: [],
      };
    }

    filters.product = { $in: productIds };
  }
  // ---- END FIX ----

  let bookingQuery = Booking.find(filters)
    .populate({
      path: 'product',
      match:
        isExistsUser.role === 'Provider' ? { owner: isExistsUser._id } : {},
      select:
        '-totalPrice -__v -reviews -refunds -averageRating -createdAt -updatedAt',
      // populate: {path: 'items'}
    })
    .populate('user', 'fullName email address phoneNumber')
    .sort({ createdAt: -1 });

  const allBookings = await bookingQuery.clone();

  const filtered = allBookings.filter(b => b.product !== null);

  const total = filtered.length;

  const result = filtered.slice(skip, skip + limit).map(booking => {
    // pick only required product fields
    const product = booking.product
      ? {
          _id: booking.product._id,
          thumbnail: booking?.product?.thumbnail,
          title: booking?.product?.title,
          skiPassType: booking?.product?.skiPassType || '',
          serviceArea: booking?.product?.serviceArea || '',
        }
      : null;

    // slots mapping (same logic)
    const fullSlots = (booking.slots || [])
      .map(slotId => {
        return booking.product?.slots?.find(
          s => s._id.toString() === slotId.toString()
        );
      })
      .filter(Boolean);

    // bookingItems with full details
    const fullBookingItems = booking.bookingItems.map(item => {
      const fullItem =
        booking.product?.items?.find(
          p => p._id.toString() === item.itemId.toString()
        ) || null;

      return {
        ...item.toObject(),
        itemDetails: fullItem || null,
      };
    });

    return {
      ...booking.toObject(),
      product, // <- now contains only 3 fields
      bookingItems: fullBookingItems,
      slots: fullSlots,
    };
  });

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
  console.log("product", product);
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

  return product;

  // return {
  //   ...booking,
  //   product,
  //   bookingItems: enrichedBookingItems,
  //   slots,
  // };
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
        '-owner -totalPrice -__v -reviews -refunds -averageRating -createdAt -updatedAt -slots -availableSlots',
    })
    .populate(
      'user',
      '_id fullName email profileUrl address phoneNumber status'
    );

  // Pagination
  const page = Number(query?.page) || 1;
  const limit = Number(query?.limit) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  // Search & Category filter
  const search = query?.search?.toLowerCase() || '';
  const category = query?.category?.toLowerCase() || '';

  if (!category) {
    return [];
  }

  const msToTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Map and enrich bookings
  let bookingsWithTimeInfo = bookings.map(booking => {
    const product = booking.product
      ? booking.product.toObject?.() || booking.product
      : null;
    const productItems = product?.items || [];

    const startTime = new Date(booking?.startDateAndTime);
    const endTime = new Date(booking?.endDateAndTime);
    let bookingSeatCount: number = 0;
    let label: string | undefined;
    let overTimeAmount: number = 0;

    if (['Ski_Hire', 'Transport'].includes(booking?.category)) {
      const now = new Date();

      if (now < endTime) {
        // Time left
        const timeLeft = endTime.getTime() - now.getTime();
        label = `Time Left: ${msToTime(timeLeft)}`;
      } else {
        // Overtime started
        const overMs = now.getTime() - endTime.getTime();
        label = `Over Time: ${msToTime(overMs)}`;

        const overHours = overMs / (1000 * 60 * 60); // convert to hours

        // Detect price field by category
        let hourlyRate = 0;

        if (booking?.category === 'Ski_Hire') {
          hourlyRate = Number(product?.extraChargePerHour || 0);
        }

        if (booking?.category === 'Transport') {
          hourlyRate = Number(product?.extraChargePerHours || 0);
        }

        // Final overtime amount
        overTimeAmount = Number((overHours * hourlyRate).toFixed(2));
      }
    }

    // if (['Ski_Hire', 'Transport'].includes(booking?.category)) {
    //   const now = new Date();
    //   if (now < endTime) {
    //     const timeLeft = endTime.getTime() - now.getTime();
    //     label = `Time Left: ${msToTime(timeLeft)}`;
    //   } else {
    //     const overTime = now.getTime() - endTime.getTime();
    //     label = `Over Time: ${msToTime(overTime)}`;
    //   }
    // }

    const enrichedBookingItems = (booking.bookingItems || []).map((bi: any) => {
      bookingSeatCount = bi?.quantity || 0;
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

    // add extra fields for time info
    if (startTime) bookingObj.startTime = startTime;
    if (endTime) bookingObj.endTime = endTime;
    if (label) bookingObj.timeLabel = label;

    if (overTimeAmount > 0) bookingObj.overTimeAmount = overTimeAmount;

    if (booking?.category === 'Restaurant') {
      bookingObj.bookingSeatCount = bookingSeatCount;
    }

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
  // //   newest comes first
  // bookingsWithTimeInfo = bookingsWithTimeInfo.sort(
  //   (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  // );
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
  const { userId, transactionId } = payload;
  // user validation
  const dbUser = await User.findOne({ email: user?.email });
  if (!dbUser) throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  if (!dbUser._id.equals(userId))
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User ID mismatch.');

  if (
    ['Delete', 'Blocked', 'Banned', 'Inactive', 'Unverified'].includes(
      dbUser.status
    )
  )
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User status is not active.');

  // product model mapping
  const models: Record<string, any> = {
    SkiPass,
    SkiHire,
    Transport,
    Restaurant,
    Massage,
  };

  let matchedProduct = null;
  let productModelName: string | null = null;

  // Find product in any model
  for (const [modelName, Model] of Object.entries(models)) {
    const found = await Model.findById(payload.productId).populate('owner');
    if (found) {
      matchedProduct = found;
      productModelName = modelName;
      break;
    }
  }

  if (!matchedProduct)
    throw new AppError(StatusCodes.NOT_FOUND, 'Product not found.');

  const productOwner = await User.findById(matchedProduct.owner);
  if (!productOwner)
    throw new AppError(StatusCodes.NOT_FOUND, 'Product owner not found.');

  // date validation for all Service
  const now = new Date();

  // Ski Pass, Restaurant, Massage need only 1 date
  if (
    ['Ski_Pass', 'Restaurant', 'Massage'].includes(productOwner.providerType)
  ) {
    if (payload.date && isPastDate(payload.date)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Booking date cannot be in the past.'
      );
    }
  }

  // Transport requires start + end date validation
  if (productOwner.providerType === 'Transport') {
    if (!payload.startDateAndTime || !payload.endDateAndTime) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Start and end date/time required.'
      );
    }

    const start = new Date(payload.startDateAndTime);
    const end = new Date(payload.endDateAndTime);

    if (isPastDate(start)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Start date/time cannot be in the past.'
      );
    }

    if (end <= start) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'End date must be later than start date.'
      );
    }
  }
  // Ski Hire optional date check
  if (productOwner.providerType === 'Ski_Hire') {
    if (payload.date && isPastDate(payload.date)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Booking date cannot be in the past.'
      );
    }
  }
  // model swhicher
  let totalPrice = 0;
  let validatedItems: any[] = [];

  switch (productOwner?.providerType) {
    // Restaurant
    case 'Restaurant': {
      if (!payload.slots?.length)
        throw new AppError(StatusCodes.BAD_REQUEST, 'Slots are required.');

      if (!payload.bookingItems?.length)
        throw new AppError(StatusCodes.BAD_REQUEST, 'Booking items required.');

      const updatedItems = matchedProduct.items.map((item: any) => {
        const booked = payload.bookingItems.find(
          (b: any) => b.itemId.toString() === item._id.toString()
        );

        if (booked) {
          // Check quantity
          if (item.availableQty < booked.quantity) {
            throw new AppError(
              StatusCodes.BAD_REQUEST,
              `Insufficient quantity for ${item.seat}. Only ${item.availableQty} available.`
            );
          }

          const newAvailableQty = item.availableQty - booked.quantity;

          validatedItems.push({
            itemId: item._id,
            seat: item.seat,
            quantity: booked.quantity,
            price: item.price,
            total: item.price * booked.quantity,
          });

          // Return updated item
          return {
            ...item.toObject(),
            availableQty: newAvailableQty,
          };
        }
        return item;
      });
      // collect again total price with service fee
      const newTotalPrice = validatedItems.reduce((a, b) => a + b.total, 0);
      totalPrice = newTotalPrice + matchedProduct?.serviceFee || 0;

      // totalPrice = validatedItems.reduce((a, b) => a + b.total, 0);

      const validSlotIds = matchedProduct.availableSlots.map((s: any) =>
        s._id.toString()
      );

      const invalid = payload.slots.filter(
        (s: string) => !validSlotIds.includes(s.toString())
      );

      if (invalid.length)
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Invalid slot(s): ${invalid.join(', ')}`
        );

      // Remove booked slots
      const remainingSlots = matchedProduct.availableSlots.filter(
        (s: any) => !payload.slots.includes(s._id.toString())
      );

      //  Update both items
      await Restaurant.updateOne(
        { _id: matchedProduct._id },
        {
          $set: {
            items: updatedItems,
            availableSlots: remainingSlots,
          },
        }
      );
      break;
    }
    // ski hire
    case 'Ski_Hire': {
      if (!payload.bookingItems?.length)
        throw new AppError(StatusCodes.BAD_REQUEST, 'Booking items required.');

      const dbSkiHire = await SkiHire.findById(matchedProduct._id);

      const updatedItems = dbSkiHire.items.map(item => {
        const booked = payload.bookingItems.find(
          b => b.itemId.toString() === item._id.toString()
        );

        if (booked) {
          if (item.availableQty < booked.quantity)
            throw new AppError(
              StatusCodes.BAD_REQUEST,
              `Insufficient quantity for ${item.productName}. Only ${item.availableQty} units are available. `
            );

          totalPrice += item.price * booked.quantity;

          return {
            ...item.toObject(),
            availableQty: item.availableQty - booked.quantity,
          };
        }
        return item;
      });

      await SkiHire.updateOne(
        { _id: matchedProduct._id },
        { $set: { items: updatedItems } }
      );

      break;
    }
    // transport
    case 'Transport': {
      if (!payload.startDateAndTime || !payload.endDateAndTime)
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'Start & End date/time required.'
        );

      totalPrice = matchedProduct.amount || 0;
      break;
    }
    // ski pass
    case 'Ski_Pass': {
      totalPrice = matchedProduct.amount || 0;
      break;
    }
    // massage
    case 'Massage': {
      totalPrice = payload.totalPrice || 0;
      break;
    }
    default:
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid provider type.');
  }

  // creat booking data
  const bookingData: Partial<IBooking> = {
    ...payload,
    user: dbUser._id,
    product: payload.productId,
    productModel: productModelName,
    category: productOwner.providerType,
    totalPrice,
  };

  // create booking
  const newBooking = await Booking.create(bookingData);

  if (!newBooking)
    throw new AppError(StatusCodes.BAD_REQUEST, 'Booking not created.');

  // WALLET UPDATE
  const wallet = await Wallet.findOne({ user: productOwner?._id });
  if (wallet) {
    wallet.balance += totalPrice;
    wallet.transactions.push({
      user: productOwner._id,
      balance: totalPrice,
      type: WalletTransactionType.EARN,
    });
    await wallet.save();
  }
  const paymentPayload: IPayment = {
    booking: new Types.ObjectId(newBooking?._id),
    user: new Types.ObjectId(userId),
    transactionId: generateTransactionId(),
    amount: totalPrice,
    status: TransactionStatus.PAID,
    gateway: PaymentGateway.STRIPE,
    paymentMethodType: 'Card',
  };
  // create payment
  await Payment.create(paymentPayload);

  // send notificatin
  await Notification.create({
    receiverId: dbUser?._id,
    senderId: productOwner?._id,
    title: 'Payment Successful',
    description: `Your payment of ${totalPrice} has been successfully made.`,
    type: 'payment',
  });

  return newBooking;
};

const updateBookingIntoDB = async (
  user: JwtPayload,
  payload: { bookingStatus?: BookingStatus; isPermitted?: boolean },
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

  // hold update date here
  const updateData: any = {};

  if (payload.bookingStatus !== undefined) {
    updateData.bookingStatus = payload.bookingStatus;
  }

  if (payload.isPermitted !== undefined) {
    updateData.isPermitted = payload.isPermitted;
  }

  // Nothing to update?
  if (Object.keys(updateData).length === 0) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'No valid fields to update.');
  }

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
    { $set: updateData },
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

  // const result = await Booking.findByIdAndUpdate(
  //   bookingId,
  //   { $set: { bookingStatus: 'Cancel' } },
  //   { new: true }
  // )
  //   .populate('user', 'fullName email')
  //   .populate('product');

  // Identify the correct product model dynamically
  const productId = existsBooking?.product;
  const productModel = existsBooking?.productModel;

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
  // // find owner wallet
  // const ownerWallet = await Wallet.findOne({ user: product.owner });
  // if (!ownerWallet) {
  //   throw new AppError(StatusCodes.NOT_FOUND, 'Owner wallet not found.');
  // }
  // // find user wallet
  // const userWallet = await Wallet.findOne({ user: isExistsUser?._id });
  // if (!userWallet) {
  //   throw new AppError(StatusCodes.NOT_FOUND, 'User wallet not found.');
  // }
  // // calculate refund
  // const finalRefund = Number((existsBooking.totalPrice * 0.9).toFixed(2));

  // await Wallet.updateOne(
  //   { user: product.owner },
  //   { $inc: { balance: -finalRefund } } // decrease balance
  // );

  // ownerWallet.transactions.push({
  //   user: isExistsUser._id,
  //   balance: finalRefund,
  //   type: WalletTransactionType.SEND,
  // });

  // await ownerWallet.save();

  // userWallet.balance += finalRefund;
  // userWallet.transactions.push({
  //   user: product.owner,
  //   balance: finalRefund,
  //   type: WalletTransactionType.RECEIVE,
  // });

  // await userWallet.save();

  // // send notification
  // await Notification.create({
  //   receiverId: product.owner,
  //   senderId: isExistsUser._id,
  //   title: 'Cancel Booking',
  //   description: `${product?.title} is canceled by ${isExistsUser?.fullName}, product id:# ${product?._id}`,
  //   type: 'payment',
  // });

  // // Prevent duplicate refunds
  // const alreadyRefunded = product.refunds?.some(
  //   (refund: IRefund) =>
  //     refund.userId.toString() === isExistsUser._id.toString()
  // );

  // if (alreadyRefunded) {
  //   throw new AppError(
  //     StatusCodes.BAD_REQUEST,
  //     'You have already refunded or canceled this product.'
  //   );
  // }

  // restore available product totalQty and slots
  // Restore for Restaurant
  if (productModel === 'Restaurant') {
    if (existsBooking.slots && existsBooking.slots.length > 0) {
      existsBooking.slots.forEach(slotIdStr => {
        const slotId = new mongoose.Types.ObjectId(slotIdStr);

        const slot = product.slots.find(s => s._id && s._id.equals(slotId));

        if (slot) {
          const alreadyAvailable = product.availableSlots.some(
            s => s._id && s._id.equals(slot._id)
          );

          if (!alreadyAvailable) {
            product.availableSlots.push({
              _id: slot._id,
              startTime: slot.startTime,
              endTime: slot.endTime,
            });
          }
        }
      });
    }

    // Restore item quantities (VIP / Normal)
    if (existsBooking.bookingItems && existsBooking.bookingItems.length > 0) {
      existsBooking.bookingItems.forEach(item => {
        const itemId = new mongoose.Types.ObjectId(item.itemId);

        const foundItem = product.items.find(
          i => i._id && i._id.equals(itemId)
        );

        if (foundItem) {
          foundItem.availableQty += item.quantity; // restore quantity

          if (foundItem.availableQty > foundItem.totalQty) {
            foundItem.availableQty = foundItem.totalQty;
          }
        }
        console.log('find current items :', foundItem);
      });
    }
    // await product.save({ validateBeforeSave: false });
  }

  // Restore for SkiHire
  if (productModel === 'SkiHire') {
    if (existsBooking.bookingItems && existsBooking.bookingItems.length > 0) {
      existsBooking.bookingItems.forEach(item => {
        const itemId = new mongoose.Types.ObjectId(item.itemId);

        const foundItem = product.items.find(
          i => i._id && i._id.equals(itemId)
        );

        if (foundItem) {
          foundItem.availableQty += item.quantity;

          if (foundItem.availableQty > foundItem.totalQty) {
            foundItem.availableQty = foundItem.totalQty;
          }
        }
        console.log('find current items :', foundItem);
      });
    }

    // await product.save({ validateBeforeSave: false });
  }

  // ==================== END RESTORE LOGIC ====================

  // // Add refund info
  // const newRefund = {
  //   userId: isExistsUser._id,
  //   reason: payload.reason,
  //   createdAt: new Date(),
  // } as IRefund;

  // if (!product.refunds) product.refunds = [];

  // product.refunds.push(newRefund);

  // await product.save();

  // return result;
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
