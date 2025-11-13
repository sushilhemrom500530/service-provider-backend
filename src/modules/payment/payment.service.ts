import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes'; 
import { User } from '../user/user.model';
import { Payment } from './payment.model';

interface IQuery {
  page?: string | number;
  limit?: string | number;
  userId?: string;
  status?: string;
  search?: string; // search by user name/email
}

const getAllPayment = async (query: IQuery) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  const filters: any = {};
  if (query.status) filters.status = query.status;
  if (query.userId) filters.user = query.userId;

  const total = await Payment.countDocuments(filters);

  const payments = await Payment.find(filters)
    .populate({ path: 'user', select: 'name email phoneNumber role' })
    .populate({
      path: 'booking',
      select: 'category totalPrice bookingStatus date time personCount',
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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
