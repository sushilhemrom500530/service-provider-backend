import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes'; 
import { User } from '../user/user.model';
import { Payment } from './payment.model';
import { Booking } from './../booking/booking.model';
 

const getAllPayment = async (query: any) => {
  // Pagination setup
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
  const skip = (page - 1) * limit;

  // Initialize payment filters
  const paymentFilters: IPaymentFilters = {};

  // Handle user filters (name and role)
  if (query.name || query.role) {
    const userFilters: any = {};

    if (query.name) {
      userFilters.fullName = {
        $regex: query.name.trim(),
        $options: 'i',
      };
    }

    if (query.role) {
      userFilters.role = query.role.trim();
    }

    const matchingUsers = await User.find(userFilters)
      .select('_id')
      .lean();

    if (matchingUsers.length === 0) {
      return {
        pagination: { 
          total: 0, 
          page, 
          limit, 
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
        payments: [],
      };
    }

    paymentFilters.user = { 
      $in: matchingUsers.map(u => u._id) 
    };
  }

  // Handle booking date filter - search across date, startDateAndTime, and endDateAndTime
  if (query.date) {
    const parsedDate = new Date(query.date);
    
    if (!isNaN(parsedDate.getTime())) {
      // Create date range for the entire day
      const startOfDay = new Date(parsedDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(parsedDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Search in all three date fields using $or
      const bookingFilters = {
        $or: [
          // Match exact date field (for Ski_Pass)
          { 
            date: {
              $gte: startOfDay,
              $lte: endOfDay
            }
          },
          // Match startDateAndTime field (for Ski_Hire)
          { 
            startDateAndTime: {
              $gte: startOfDay,
              $lte: endOfDay
            }
          },
          // Match endDateAndTime field (for Ski_Hire)
          { 
            endDateAndTime: {
              $gte: startOfDay,
              $lte: endOfDay
            }
          }
        ]
      };

      const matchingBookings = await Booking.find(bookingFilters)
        .select('_id')
        .lean();

      if (matchingBookings.length === 0) {
        return {
          pagination: { 
            total: 0, 
            page, 
            limit, 
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
          payments: [],
        };
      }

      paymentFilters.booking = { 
        $in: matchingBookings.map(b => b._id) 
      };
    }
  }

  // Execute payment queries
  const [total, payments] = await Promise.all([
    Payment.countDocuments(paymentFilters),
    Payment.find(paymentFilters)
      .populate({
        path: 'user',
        select: 'fullName providerType email phoneNumber role',
      })
      .populate({
        path: 'booking',
        select: 'category totalPrice bookingStatus date time startDateAndTime endDateAndTime personCount',
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: false,
    },
    payments,
  };
};

const paymentFindById = async (paymentId: string) => {
  const payment = await Payment.findById(paymentId)
  .populate({ path: 'user', select: 'name email phoneNumber role' })
    .populate({
      path: 'booking',
      select: 'category totalPrice bookingStatus date time personCount',
    });
    
  if(!payment){
    throw new AppError(StatusCodes.NOT_FOUND, 'Payment Data not found.');
  }
  return payment;
}

const deletePaymentById = async (paymentId: string) => {
  // Validate ObjectId
  if (!Types.ObjectId.isValid(paymentId)) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid payment ID.');
  }

  // Check if payment exists
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Payment Data not found.');
  }

  // Delete payment
 const result =  await Payment.deleteOne({ _id: paymentId });
 return result ;

}

export const PaymentService = {
  getAllPayment,
  paymentFindById,
  deletePaymentById
};
