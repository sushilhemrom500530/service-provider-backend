import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { s3Services } from './../../aws/s3Service';
import { USER_UPLOADS_FOLDER } from './skipass.constant';
import { SkiPass } from './skipass.model';
import { User } from './../user/user.model';
import { JwtPayload } from 'jsonwebtoken';



const getAllSkiPassFromDB = async ( user:JwtPayload)=>{

  const isExistsUser = await User.findOne({email: user?.email});
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found.");
  }
  
  const result = await SkiPass.find();
  return result
}


const getSingleSkipPassFromDB = async (id: string, user:JwtPayload)=>{
  const isExistsUser = await User.findOne({email: user?.email});
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found.");
  }
  const result = await SkiPass.findById(id);
  return result
}


export const addSkiPassIntoDB = async (req: Request, res: Response) => {
  // check user
  const user = await User.findById(req?.body?.ownerId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found.");
  }

  // Check providerType
  if (user.providerType !== "Ski_Pass") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "User is not authorized to create a Ski Pass."
    );
  }
  
  if (req.file) {
    const fileUrl = await s3Services.uploadSingleFileToS3(
      req.file,
      USER_UPLOADS_FOLDER
    );
    req.body.thumbnail = fileUrl;
  } else {
    throw new AppError(StatusCodes.BAD_REQUEST, "Thumbnail file not found.");
  }

  const updateData = req?.body;

  const result = await SkiPass.create(updateData);

  return result;
};


export const updateSkiPassIntoDB = async (req: Request, res: Response,payload: Partial<any | {}>) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;

  // check user
  const existsUser = await User.findById(req?.body?.ownerId);
  if (!existsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found.");
  }

  
  if (req.file) {
    const fileUrl = await s3Services.uploadSingleFileToS3(
      req.file,
      USER_UPLOADS_FOLDER
    );
    req.body.thumbnail = fileUrl;
  } else {
    throw new AppError(StatusCodes.BAD_REQUEST, "Thumbnail file not found.");
  }

  const updateData = req?.body;

  const result = await SkiPass.create(updateData);

  return result;
};

const deleteSkiPassIntoDB = async (id: string, user:JwtPayload)=>{
  const isExistsUser = await User.findOne({email: user?.email});
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found.");
  }
  const result = await SkiPass.deleteById(id);
  return result
}

export const SkiPassService = {
  getAllSkiPassFromDB,
  addSkiPassIntoDB,
  getSingleSkipPassFromDB,
  updateSkiPassIntoDB,
  deleteSkiPassIntoDB

};
