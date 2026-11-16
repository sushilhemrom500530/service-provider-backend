import mongoose, { Types, Model } from 'mongoose';
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
import Stripe from 'stripe';
import crypto from 'crypto';
import stripe from './../../utils/stripe';
import { config } from './../../config';
import { BookingDraft } from './bookingDraft.model';
import { Wallet } from './../wallet/wallet.model';
import { WalletTransactionType } from './../wallet/wallet.interface';
import { format } from 'date-fns';
import { IRefund } from '../common/common.interface';
import { isPastDate } from './../../utils/isPassTimeCheck';
import { Payment } from './../payment/payment.model';
import { generateTransactionId } from './../../utils/generateTransactionId';
import { Notification } from './../notification/notification.model';
import { Category } from './../category/category.model';
import {
  TransactionStatus,
  PaymentGateway,
  IPayment,
} from './../payment/payment.interface';

// Provider details shown to the customer on a booking.
// `owner._id` is the provider's user id, used to start a chat.
const PROVIDER_CONTACT_FIELDS =
  '_id fullName phoneNumber profileUrl providerType';

// A rental is "open" (time left / overtime is shown) only in these states
const isOpenRentalStatus = (status: unknown) =>
  ['Active', 'Pending'].includes(String(status));

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
    const models: Model<any>[] = [
      SkiPass,
      SkiHire,
      Transport,
      Restaurant,
      Massage,
    ];

    for (const ModelItem of models) {
      const matched = await ModelItem.find({
        title: { $regex: search, $options: 'i' },
      }).select('_id');

      if (matched.length > 0) {
        productIds.push(...matched.map((p: any) => p._id.toString()));
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
    .populate('user', 'fullName profileUrl email address phoneNumber')
    .sort({ createdAt: -1 });

  const allBookings = await bookingQuery.clone();

  const filtered = allBookings.filter(b => b?.product !== null);

  const total = filtered.length;

  const result = filtered.slice(skip, skip + limit).map((booking: any) => {
    // pick only required product fields
    const product = booking.product
      ? {
        _id: booking.product._id,
        thumbnail: booking?.product?.thumbnail || '',
        title: booking?.product?.title,
        skiPassType: booking?.product?.skiPassType || '',
        serviceArea: booking?.product?.serviceArea || '',
      }
      : null;

    // slots mapping (same logic)
    const fullSlots = (booking.slots || [])
      .map((slotId: any) => {
        return booking.product?.slots?.find(
          (s: any) => s._id.toString() === slotId.toString(),
        );
      })
      .filter(Boolean);

    // bookingItems with full details
    const fullBookingItems = booking?.bookingItems?.map((item: any) => {
      const fullItem =
        booking.product?.items?.find(
          (p: any) => p._id.toString() === item.itemId.toString(),
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

// const getSingleBookingFromDB = async (id: string, user: JwtPayload) => {
//   const isExistsUser = await User.findOne({ email: user?.email });
//   if (!isExistsUser)
//     throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

//   const booking = await Booking.findById(id)
//     .populate({
//       path: 'product',
//       select:
//         '-owner -totalPrice -__v -reviews -refunds -averageRating -createdAt -updatedAt',
//     })
//     .populate(
//       'user',
//       '_id fullName email profileUrl address phoneNumber status',
//     )
//     .lean();

//   if (!booking) {
//     throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
//   }

//   const product = booking?.product as any;
//   // const product = booking?.product || [];
//   const productItems = product?.items || [];
//   // console.log('product', product);
//   // const enrichedBookingItems = booking?.bookingItems.map((bi: any) => {
//   const enrichedBookingItems = (booking?.bookingItems || []).map((bi: any) => {
//     const matchedItem =
//       productItems.find(
//         (itm: any) => itm._id.toString() === bi.itemId.toString(),
//       ) || null;

//     return {
//       ...bi,
//       item: matchedItem ? { ...matchedItem } : null,
//     };
//   });

//   const slots = (booking?.slots || [])
//     .map((slotId: any) => {
//       return product.slots.find(
//         (s: any) => s._id.toString() === slotId.toString(),
//       );
//     })
//     .filter(Boolean);

//   delete product.items;

//   // return product;

//   return {
//     ...booking,
//     product,
//     bookingItems: enrichedBookingItems,
//     slots,
//   };
// };

const getSingleBookingFromDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  const booking = await Booking.findById(id)
    .populate({
      path: 'product',
      select:
        '-totalPrice -__v -reviews -refunds -averageRating -createdAt -updatedAt',
      // provider contact, so the customer can call or chat with the provider
      populate: { path: 'owner', select: PROVIDER_CONTACT_FIELDS },
    })
    .populate(
      'user',
      '_id fullName email profileUrl address phoneNumber status',
    )
    .lean({ defaults: true });

  if (!booking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  }

  /* -------------------- Helpers -------------------- */
  // const msToTime = (ms: number) => {
  //   const totalSeconds = Math.floor(ms / 1000);
  //   const hours = Math.floor(totalSeconds / 3600);
  //   const minutes = Math.floor((totalSeconds % 3600) / 60);
  //   return `${hours}h ${minutes}m`;
  // };

  const msToTime = (ms: number) => {
    let seconds = Math.floor(ms / 1000);

    const year = 60 * 60 * 24 * 365;
    const month = 60 * 60 * 24 * 30;
    const week = 60 * 60 * 24 * 7;
    const day = 60 * 60 * 24;
    const hour = 60 * 60;

    const parts: string[] = [];

    const years = Math.floor(seconds / year);
    if (years) {
      parts.push(`${years} year${years > 1 ? 's' : ''}`);
      seconds %= year;
    }

    const months = Math.floor(seconds / month);
    if (months) {
      parts.push(`${months} month${months > 1 ? 's' : ''}`);
      seconds %= month;
    }

    const weeks = Math.floor(seconds / week);
    if (weeks) {
      parts.push(`${weeks} week${weeks > 1 ? 's' : ''}`);
      seconds %= week;
    }

    const days = Math.floor(seconds / day);
    if (days) {
      parts.push(`${days} day${days > 1 ? 's' : ''}`);
      seconds %= day;
    }

    const hours = Math.floor(seconds / hour);
    if (hours) {
      parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    }

    if (parts.length === 0) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }

    return parts.slice(0, 2).join(' ');
  };

  /* -------------------- Product & Category -------------------- */
  const product = booking.product as any;

  if (product?.category) {
    const categoryDoc = await Category.findOne(
      { 'subCategory._id': product.category },
      { 'subCategory.$': 1, primaryCategoryName: 1 },
    );

    // Check if categoryDoc and subCategory array actually exist
    if (
      categoryDoc &&
      categoryDoc.subCategory &&
      categoryDoc.subCategory.length > 0
    ) {
      const subCat = categoryDoc.subCategory[0];
      product.category = {
        // Use type assertion or check for toObject explicitly
        ...(typeof (subCat as any).toObject === 'function'
          ? (subCat as any).toObject()
          : subCat),
      };
    }
  }

  // if (product?.category) {
  //   const categoryDoc = await Category.findOne(
  //     { 'subCategory._id': product.category },
  //     { 'subCategory.$': 1, primaryCategoryName: 1 },
  //   );

  //   if (categoryDoc) {
  //     product.category = {
  //       ...(categoryDoc.subCategory[0].toObject?.() ||
  //         categoryDoc.subCategory[0]),
  //     };
  //   }
  // }

  /* -------------------- Product Items -------------------- */
  const productItems = product?.items || [];

  const enrichedBookingItems = (booking?.bookingItems || []).map((bi: any) => {
    const matchedItem =
      productItems.find(
        (itm: any) => itm?._id?.toString() === bi?.itemId?.toString(),
      ) || null;

    return {
      ...bi,
      item: matchedItem ? { ...matchedItem } : null,
    };
  });

  /* -------------------- Slots -------------------- */
  const slots = (booking?.slots || [])
    .map((slotId: any) =>
      product?.slots?.find(
        (s: any) => s?._id?.toString() === slotId?.toString(),
      ),
    )
    .filter(Boolean);

  /* -------------------- Time & Overtime -------------------- */
  const startTime = new Date(booking?.startDateAndTime || '');
  const endTime = new Date(booking?.endDateAndTime || '');

  let timeLabel: string | undefined;
  let overTimeAmount = 0;

  // overtime only runs while the rental is still open: a Completed,
  // Cancelled or Deleted booking (or one without a valid end) has none
  const isOpenRental = ['Active', 'Pending'].includes(
    booking?.bookingStatus as string,
  );

  if (
    ['Ski_Hire', 'Transport'].includes(booking?.category) &&
    isOpenRental &&
    !isNaN(endTime.getTime())
  ) {
    if (!booking?.returnedAt) { // overtime runs until the items are returned
      const now = new Date();

      if (now < endTime) {
        const timeLeft = endTime.getTime() - now.getTime();
        timeLabel = `Time Left: ${msToTime(timeLeft)}`;
      } else {
        const overMs = now.getTime() - endTime.getTime();
        timeLabel = `Over Time: ${msToTime(overMs)}`;

        const overHours = overMs / (1000 * 60 * 60);

        let hourlyRate = 0;
        if (booking?.category === 'Ski_Hire') {
          hourlyRate = Number(product?.extraChargePerHour || 0);
        }
        if (booking?.category === 'Transport') {
          hourlyRate = Number(product?.extraChargePerHours || 0);
        }

        overTimeAmount = Number((overHours * hourlyRate).toFixed(2));
      }
    }
  }

  /* -------------------- Cleanup -------------------- */
  if (product) {
    delete product.items;
  }

  /* -------------------- Final Response -------------------- */
  return {
    ...booking,
    product,
    bookingItems: enrichedBookingItems,
    slots,
    startTime,
    endTime,
    ...(timeLabel && { timeLabel }),
    ...(overTimeAmount > 0 && { overTimeAmount }),
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
        '-totalPrice -__v -reviews -refunds -averageRating -createdAt -updatedAt -slots -availableSlots',
      populate: { path: 'owner', select: PROVIDER_CONTACT_FIELDS },
    })
    .populate(
      'user',
      '_id fullName email profileUrl address phoneNumber status',
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
  const bookingStatus = query?.bookingStatus?.toLowerCase() || '';

  if (!category) {
    return [];
  }

  // const msToTime = (ms: number) => {
  //   const totalSeconds = Math.floor(ms / 1000);
  //   const hours = Math.floor(totalSeconds / 3600);
  //   const minutes = Math.floor((totalSeconds % 3600) / 60);
  //   return `${hours}h ${minutes}m`;
  // };

  const msToTime = (ms: number) => {
    let seconds = Math.floor(ms / 1000);

    const year = 60 * 60 * 24 * 365;
    const month = 60 * 60 * 24 * 30;
    const week = 60 * 60 * 24 * 7;
    const day = 60 * 60 * 24;
    const hour = 60 * 60;

    const parts: string[] = [];

    const years = Math.floor(seconds / year);
    if (years) {
      parts.push(`${years} year${years > 1 ? 's' : ''}`);
      seconds %= year;
    }

    const months = Math.floor(seconds / month);
    if (months) {
      parts.push(`${months} month${months > 1 ? 's' : ''}`);
      seconds %= month;
    }

    const weeks = Math.floor(seconds / week);
    if (weeks) {
      parts.push(`${weeks} week${weeks > 1 ? 's' : ''}`);
      seconds %= week;
    }

    const days = Math.floor(seconds / day);
    if (days) {
      parts.push(`${days} day${days > 1 ? 's' : ''}`);
      seconds %= day;
    }

    const hours = Math.floor(seconds / hour);
    if (hours) {
      parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    }

    if (parts.length === 0) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }

    return parts.slice(0, 2).join(' ');
  };

  // Map and enrich bookings
  let bookingsWithTimeInfo = bookings.map(booking => {
    const product = booking.product
      ? (booking.product as any).toObject?.() || booking.product
      : null;
    const productItems = product?.items || [];

    const startTime = new Date(booking?.startDateAndTime || '');
    const endTime = new Date(booking?.endDateAndTime || '');
    let bookingSeatCount: number = 0;
    let label: string | undefined;
    let overTimeAmount: number = 0;

    // overtime only while the rental is still open (same rule as GET /booking/:id)
    if (
      ['Ski_Hire', 'Transport'].includes(booking?.category) &&
      isOpenRentalStatus(booking?.bookingStatus) &&
      !isNaN(endTime.getTime())
    ) {
      if (!booking?.returnedAt) { // overtime runs until the items are returned
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
        (itm: any) => itm?._id?.toString() === bi?.itemId?.toString(),
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
      b.product?.title?.toLowerCase().includes(search),
    );
  }

  // FIXED BUG: category optional
  if (category) {
    bookingsWithTimeInfo = bookingsWithTimeInfo.filter(
      b => b.category?.toLowerCase() === category,
    );
  }

  if (bookingStatus) {
    bookingsWithTimeInfo = bookingsWithTimeInfo.filter(
      b => b.bookingStatus?.toLowerCase() === bookingStatus,
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

const getMyAllBookingIntoDB = async (user: JwtPayload, query: any) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser)
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  const bookings = await Booking.find({ user: isExistsUser._id })
    .populate({
      path: 'product',
      select:
        'title thumbnail serviceFee serviceArea description category items extraChargePerHour extraChargePerHours owner',
      populate: { path: 'owner', select: PROVIDER_CONTACT_FIELDS },
    })
    .sort({ createdAt: -1 });

  const bookingsWithCategory = await Promise.all(
    bookings.map(async b => {
      const bookingObj = typeof b.toObject === 'function' ? b.toObject() : b;
      let product = bookingObj.product as any;
      if (product && typeof product.toObject === 'function')
        product = product.toObject();

      if (bookingObj.productModel === 'Restaurant' && product?.category) {
        const categoryDoc = await Category.findOne(
          {
            primaryCategoryName: 'Restaurant',
            'subCategory._id': product?.category,
          },
          { 'subCategory.$': 1 },
        );
        product.category = categoryDoc?.subCategory?.[0] || null;
      }

      return { ...bookingObj, product };
    }),
  );

  // Short helper for time formatting
  // const msToTime = (ms: number) =>
  //   `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;

  const msToTime = (ms: number) => {
    let seconds = Math.floor(ms / 1000);

    const year = 60 * 60 * 24 * 365;
    const month = 60 * 60 * 24 * 30;
    const week = 60 * 60 * 24 * 7;
    const day = 60 * 60 * 24;
    const hour = 60 * 60;

    const parts: string[] = [];

    const years = Math.floor(seconds / year);
    if (years) {
      parts.push(`${years} year${years > 1 ? 's' : ''}`);
      seconds %= year;
    }

    const months = Math.floor(seconds / month);
    if (months) {
      parts.push(`${months} month${months > 1 ? 's' : ''}`);
      seconds %= month;
    }

    const weeks = Math.floor(seconds / week);
    if (weeks) {
      parts.push(`${weeks} week${weeks > 1 ? 's' : ''}`);
      seconds %= week;
    }

    const days = Math.floor(seconds / day);
    if (days) {
      parts.push(`${days} day${days > 1 ? 's' : ''}`);
      seconds %= day;
    }

    const hours = Math.floor(seconds / hour);
    if (hours) {
      parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    }

    if (parts.length === 0) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }

    return parts.slice(0, 2).join(' ');
  };

  const enrichedBookings = bookingsWithCategory.map((b: any) => {
    const productItems = b?.product?.items || [];
    let bookingSeatCount = 0;
    let timeLabel: string | undefined;
    let overTimeAmount = 0;

    if (
      ['Ski_Hire', 'Transport'].includes(b.category) &&
      b.endDateAndTime &&
      isOpenRentalStatus(b.bookingStatus) &&
      !b.returnedAt
    ) {
      const now = new Date(),
        endTime = new Date(b.endDateAndTime);
      const diffMs = now.getTime() - endTime.getTime();
      if (diffMs < 0) timeLabel = `Time Left: ${msToTime(-diffMs)}`;
      else {
        timeLabel = `Over Time: ${msToTime(diffMs)}`;
        const hourlyRate =
          b.category === 'Ski_Hire'
            ? Number(b.product?.extraChargePerHour || 0)
            : Number(b.product?.extraChargePerHours || 0);
        overTimeAmount = +((diffMs / 3600000) * hourlyRate).toFixed(2);
      }
    }

    const bookingItems = (b.bookingItems || []).map((bi: any) => {
      bookingSeatCount = bi?.quantity || 0;
      const item =
        productItems.find(
          (i: any) => i._id?.toString() === bi?.itemId?.toString(),
        ) || null;
      return { ...bi, item };
    });

    return {
      ...b,
      product: b.product && { ...b.product, items: undefined },
      bookingItems,
      startTime: b.startDateAndTime,
      endTime: b.endDateAndTime,
      timeLabel,
      overTimeAmount: overTimeAmount || undefined,
      bookingSeatCount:
        b.category === 'Restaurant' ? bookingSeatCount : undefined,
    };
  });

  // Apply filters
  const search = query?.search?.toLowerCase();
  const category = query?.category?.toLowerCase();
  const filtered = enrichedBookings.filter(
    b =>
      (!search || b.product?.title?.toLowerCase().includes(search)) &&
      (!category || b.category?.toLowerCase() === category),
  );

  const page = Number(query?.page) || 1;
  const limit = Number(query?.limit) || 10;
  const startIndex = (page - 1) * limit;

  return {
    pagination: {
      total: filtered.length,
      page,
      limit,
      totalPages: Math.ceil(filtered.length / limit),
    },
    result: filtered.slice(startIndex, startIndex + limit) || [],
  };
};

const getMyBookingForHome = async (user: JwtPayload, selectedDate: string) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser)
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  const bookings = await Booking.find({ user: isExistsUser._id })
    .populate('user', 'fullName email address phoneNumber')
    .populate({
      path: 'product',
      select:
        'title category serviceArea amount startDateAndTime endDateAndTime time owner',
      populate: { path: 'owner', select: PROVIDER_CONTACT_FIELDS },
    })
    .sort({ createdAt: -1 });
  // console.log('booking data :', bookings);
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

// ---------------------------------------------------------------------------
// Stripe payment helpers (POST /booking/intent  ->  POST /booking/create)
// ---------------------------------------------------------------------------

const BOOKING_PRODUCT_MODELS: Record<string, any> = {
  SkiPass,
  SkiHire,
  Transport,
  Restaurant,
  Massage,
};

// Stripe works in the smallest currency unit (cents)
const toMinorUnit = (amount: number) => Math.round(Number(amount) * 100);

/**
 * Server-side price for categories whose pricing rule is known.
 * Returns null when the category still uses the price sent by the app.
 *  - Ski Pass: pass amount x number of guests (personCount, default 1)
 */
const calculateServerPrice = (
  providerType: string,
  product: any,
  payload: any,
): number | null => {
  if (providerType === 'Ski_Pass') {
    const guests =
      payload.personCount === undefined || payload.personCount === null
        ? 1
        : Number(payload.personCount);

    if (!Number.isInteger(guests) || guests < 1)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Person count must be a whole number of at least 1.',
      );

    const unitPrice = Number(product?.amount);
    if (!unitPrice || unitPrice <= 0)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'This ski pass has no valid price.',
      );

    return Math.round(unitPrice * guests * 100) / 100;
  }

  if (providerType === 'Ski_Hire') {
    const { units } = getSkiHireRentalUnits(product, payload);

    let total = 0;
    for (const booked of payload.bookingItems || []) {
      const item = product?.items?.find(
        (i: any) => i._id.toString() === booked.itemId?.toString(),
      );
      if (!item)
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Invalid booking item: ${booked.itemId}`,
        );
      total += Number(item.price) * Number(booked.quantity) * units;
    }

    return Math.round(total * 100) / 100;
  }

  // Restaurant: Σ seat price x seats booked + the restaurant's service fee
  if (providerType === 'Restaurant') {
    let total = 0;
    for (const booked of payload.bookingItems || []) {
      const item = product?.items?.find(
        (i: any) => i._id.toString() === booked.itemId?.toString(),
      );
      if (!item)
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Invalid booking item: ${booked.itemId}`,
        );
      total += Number(item.price) * Number(booked.quantity);
    }
    total += Number(product?.serviceFee || 0);
    return Math.round(total * 100) / 100;
  }

  // Massage: the price of the chosen duration (priceByDuration),
  // or the listing amount when it has no duration prices
  if (providerType === 'Massage') {
    const options: any[] = product?.priceByDuration || [];
    if (!options.length) {
      const amount = Number(product?.amount);
      if (!amount || amount <= 0)
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'This massage has no valid price.',
        );
      return Math.round(amount * 100) / 100;
    }

    const wanted = normalizeDuration(payload.duration);
    const option = options.find(o => normalizeDuration(o.duration) === wanted);
    if (!wanted || !option)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Choose one of the available durations: ${options.map(o => o.duration).join(', ')}.`,
      );
    if (!(Number(option.amount) > 0))
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'This massage duration has no valid price.',
      );
    return Math.round(Number(option.amount) * 100) / 100;
  }

  // Transport: the listing amount for the booking
  if (providerType === 'Transport') {
    const amount = Number(product?.amount);
    if (!amount || amount <= 0)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'This transport has no valid price.',
      );
    return Math.round(amount * 100) / 100;
  }

  return null;
};

// "60 min", "60min", " 60 MIN " -> "60min"
const normalizeDuration = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '');

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Ski Hire rental length in the listing's price unit.
 *  per_day    -> started days   (21 days = 21, 1 day 2 h = 2)
 *  per_hour   -> started hours
 *  per_rental -> 1, whatever the length
 */
const getSkiHireRentalUnits = (product: any, payload: any) => {
  const unit: string = product?.priceUnit || 'per_day';

  const start = new Date(payload.startDateAndTime);
  const end = new Date(payload.endDateAndTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start)
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Valid start and end date/time are required for Ski Hire.',
    );

  const ms = end.getTime() - start.getTime();
  let units = 1;
  if (unit === 'per_day') units = Math.max(1, Math.ceil(ms / MS_PER_DAY));
  if (unit === 'per_hour') units = Math.max(1, Math.ceil(ms / MS_PER_HOUR));

  return { unit, units };
};

// "itemId:qty" list in a fixed order, to compare intent and create
const bookingItemsSignature = (items: any[] = []) =>
  items
    .map(i => `${i.itemId}:${Number(i.quantity)}`)
    .sort()
    .join(',');

// ISO string of a date input, or '' when missing/invalid (never throws)
const toIsoOrEmpty = (value: any) => {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString();
};

// short hash so the value fits in Stripe metadata (max 500 chars)
const hashSignature = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);

/**
 * Date-aware stock check for Ski Hire: for each item, the quantity already
 * booked by OTHER active rentals that overlap the requested period, plus
 * the requested quantity, must not exceed the item's total stock.
 */
const checkSkiHireAvailability = async (product: any, payload: any) => {
  const start = new Date(payload.startDateAndTime);
  const end = new Date(payload.endDateAndTime);

  const overlapping = await Booking.find({
    product: product._id,
    category: 'Ski_Hire',
    bookingStatus: { $in: ['Active', 'Pending'] },
    startDateAndTime: { $lt: end },
    endDateAndTime: { $gt: start },
  }).select('bookingItems');

  for (const booked of payload.bookingItems || []) {
    const item = product.items?.find(
      (i: any) => i._id.toString() === booked.itemId?.toString(),
    );
    if (!item) continue; // reported by the item check

    const alreadyBooked = overlapping.reduce((sum: number, b: any) => {
      const same = (b.bookingItems || []).find(
        (bi: any) => bi.itemId?.toString() === booked.itemId?.toString(),
      );
      return sum + (same ? Number(same.quantity) : 0);
    }, 0);

    const free = Number(item.totalQty) - alreadyBooked;
    if (Number(booked.quantity) > free)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `${item.productName} is not available for these dates. Only ${Math.max(free, 0)} left.`,
      );
  }
};

/**
 * Read-only pre-check of a booking request.
 * Runs the same rules as addBookingIntoDB (user, product, dates, stock, slots)
 * WITHOUT changing anything in the database, so the user is never charged
 * for a booking that would be rejected afterwards.
 */
const validateBookingRequest = async (user: JwtPayload, payload: any) => {
  const dbUser = await User.findOne({ email: user?.email });
  if (!dbUser) throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  if (!dbUser._id.equals(payload.userId))
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User ID mismatch.');

  if (
    ['Delete', 'Blocked', 'Banned', 'Inactive', 'Unverified'].includes(
      dbUser.status,
    )
  )
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      'This user status is not active.',
    );

  if (!payload.productId || !Types.ObjectId.isValid(payload.productId))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Valid product ID is required.');

  let matchedProduct: any = null;
  let productModelName: string | null = null;

  for (const [modelName, Model] of Object.entries(BOOKING_PRODUCT_MODELS)) {
    const found = await Model.findById(payload.productId);
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

  const providerType = productOwner.providerType as string;

  // ----- timezone rule -----
  // A date with a time but no timezone ("2026-05-30T20:00") is read by the
  // server as UTC, which shifts the booking by the user's offset (even a day).
  for (const field of ['date', 'startDateAndTime', 'endDateAndTime']) {
    const v = payload[field];
    if (
      typeof v === 'string' &&
      /T\d{2}:\d{2}/.test(v) &&
      !/(Z|[+-]\d{2}:?\d{2})$/i.test(v.trim())
    )
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `${field} must include a timezone, e.g. "2026-05-30T20:00:00+02:00" or "2026-05-30T18:00:00Z".`,
      );
  }

  // ----- date rules -----
  if (['Ski_Pass', 'Restaurant', 'Massage'].includes(providerType)) {
    if (!payload.date)
      throw new AppError(StatusCodes.BAD_REQUEST, 'Booking date is required.');
    if (isPastDate(payload.date))
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Booking date cannot be in the past.',
      );
  }

  if (providerType === 'Transport') {
    if (!payload.startDateAndTime || !payload.endDateAndTime)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Start and end date/time required.',
      );
    const start = new Date(payload.startDateAndTime);
    const end = new Date(payload.endDateAndTime);
    if (isPastDate(start))
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Start date/time cannot be in the past.',
      );
    if (end <= start)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'End date must be later than start date.',
      );
  }

  if (providerType === 'Ski_Hire' && payload.date && isPastDate(payload.date))
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Booking date cannot be in the past.',
    );

  // Ski Hire is priced and stock-checked by rental period
  if (providerType === 'Ski_Hire') {
    if (!payload.startDateAndTime || !payload.endDateAndTime)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Start and end date/time required for Ski Hire.',
      );
    const start = new Date(payload.startDateAndTime);
    const end = new Date(payload.endDateAndTime);
    if (isPastDate(start))
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Start date/time cannot be in the past.',
      );
    if (end <= start)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'End date must be later than start date.',
      );
  }

  // ----- stock / slot rules -----
  const checkItemsStock = (nameField: string) => {
    if (!payload.bookingItems?.length)
      throw new AppError(StatusCodes.BAD_REQUEST, 'Booking items required.');

    for (const booked of payload.bookingItems) {
      const item = matchedProduct.items?.find(
        (i: any) => i._id.toString() === booked.itemId?.toString(),
      );
      if (!item)
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Invalid booking item: ${booked.itemId}`,
        );
      if (item.availableQty < booked.quantity)
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Insufficient quantity for ${item[nameField]}. Only ${item.availableQty} available.`,
        );
    }
  };

  switch (providerType) {
    case 'Restaurant': {
      if (!payload.slots?.length)
        throw new AppError(StatusCodes.BAD_REQUEST, 'Slots are required.');
      checkItemsStock('seat');

      const validSlotIds = (matchedProduct.availableSlots || []).map((s: any) =>
        s._id.toString(),
      );
      const invalid = payload.slots.filter(
        (s: string) => !validSlotIds.includes(s.toString()),
      );
      if (invalid.length)
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Invalid slot(s): ${invalid.join(', ')}`,
        );
      break;
    }
    case 'Ski_Hire':
      checkItemsStock('productName');
      await checkSkiHireAvailability(matchedProduct, payload);
      break;
    case 'Transport':
    case 'Ski_Pass':
    case 'Massage':
      break;
    default:
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid provider type.');
  }

  return { dbUser, matchedProduct, productModelName, productOwner };
};

/**
 * POST /booking/intent
 * Validates the booking and creates a Stripe PaymentIntent for it.
 * Returns the clientSecret + publishable key the frontend needs to open
 * the Stripe payment sheet. Nothing is saved in our database here.
 */
const createPaymentIntentIntoDB = async (user: JwtPayload, payload: any) => {
  if (!config.stripe.secretKey)
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      'Stripe is not configured on the server.',
    );

  const { dbUser, matchedProduct, productModelName, productOwner } =
    await validateBookingRequest(user, payload);

  // server price wins where a rule exists (e.g. Ski Pass = amount x guests)
  const serverPrice = calculateServerPrice(
    productOwner.providerType as string,
    matchedProduct,
    payload,
  );
  const totalPrice =
    serverPrice !== null ? serverPrice : Number(payload.totalPrice);
  if (!totalPrice || totalPrice <= 0)
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Total price must be greater than 0.',
    );

  const amount = toMinorUnit(totalPrice);
  const currency = config.stripe.currency;

  // Ski Hire: lock the rental period and items that were priced
  const isSkiHire = productOwner.providerType === 'Ski_Hire';
  const rental = isSkiHire
    ? getSkiHireRentalUnits(matchedProduct, payload)
    : null;
  const rentalMetadata: Record<string, string> = isSkiHire
    ? {
        rentalStart: toIsoOrEmpty(payload.startDateAndTime),
        rentalEnd: toIsoOrEmpty(payload.endDateAndTime),
        itemsHash: hashSignature(bookingItemsSignature(payload.bookingItems)),
      }
    : {};

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      description: `${productOwner.providerType} booking`,
      // used by POST /booking/create to prove this payment belongs to this booking
      metadata: {
        userId: dbUser._id.toString(),
        productId: payload.productId.toString(),
        productModel: productModelName as string,
        category: productOwner.providerType as string,
        totalPrice: totalPrice.toString(),
        personCount: String(payload.personCount ?? ''),
        ...rentalMetadata,
      },
    });
  } catch (error: any) {
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      error?.message || 'Unable to create payment intent.',
    );
  }

  await saveBookingDraft(paymentIntent.id, dbUser, payload);

  return {
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    publishableKey: config.stripe.publishableKey,
    amount: totalPrice,
    amountInCents: amount,
    currency,
    category: productOwner.providerType,
    // Ski Hire only: how the price was calculated
    ...(rental && { priceUnit: rental.unit, rentalUnits: rental.units }),
  };
};

// Keep a copy of the booking request so the Stripe webhook can create the
// booking if the app never calls /booking/create (closed after paying)
const saveBookingDraft = async (
  paymentIntentId: string,
  dbUser: any,
  payload: any,
) => {
  const { paymentIntentId: _p, transactionId: _t, ...body } = payload || {};
  await BookingDraft.create({
    paymentIntentId,
    user: dbUser._id,
    userEmail: dbUser.email,
    payload: JSON.parse(JSON.stringify(body)),
  });
};

/**
 * Confirms with Stripe (server to server) that the PaymentIntent is paid
 * and was created for exactly this user, product and amount.
 */
const verifyBookingPayment = async (
  user: JwtPayload,
  payload: any,
  paymentIntentId: string,
) => {
  if (!paymentIntentId || !paymentIntentId.startsWith('pi_'))
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'A valid Stripe paymentIntentId is required.',
    );

  // one payment can be used for one booking only
  const alreadyUsed = await Payment.findOne({ transactionId: paymentIntentId });
  if (alreadyUsed)
    throw new AppError(
      StatusCodes.CONFLICT,
      'This payment has already been used for a booking.',
    );

  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Payment intent not found.');
  }

  if (paymentIntent.status !== 'succeeded')
    throw new AppError(
      StatusCodes.PAYMENT_REQUIRED,
      `Payment not completed (status: ${paymentIntent.status}).`,
    );

  const meta = paymentIntent.metadata || {};
  const dbUser = await User.findOne({ email: user?.email });

  if (!dbUser || meta.userId !== dbUser._id.toString())
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'This payment does not belong to the current user.',
    );

  if (meta.productId !== payload.productId?.toString())
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'This payment was made for a different product.',
    );

  // compare with the price the server fixed in /booking/intent (metadata),
  // not with the totalPrice sent by the app
  if (paymentIntent.amount_received !== toMinorUnit(Number(meta.totalPrice)))
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Paid amount does not match the booking total price.',
    );

  // guests must be the same as when the price was calculated
  if (
    meta.personCount !== undefined &&
    meta.personCount !== String(payload.personCount ?? '')
  )
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Person count differs from the one that was paid for.',
    );

  // Ski Hire: rental period and items must be the ones that were paid for
  if (meta.rentalStart || meta.rentalEnd || meta.itemsHash) {
    const sameStart = meta.rentalStart === toIsoOrEmpty(payload.startDateAndTime);
    const sameEnd = meta.rentalEnd === toIsoOrEmpty(payload.endDateAndTime);
    const sameItems =
      meta.itemsHash ===
      hashSignature(bookingItemsSignature(payload.bookingItems));

    if (!sameStart || !sameEnd || !sameItems)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Rental dates or items differ from the ones that were paid for.',
      );
  }

  return paymentIntent;
};

/**
 * POST /booking/create
 * 1. verify the Stripe payment
 * 2. run the existing booking logic (unchanged)
 * 3. if the booking is rejected (e.g. stock sold out meanwhile) refund the payment
 */
const addBookingIntoDB = async (user: JwtPayload, payload: any) => {
  const paymentIntentId: string =
    payload.paymentIntentId || payload.transactionId;

  // Already booked by the Stripe webhook (or a retry)? Return that booking.
  const existing = await findBookingForPayment(user, paymentIntentId);
  if (existing) return existing;

  const paymentIntent = await verifyBookingPayment(
    user,
    payload,
    paymentIntentId,
  );

  return finalizePaidBooking(user, payload, paymentIntent);
};

/**
 * If a booking was already created for this payment (by the webhook or an
 * earlier call), return it. Waits up to ~5 s while it is being created.
 */
const findBookingForPayment = async (
  user: JwtPayload,
  paymentIntentId: string,
) => {
  if (!paymentIntentId) return null;

  for (let attempt = 0; attempt < 10; attempt++) {
    const draft = await BookingDraft.findOne({ paymentIntentId });
    if (!draft || draft.userEmail !== user?.email) return null;

    if (draft.status === 'completed' && draft.booking)
      return Booking.findById(draft.booking);
    if (draft.status === 'failed')
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        draft.error || 'This booking could not be created.',
      );
    if (draft.status !== 'processing') return null;

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new AppError(
    StatusCodes.CONFLICT,
    'This booking is still being created. Please refresh in a moment.',
  );
};

/**
 * Creates the booking for a verified, succeeded payment. Used by
 * POST /booking/create and by the Stripe webhook. The draft is "claimed"
 * atomically so the same payment can never create two bookings.
 */
const finalizePaidBooking = async (
  user: JwtPayload,
  payload: any,
  paymentIntent: Stripe.PaymentIntent,
) => {
  const draftExists = await BookingDraft.exists({
    paymentIntentId: paymentIntent.id,
  });
  if (draftExists) {
    const claimed = await BookingDraft.findOneAndUpdate(
      { paymentIntentId: paymentIntent.id, status: 'pending' },
      { $set: { status: 'processing' } },
      { new: true },
    );
    if (!claimed) {
      const existing = await findBookingForPayment(user, paymentIntent.id);
      if (existing) return existing;
      throw new AppError(
        StatusCodes.CONFLICT,
        'This payment has already been used for a booking.',
      );
    }
  }

  try {
    const booking = await createBookingFromPayment(
      user,
      payload,
      paymentIntent,
    );
    if (draftExists)
      await BookingDraft.updateOne(
        { paymentIntentId: paymentIntent.id },
        { $set: { status: 'completed', booking: (booking as any)?._id } },
      );
    return booking;
  } catch (error: any) {
    if (draftExists)
      await BookingDraft.updateOne(
        { paymentIntentId: paymentIntent.id },
        { $set: { status: 'failed', error: error?.message } },
      );
    throw error;
  }
};

/**
 * POST /booking/webhook (Stripe). On `payment_intent.succeeded` it creates
 * the booking from the saved draft if the app has not done it yet; if the
 * booking is rejected the payment is refunded (same rules as /booking/create).
 */
const handleStripeWebhook = async (rawBody: Buffer, signature?: string) => {
  if (!config.stripe.webhookSecret)
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      'Stripe webhook secret is not configured.',
    );

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature || '',
      config.stripe.webhookSecret,
    );
  } catch (error: any) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `Webhook signature verification failed: ${error?.message}`,
    );
  }

  if (event.type !== 'payment_intent.succeeded')
    return { received: true, handled: false };

  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const draft = await BookingDraft.findOne({
    paymentIntentId: paymentIntent.id,
  });

  // no draft (paid outside /booking/intent) or already handled by the app
  if (!draft || draft.status !== 'pending')
    return { received: true, handled: false };

  const user = { email: draft.userEmail } as JwtPayload;
  const payload = { ...draft.payload, paymentIntentId: paymentIntent.id };

  try {
    const fresh = await verifyBookingPayment(user, payload, paymentIntent.id);
    await finalizePaidBooking(user, payload, fresh);
  } catch (error: any) {
    // finalizePaidBooking already refunds rejected bookings; a payment that
    // fails verification here is refunded too, unless it was already used
    const usedAlready = error instanceof AppError && error.code === StatusCodes.CONFLICT;
    const stillPending = await BookingDraft.exists({
      paymentIntentId: paymentIntent.id,
      status: 'pending',
    });
    if (!usedAlready && stillPending) {
      await stripe.refunds
        .create({ payment_intent: paymentIntent.id })
        .catch(() => null);
      await BookingDraft.updateOne(
        { paymentIntentId: paymentIntent.id },
        { $set: { status: 'failed', error: error?.message } },
      );
    }
    console.error(
      `Stripe webhook: booking for ${paymentIntent.id} not created: ${error?.message}`,
    );
  }

  return { received: true, handled: true };
};

// Original addBookingIntoDB body: refund-on-failure around the booking logic
const createBookingFromPayment = async (
  user: JwtPayload,
  payload: any,
  paymentIntent: Stripe.PaymentIntent,
) => {
  payload = { ...payload };

  // the existing logic stores this as Payment.transactionId
  payload.transactionId = paymentIntent.id;
  // never trust a client-supplied price that differs from what was charged
  payload.totalPrice = paymentIntent.amount_received / 100;
  delete payload.paymentIntentId;

  try {
    // Ski Hire: re-check date availability (another rental may have been
    // booked between /booking/intent and now) -> refunded below if taken
    if (paymentIntent.metadata?.productModel === 'SkiHire') {
      const skiHire = await SkiHire.findById(payload.productId);
      if (!skiHire)
        throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire not found.');
      await checkSkiHireAvailability(skiHire, payload);
    }

    return await createBookingAfterPayment(user, payload);
  } catch (error) {
    // Validation errors are thrown before the booking is saved -> refund user
    if (error instanceof AppError && error.code < 500) {
      try {
        await stripe.refunds.create({ payment_intent: paymentIntent.id });
      } catch (refundError: any) {
        throw new AppError(
          StatusCodes.INTERNAL_SERVER_ERROR,
          `Booking failed (${error.message}) and the automatic refund failed. Please contact support. Payment: ${paymentIntent.id}`,
        );
      }
      throw new AppError(
        error.code,
        `${error.message} Your payment has been refunded.`,
      );
    }
    throw error;
  }
};

// Original booking logic — runs only after the payment is verified
const createBookingAfterPayment = async (user: JwtPayload, payload: any) => {
  const { userId, transactionId } = payload;

  if (!transactionId)
    throw new AppError(StatusCodes.BAD_REQUEST, 'Transaction ID is required.');

  // user validation
  const dbUser = await User.findOne({ email: user?.email });
  if (!dbUser) throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  if (!dbUser._id.equals(userId))
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User ID mismatch.');

  if (
    ['Delete', 'Blocked', 'Banned', 'Inactive', 'Unverified'].includes(
      dbUser.status,
    )
  )
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      'This user status is not active.',
    );

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
    ['Ski_Pass', 'Restaurant', 'Massage'].includes(
      productOwner.providerType as string,
    )
  ) {
    if (isPastDate(payload.date)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Booking date cannot be in the past.',
      );
    }
  }

  // Transport requires start + end date validation
  if (productOwner.providerType === 'Transport') {
    if (!payload.startDateAndTime || !payload.endDateAndTime) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Start and end date/time required.',
      );
    }

    const start = new Date(payload.startDateAndTime);
    const end = new Date(payload.endDateAndTime);

    if (isPastDate(start)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Start date/time cannot be in the past.',
      );
    }

    if (end <= start) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'End date must be later than start date.',
      );
    }
  }
  // Ski Hire optional date check
  if (productOwner.providerType === 'Ski_Hire') {
    if (payload.date && isPastDate(payload.date)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Booking date cannot be in the past.',
      );
    }
  }
  function generateTicketNumber(): number {
    return Math.floor(100000 + Math.random() * 900000);
  }
  // model swhicher
  let totalPrice = 0;
  let validatedItems: any[] = [];
  let ticketNumber = '';

  switch (productOwner?.providerType) {
    // Restaurant
    case 'Restaurant': {
      if (!payload.slots?.length)
        throw new AppError(StatusCodes.BAD_REQUEST, 'Slots are required.');

      if (!payload.bookingItems?.length)
        throw new AppError(StatusCodes.BAD_REQUEST, 'Booking items required.');

      const updatedItems = matchedProduct.items.map((item: any) => {
        const booked = payload.bookingItems.find(
          (b: any) => b.itemId.toString() === item._id.toString(),
        );

        if (booked) {
          // Check quantity
          if (item.availableQty < booked.quantity) {
            throw new AppError(
              StatusCodes.BAD_REQUEST,
              `Insufficient quantity for ${item.seat}. Only ${item.availableQty} available.`,
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
      // const newTotalPrice = validatedItems.reduce((a, b) => a + b.total, 0);
      // totalPrice = newTotalPrice + matchedProduct?.serviceFee || 0;
      // totalPrice = validatedItems.reduce((a, b) => a + b.total, 0);

      totalPrice = payload.totalPrice || 0;

      const validSlotIds = matchedProduct.availableSlots.map((s: any) =>
        s._id.toString(),
      );

      const invalid = payload.slots.filter(
        (s: string) => !validSlotIds.includes(s.toString()),
      );

      if (invalid.length)
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Invalid slot(s): ${invalid.join(', ')}`,
        );

      // Remove booked slots
      const remainingSlots = matchedProduct.availableSlots.filter(
        (s: any) => !payload.slots.includes(s._id.toString()),
      );

      //  Update both items
      await Restaurant.updateOne(
        { _id: matchedProduct._id },
        {
          $set: {
            items: updatedItems,
            availableSlots: remainingSlots,
          },
        },
      );
      break;
    }
    // ski hire
    case 'Ski_Hire': {
      if (!payload.bookingItems?.length)
        throw new AppError(StatusCodes.BAD_REQUEST, 'Booking items required.');

      const dbSkiHire = await SkiHire.findById(matchedProduct._id);

      if (!dbSkiHire)
        throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire not found.');

      const updatedItems = dbSkiHire.items.map((item: any) => {
        const booked = payload.bookingItems.find(
          (b: any) => b.itemId.toString() === item._id.toString(),
        );

        if (booked) {
          if (item.availableQty < booked.quantity)
            throw new AppError(
              StatusCodes.BAD_REQUEST,
              `Insufficient quantity for ${item.productName}. Only ${item.availableQty} units are available. `,
            );

          // totalPrice += item.price * booked.quantity;

          return {
            ...item.toObject(),
            availableQty: item.availableQty - booked.quantity,
          };
        }
        return item;
      });

      totalPrice = payload.totalPrice || 0;

      await SkiHire.updateOne(
        { _id: matchedProduct._id },
        { $set: { items: updatedItems } },
      );

      break;
    }
    // transport
    case 'Transport': {
      if (!payload.startDateAndTime || !payload.endDateAndTime)
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'Start & End date/time required.',
        );

      // totalPrice = matchedProduct.amount || 0;
      totalPrice = payload.totalPrice || 0;
      break;
    }
    // ski pass
    case 'Ski_Pass': {
      // totalPrice = matchedProduct.amount || 0;
      totalPrice = payload.totalPrice || 0;
      payload.ticketNumber = `TKT-${generateTicketNumber()}`;
      // ticketNumber = `TKT-${Date.now().toString().slice(-4)}-${generateTicketNumber()}`;
      // a paid ski pass is a ready-to-use ticket: approve it automatically
      payload.isPermitted = true;
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
    // provider is paid when the booking is completed, not at payment
    ...(HOLD_PROVIDER_PAYOUT_UNTIL_COMPLETION && {
      providerPayout: 'held' as const,
    }),
    // bookings that need approval expire (and are refunded) if the
    // provider doesn't approve in time
    ...(!payload.isPermitted && {
      approvalDeadline: computeApprovalDeadline(payload),
    }),
    ...(payload.isPermitted && { approvedAt: new Date() }),
  };

  // create booking
  const newBooking = await Booking.create(bookingData);

  if (!newBooking)
    throw new AppError(StatusCodes.BAD_REQUEST, 'Booking not created.');

  // WALLET UPDATE (skipped while payouts are held until completion;
  // releaseProviderPayout credits the wallet when the booking completes)
  const wallet = HOLD_PROVIDER_PAYOUT_UNTIL_COMPLETION
    ? null
    : await Wallet.findOne({ user: productOwner?._id });
  if (wallet) {
    wallet.balance += totalPrice;
    wallet.transactions.push({
      user: productOwner._id,
      balance: totalPrice,
      type: WalletTransactionType.EARN,
    });
    await wallet.save();
  }

  // IPayment
  const paymentPayload: any = {
    // booking: new Types.ObjectId(newBooking?._id as string),
    booking: newBooking._id,
    user: new Types.ObjectId(userId),
    transactionId,
    amount: totalPrice,
    status: TransactionStatus.PAID,
    gateway: PaymentGateway.STRIPE,
    paymentMethodType: 'Card',
    currency: 'eur',
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

  // notify the provider so they can see (and, if needed, approve) the booking
  await Notification.create({
    receiverId: productOwner?._id,
    senderId: dbUser?._id,
    title: 'New Booking',
    description: newBooking.isPermitted
      ? `New ${productOwner.providerType} booking from ${dbUser?.fullName || 'a customer'}${newBooking.ticketNumber ? ` (${newBooking.ticketNumber})` : ''}. Total: ${totalPrice}.`
      : `New ${productOwner.providerType} booking from ${dbUser?.fullName || 'a customer'} is waiting for your approval. Total: ${totalPrice}.`,
    type: 'booking',
  });

  return newBooking;
};

// ===========================================================================
// Booking lifecycle: approval deadline, reject / expire, hand-over, payout
// ===========================================================================

// Provider money is credited when the booking is completed (not at payment).
// Set to false to go back to crediting the wallet at payment time.
const HOLD_PROVIDER_PAYOUT_UNTIL_COMPLETION = true;

// How long a provider has to approve a new booking
const APPROVAL_TIMEOUT_HOURS = 24;

/**
 * Approval deadline = 24 h after booking, or the start of the service if
 * that is sooner (never in the past).
 */
const computeApprovalDeadline = (payload: any) => {
  const now = Date.now();
  let deadline = now + APPROVAL_TIMEOUT_HOURS * MS_PER_HOUR;

  const start = new Date(payload.startDateAndTime || payload.date || '');
  if (!isNaN(start.getTime()) && start.getTime() < deadline)
    deadline = Math.max(start.getTime(), now);

  return new Date(deadline);
};

// Who is allowed to act on a booking as its provider
const assertOwnerOrAdmin = async (user: JwtPayload, booking: any) => {
  const actor = await User.findOne({ email: user?.email });
  if (!actor) throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  const productDoc: any = booking.product;
  const ownerId =
    productDoc?.owner?._id?.toString?.() || productDoc?.owner?.toString?.();

  if (user.role !== 'Admin' && ownerId !== actor._id.toString())
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not the owner of this product.',
    );

  return { actor, ownerId };
};

/**
 * Give back what the booking took: Ski Hire items, Restaurant seats and
 * slots. Never above the total stock.
 */
const restoreBookingStock = async (booking: any) => {
  const productId = booking.product?._id || booking.product;

  if (booking.productModel === 'SkiHire') {
    const skiHire = await SkiHire.findById(productId);
    if (!skiHire) return;
    (booking.bookingItems || []).forEach((bItem: any) => {
      const item = skiHire.items.find(
        it => it._id?.toString() === bItem.itemId?.toString(),
      );
      if (item && typeof item.availableQty === 'number')
        item.availableQty = Math.min(
          item.availableQty + Number(bItem.quantity),
          Number(item.totalQty),
        );
    });
    await skiHire.save({ validateModifiedOnly: true });
  }

  if (booking.productModel === 'Restaurant') {
    const restaurant: any = await Restaurant.findById(productId);
    if (!restaurant) return;

    (booking.slots || []).forEach((slotIdStr: any) => {
      const slot = restaurant.slots?.find(
        (s: any) => s._id?.toString() === slotIdStr?.toString(),
      );
      const alreadyAvailable = restaurant.availableSlots?.some(
        (s: any) => s._id?.toString() === slotIdStr?.toString(),
      );
      if (slot && !alreadyAvailable)
        restaurant.availableSlots.push({
          _id: slot._id,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
    });

    (booking.bookingItems || []).forEach((bItem: any) => {
      const item = restaurant.items?.find(
        (i: any) => i._id?.toString() === bItem.itemId?.toString(),
      );
      if (item)
        item.availableQty = Math.min(
          Number(item.availableQty) + Number(bItem.quantity),
          Number(item.totalQty),
        );
    });

    await restaurant.save({ validateModifiedOnly: true });
  }
};

/**
 * Refund the customer in full. Stripe payments (pi_...) go back to the
 * card; older non-Stripe bookings go to the customer's in-app wallet.
 */
const refundBookingPaymentInFull = async (booking: any) => {
  const payment = await Payment.findOne({ booking: booking._id });
  const amount = Number(booking.totalPrice) || 0;

  if (payment?.transactionId?.startsWith('pi_')) {
    await stripe.refunds.create({ payment_intent: payment.transactionId });
    await Payment.updateOne(
      { _id: payment._id },
      { $set: { status: TransactionStatus.REFUNDED } },
    );
    return 'card';
  }

  const userWallet = await Wallet.findOne({ user: booking.user });
  if (userWallet && amount > 0) {
    userWallet.balance += amount;
    userWallet.transactions.push({
      user: booking.user,
      balance: amount,
      type: WalletTransactionType.RECEIVE,
    });
    await userWallet.save();
  }
  if (payment)
    await Payment.updateOne(
      { _id: payment._id },
      { $set: { status: TransactionStatus.REFUNDED } },
    );
  return 'wallet';
};

/**
 * Take the booking money back from the provider. Held payouts were never
 * credited, so only already-paid ones (and old bookings, credited at
 * payment) are deducted from the provider's wallet.
 */
const reverseProviderPayout = async (booking: any, ownerId?: string) => {
  if (booking.providerPayout === 'reversed') return;

  if (booking.providerPayout !== 'held' && ownerId) {
    const ownerWallet = await Wallet.findOne({ user: ownerId });
    const amount = Number(booking.totalPrice) || 0;
    if (ownerWallet && amount > 0) {
      ownerWallet.balance -= amount;
      ownerWallet.transactions.push({
        user: booking.user,
        balance: amount,
        type: WalletTransactionType.SEND,
      });
      await ownerWallet.save();
    }
  }

  await Booking.updateOne(
    { _id: booking._id },
    { $set: { providerPayout: 'reversed' } },
  );
};

/**
 * Cancel a booking that the provider rejected (or that expired without
 * approval): full refund, stock back, provider payout reversed, notify.
 * Only for bookings that are still open and not handed over.
 */
const cancelBookingWithFullRefund = async (
  bookingId: string,
  cancelledBy: 'provider' | 'admin' | 'system',
  reason: string,
  ownerId?: string,
) => {
  const previous: any = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      bookingStatus: { $in: ['Active', 'Pending'] },
      isHandOver: { $ne: true },
    },
    { $set: { bookingStatus: 'Cancelled', cancelledBy, cancelReason: reason } },
    { new: false },
  ).populate({ path: 'product', select: 'owner title' });

  if (!previous)
    throw new AppError(
      StatusCodes.CONFLICT,
      'Only open bookings that have not been handed over can be rejected.',
    );

  const owner = ownerId || previous.product?.owner?.toString();

  let refundedTo: string;
  try {
    refundedTo = await refundBookingPaymentInFull(previous);
  } catch (error: any) {
    // refund failed: put the booking back so it can be retried
    await Booking.updateOne(
      { _id: bookingId },
      {
        $set: { bookingStatus: previous.bookingStatus },
        $unset: { cancelledBy: '', cancelReason: '' },
      },
    );
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      `Refund failed, booking not cancelled: ${error?.message}`,
    );
  }

  await reverseProviderPayout(previous, owner);
  await restoreBookingStock(previous);

  const title = previous.product?.title || 'Your booking';
  await Notification.create({
    receiverId: previous.user,
    senderId: owner || previous.user,
    title:
      cancelledBy === 'system' ? 'Booking Not Confirmed' : 'Booking Rejected',
    description: `${title} was ${cancelledBy === 'system' ? 'not confirmed by the provider in time' : 'declined by the provider'}${reason ? `: ${reason}` : ''}. Your payment of ${previous.totalPrice} has been refunded${refundedTo === 'card' ? ' to your card' : ' to your wallet'}.`,
    type: 'booking',
  });

  if (cancelledBy === 'system' && owner)
    await Notification.create({
      receiverId: owner,
      senderId: previous.user,
      title: 'Booking Expired',
      description: `A booking for ${title} expired because it was not approved in time. The customer was refunded.`,
      type: 'booking',
    });

  return Booking.findById(bookingId)
    .populate('user', 'fullName email')
    .populate('product');
};

/**
 * Credit the provider's wallet for a completed booking whose payout was
 * held. Safe to call many times: it pays only once.
 */
const releaseProviderPayout = async (bookingId: any) => {
  const booking: any = await Booking.findOneAndUpdate(
    { _id: bookingId, bookingStatus: 'Completed', providerPayout: 'held' },
    { $set: { providerPayout: 'paid' } },
    { new: true },
  ).populate({ path: 'product', select: 'owner' });
  if (!booking) return;

  const ownerId = booking.product?.owner;
  const amount = Number(booking.totalPrice) || 0;
  const wallet = ownerId ? await Wallet.findOne({ user: ownerId }) : null;

  if (!wallet || amount <= 0) {
    // no wallet yet: keep it held so a later run can pay it
    await Booking.updateOne(
      { _id: booking._id },
      { $set: { providerPayout: 'held' } },
    );
    return;
  }

  wallet.balance += amount;
  wallet.transactions.push({
    user: ownerId,
    balance: amount,
    type: WalletTransactionType.EARN,
  });
  await wallet.save();
};

// PATCH /booking/reject/:id — provider declines a booking
const rejectBookingIntoDB = async (
  user: JwtPayload,
  bookingId: string,
  reason?: string,
) => {
  const booking = await Booking.findById(bookingId).populate({
    path: 'product',
    select: 'owner',
  });
  if (!booking) throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');

  const { ownerId } = await assertOwnerOrAdmin(user, booking);

  return cancelBookingWithFullRefund(
    bookingId,
    user.role === 'Admin' ? 'admin' : 'provider',
    reason || '',
    ownerId,
  );
};

// PATCH /booking/hand-over/:id — equipment / vehicle given to the customer
const handOverBookingIntoDB = async (user: JwtPayload, bookingId: string) => {
  const booking: any = await Booking.findById(bookingId).populate({
    path: 'product',
    select: 'owner title',
  });
  if (!booking) throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');

  const { actor } = await assertOwnerOrAdmin(user, booking);

  if (!['Active', 'Pending'].includes(booking.bookingStatus))
    throw new AppError(
      StatusCodes.CONFLICT,
      `A ${booking.bookingStatus} booking can't be handed over.`,
    );
  if (!booking.isPermitted)
    throw new AppError(
      StatusCodes.CONFLICT,
      'Approve the booking before handing it over.',
    );
  if (booking.isHandOver)
    throw new AppError(StatusCodes.CONFLICT, 'Already handed over.');

  const result = await Booking.findByIdAndUpdate(
    bookingId,
    {
      $set: {
        isHandOver: true,
        handedOverAt: new Date(),
        bookingStatus: 'Active',
      },
    },
    { new: true },
  )
    .populate('user', 'fullName email')
    .populate('product');

  await Notification.create({
    receiverId: booking.user,
    senderId: actor._id,
    title: 'Rental Started',
    description: `${booking.product?.title || 'Your booking'} has been handed over to you. Enjoy!`,
    type: 'booking',
  });

  return result;
};

const updateBookingIntoDB = async (
  user: JwtPayload,
  payload: { bookingStatus?: BookingStatus; isPermitted?: boolean },
  bookingId: string,
) => {
  // Provider/Admin setting "Cancelled" = reject: refund + stock back
  if (payload.bookingStatus === 'Cancelled') {
    return rejectBookingIntoDB(
      user,
      bookingId,
      (payload as any).reason || (payload as any).cancelReason,
    );
  }

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
      'You are not allowed to update this booking.',
    );
  }
  // Update booking status
  const result = await Booking.findByIdAndUpdate(
    bookingId,
    { $set: updateData },
    { new: true },
  )
    .populate('user', 'fullName email')
    .populate('product');

  return result;
};

const updatePermitBookingIntoDB = async (
  user: JwtPayload,
  isPermitted: boolean,
  bookingId: string,
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
      'You are not the owner of this product. Cannot update booking status.',
    );
  }

  // only open bookings can be approved (not cancelled / completed ones)
  if (!['Active', 'Pending'].includes(existsBooking.bookingStatus))
    throw new AppError(
      StatusCodes.CONFLICT,
      `A ${existsBooking.bookingStatus} booking can't be approved.`,
    );

  const wasPermitted = existsBooking.isPermitted;

  const result = await Booking.findByIdAndUpdate(
    bookingId,
    {
      $set: {
        isPermitted,
        ...(isPermitted && !wasPermitted && { approvedAt: new Date() }),
      },
    },
    { new: true },
  )
    .populate('user', 'fullName email')
    .populate('product');

  // tell the customer their booking was approved
  if (isPermitted && !wasPermitted) {
    await Notification.create({
      receiverId: existsBooking.user,
      senderId: isExistsUser._id,
      title: 'Booking Approved',
      description: `${(result?.product as any)?.title || 'Your booking'} has been approved by the provider.`,
      type: 'booking',
    });
  }

  return result;
};

const completeBookingIntoDB = async (user: JwtPayload, bookingId: string) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }
  // console.log('find current user ===========>', isExistsUser);
  const existsBooking = await Booking.findById(bookingId).populate({
    path: 'product',
    select: 'owner title',
  });
  console.log('existsBooking', existsBooking);
  if (!existsBooking) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Booking not found.');
  }

  const productDoc = existsBooking.product as any;
  const owner = productDoc?.owner;

  if (owner?.toString?.() !== isExistsUser._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not the owner of this product. Cannot update booking status.',
    );
  }

  // a cancelled or already completed booking can't be completed again
  if (['Cancelled', 'Cancel', 'Completed', 'Deleted'].includes(existsBooking.bookingStatus))
    throw new AppError(
      StatusCodes.CONFLICT,
      `This booking is already ${existsBooking.bookingStatus}.`,
    );

  // Restaurant: seats and slots go back when the booking is completed
  if (existsBooking.productModel === 'Restaurant')
    await restoreBookingStock(existsBooking);

  // Late return (Ski Hire / Transport handed over, returned after the end):
  // record overtime hours x the listing's hourly extra charge
  const returnedAt = new Date();
  const overtime: { overTimeHours?: number; overTimeCharge?: number } = {};
  const end = new Date(existsBooking.endDateAndTime || '');
  if (
    ['Ski_Hire', 'Transport'].includes(existsBooking.category) &&
    existsBooking.isHandOver &&
    !isNaN(end.getTime()) &&
    returnedAt > end
  ) {
    const Model: any = existsBooking.productModel === 'SkiHire' ? SkiHire : Transport;
    const rateDoc: any = await Model.findById(productDoc?._id)
      .select('extraChargePerHour extraChargePerHours')
      .lean();
    const rate = Number(
      existsBooking.category === 'Ski_Hire'
        ? rateDoc?.extraChargePerHour
        : rateDoc?.extraChargePerHours,
    ) || 0;
    const hours = Math.ceil((returnedAt.getTime() - end.getTime()) / MS_PER_HOUR);
    overtime.overTimeHours = hours;
    overtime.overTimeCharge = Math.round(hours * rate * 100) / 100;
  }

  // Ski Hire hand-over: items are back, return them to stock.
  // Skipped if the booking was already completed (stock already restored).
  if (
    existsBooking.productModel === 'SkiHire' &&
    ['Active', 'Pending'].includes(existsBooking.bookingStatus) &&
    existsBooking.bookingItems?.length
  ) {
    const skiHire = await SkiHire.findById(productDoc?._id);
    if (skiHire) {
      existsBooking.bookingItems.forEach(bItem => {
        const item = skiHire.items.find(
          it => it._id?.toString() === bItem.itemId?.toString(),
        );
        if (item && typeof item.availableQty === 'number') {
          item.availableQty = Math.min(
            item.availableQty + Number(bItem.quantity),
            Number(item.totalQty),
          );
        }
      });
      await skiHire.save({ validateModifiedOnly: true });
    }
  }

  const result = await Booking.findByIdAndUpdate(
    bookingId,
    {
      $set: {
        bookingStatus: 'Completed',
        isHandOver: true,
        returnedAt,
        ...overtime,
      },
    },
    { new: true },
  )
    .populate('user', 'fullName email')
    .populate('product');

  await Notification.create({
    receiverId: result?.user?._id,
    senderId: isExistsUser._id,
    title: 'Booking Completed',
    description: `${(result?.product as any)?.title || 'Your'} booking has been completed by ${isExistsUser?.fullName}. Product id:# ${(result?.product as any)?._id}`,
    type: 'booking',
  });

  // late return: tell the customer the overtime that is due
  if (overtime.overTimeCharge && overtime.overTimeCharge > 0) {
    await Notification.create({
      receiverId: result?.user?._id,
      senderId: isExistsUser._id,
      title: 'Overtime Charge',
      description: `Returned ${overtime.overTimeHours} hour(s) late. Overtime due: ${overtime.overTimeCharge}.`,
      type: 'payment',
    });
  }

  // pay the provider now that the service is done
  await releaseProviderPayout(bookingId);

  return result;
};

const refundBookingIntoDB = async (
  user: JwtPayload,
  payload: Partial<any | {}>,
  bookingId: string,
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
      `Invalid product model: ${productModel}`,
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
      refund.userId.toString() === isExistsUser._id.toString(),
  );

  if (alreadyRefunded) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'You have already refunded or canceled this product.',
    );
  }

  const result = await Booking.findByIdAndUpdate(
    bookingId,
    // 'Cancelled' is the value the Booking model allows ('Cancel' was invalid)
    { $set: { bookingStatus: 'Cancelled' } },
    { new: true },
  )
    .populate('user', 'fullName email')
    .populate('product');

  // find owner wallet
  const ownerWallet = await Wallet.findOne({ user: product?.owner });
  if (!ownerWallet) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Owner wallet not found.');
  }
  // find user wallet
  const userWallet = await Wallet.findOne({ user: isExistsUser?._id });
  if (!userWallet) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User wallet not found.');
  }
  // calculate refund (10% of total price)
  const finalRefund = Number((existsBooking.totalPrice * 0.9).toFixed(2));

  if (existsBooking.providerPayout === 'held') {
    // provider was never credited (payout held until completion):
    // give the provider only the kept 10% instead of taking 90% back
    const providerShare = Number(
      (existsBooking.totalPrice - finalRefund).toFixed(2),
    );
    ownerWallet.balance += providerShare;
    ownerWallet.transactions.push({
      user: isExistsUser._id,
      balance: providerShare,
      type: WalletTransactionType.EARN,
    });
    await ownerWallet.save();
    await Booking.updateOne(
      { _id: existsBooking._id },
      { $set: { providerPayout: 'paid', cancelledBy: 'user', cancelReason: payload?.reason } },
    );
  } else {
    // decrease balance
    ownerWallet.balance -= finalRefund;

    ownerWallet.transactions.push({
      user: isExistsUser._id,
      balance: finalRefund,
      type: WalletTransactionType.SEND,
    });

    await ownerWallet.save();
  }

  userWallet.balance += finalRefund;
  userWallet.transactions.push({
    user: product.owner,
    balance: finalRefund,
    type: WalletTransactionType.RECEIVE,
  });

  await userWallet.save();

  // send notification
  await Notification.create({
    receiverId: product.owner,
    senderId: isExistsUser._id,
    title: 'Cancel Booking',
    description: `${product?.title} is canceled by ${isExistsUser?.fullName}, product id:# ${product?._id}`,
    type: 'payment',
  });

  // restore available product totalQty and slots
  // Restore for Restaurant
  if (productModel === 'Restaurant') {
    if (existsBooking.slots && existsBooking.slots.length > 0) {
      existsBooking.slots.forEach(slotIdStr => {
        const slotId = new mongoose.Types.ObjectId(slotIdStr);

        const slot = product.slots.find(
          (s: any) => s._id && s._id.equals(slotId),
        );

        if (slot) {
          const alreadyAvailable = product.availableSlots.some(
            (s: any) => s._id && s._id.equals(slot._id),
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
          (i: any) => i._id && i._id.equals(itemId),
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
          (i: any) => i._id && i._id.equals(itemId),
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

  // Add refund info
  const newRefund = {
    userId: isExistsUser._id,
    reason: payload.reason,
    createdAt: new Date(),
  } as IRefund;

  if (!product.refunds) product.refunds = [];

  product.refunds.push(newRefund);

  await product.save({ validateModifiedOnly: true });

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
      'You are not authorized to delete this booking. Only the booking owner can delete it.',
    );
  }

  // Delete the booking permanently
  const result = await Booking.findByIdAndDelete(id);

  if (!result) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      'Failed to delete booking.',
    );
  }

  return result;
};

export const BookingService = {
  getAllBookingFromDB,
  getSingleBookingFromDB,
  addBookingIntoDB,
  createPaymentIntentIntoDB,
  handleStripeWebhook,
  rejectBookingIntoDB,
  handOverBookingIntoDB,
  releaseProviderPayout,
  cancelBookingWithFullRefund,
  getMyAllBookingIntoDB,
  updateBookingIntoDB,
  updatePermitBookingIntoDB,
  completeBookingIntoDB,
  refundBookingIntoDB,
  deleteBookingIntoDB,
  getMyBooking,
  getMyBookingForHome,
};
