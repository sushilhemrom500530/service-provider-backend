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
    .populate(
      'product',
      '-owner -totalPrice -__v -reviews -refunds -averageRating -createdAt -updatedAt',
    )
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

  if (['Ski_Hire', 'Transport'].includes(booking?.category)) {
    if (!booking?.isHandOver) {
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
        '-owner -totalPrice -__v -reviews -refunds -averageRating -createdAt -updatedAt -slots -availableSlots',
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

    if (['Ski_Hire', 'Transport'].includes(booking?.category)) {
      if (!booking?.isHandOver) {
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

  const bookings = await Booking.find({ user: isExistsUser._id }).populate({
    path: 'product',
    select:
      'title thumbnail serviceFee serviceArea description category items extraChargePerHour extraChargePerHours',
  });

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

    if (['Ski_Hire', 'Transport'].includes(b.category) && b.endDateAndTime) {
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
    .populate(
      'product',
      'title category serviceArea amount startDateAndTime endDateAndTime time',
    )
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

const addBookingIntoDB = async (user: JwtPayload, payload: any) => {
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

  return newBooking;
};

const updateBookingIntoDB = async (
  user: JwtPayload,
  payload: { bookingStatus?: BookingStatus; isPermitted?: boolean },
  bookingId: string,
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

  const result = await Booking.findByIdAndUpdate(
    bookingId,
    { $set: { isPermitted } },
    { new: true },
  )
    .populate('user', 'fullName email')
    .populate('product');

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

  const result = await Booking.findByIdAndUpdate(
    bookingId,
    { $set: { bookingStatus: 'Completed', isHandOver: true } },
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
    { $set: { bookingStatus: 'Cancel' } },
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

  // decrease balance
  ownerWallet.balance -= finalRefund;

  ownerWallet.transactions.push({
    user: isExistsUser._id,
    balance: finalRefund,
    type: WalletTransactionType.SEND,
  });

  await ownerWallet.save();

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
  getMyAllBookingIntoDB,
  updateBookingIntoDB,
  updatePermitBookingIntoDB,
  completeBookingIntoDB,
  refundBookingIntoDB,
  deleteBookingIntoDB,
  getMyBooking,
  getMyBookingForHome,
};
