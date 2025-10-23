import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import { JwtPayload } from 'jsonwebtoken';
import { Booking } from './booking.model';



const getAllBookingFromDB = async ( user:JwtPayload)=>{

  const isExistsUser = await User.findOne({email: user?.email});
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found.");
  }
  
  const result = await Booking.find();
  return result
}


const getSingleBookingFromDB = async (id: string, user:JwtPayload)=>{
  const isExistsUser = await User.findOne({email: user?.email});
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found.");
  }
  const result = await Booking.findById(id);
  return result
}


export const addBookingIntoDB = async (req: Request, res: Response) => {
  // check user
  const user = await User.findById(req?.body?.ownerId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found.");
  }

   

  const result = {name: "booking", status: "success"};

  return result;
};

export const updateBookingIntoDB = async (req: Request, res: Response) => {
  // check user
  const user = await User.findById(req?.body?.ownerId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found.");
  }

   

  const result = {name: "booking", status: "success"};

  return result;
};
export const deleteBookingIntoDB = async (req: Request, res: Response) => {
  // check user
  const user = await User.findById(req?.body?.ownerId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found.");
  }

   

  const result = {name: "booking", status: "success"};

  return result;
};



export const BookingService = {
  getAllBookingFromDB,
  getSingleBookingFromDB,
  addBookingIntoDB,
  updateBookingIntoDB,
  deleteBookingIntoDB,

};
