import { Types } from 'mongoose'; 
import { StatusCodes } from 'http-status-codes'; 
import AppError from './../../../errors/AppErro';
import { Support } from './customer.support.model';
import { ISupport } from './customer.support.interface';
import { JwtPayload } from 'jsonwebtoken';
import { User } from './../../user/user.model';


 const createSupport = async (user:JwtPayload,data: Partial<ISupport>) => {
  const { email, phone, description } = data;

  if (!email || !phone || !description) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'All fields are required');
  } 

  const isExistsUser = await User.findOne({ 
    email: user?.email, 
    role: 'Admin' 
  });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin user not found');
  }

  const isExistsSupport = await Support.find();
  if (isExistsSupport.length > 0) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Support already exists');
  }
  const support = await Support.create(data);
  return support;
};

 const updateSupport = async (user:JwtPayload,id: string, data: Partial<ISupport>) => {
  
  const isExistsUser = await User.findOne({ 
    email: user?.email, 
    role: 'Admin' 
  });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin user not found');
  }

  const updated = await Support.findByIdAndUpdate(id, data, { new: true });
  return updated;
};

 const getSupport = async () => {
  const support = await Support.find();
  return support;
};
 
export const CustomerSupportService = {
  createSupport,
  updateSupport,
  getSupport,
};
