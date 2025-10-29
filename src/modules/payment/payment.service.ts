import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import Payment from './payment.model';

const getAllPayment = async () => {
  const result = await Payment.find({}).sort({ createdAt: -1 });
  return result;
};

export const PaymentService = {
  getAllPayment,
};
