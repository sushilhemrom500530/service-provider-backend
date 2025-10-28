import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { s3Services } from './../../aws/s3Service';
import { USER_UPLOADS_FOLDER } from './skipass.constant';
import { SkiPass } from './skipass.model';
import { User } from './../user/user.model';
import { JwtPayload } from 'jsonwebtoken';
import { IReview } from './skipass.interface';

const getAllSkiPassFromDB = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const result = await SkiPass.find();
  return result;
};

const getSingleSkipPassFromDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }
  const result = await SkiPass.findById(id).populate(
    'owner',
    '_id email profileUrl phoneNumber'
  );

  if (!result) {
    return {
      message: ` This ski pass id's ${id} data not found.'`,
    };
  }
  return result;
};

const addSkiPassIntoDB = async (req: Request, res: Response) => {
  const user = req?.user as JwtPayload;
  // check user
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  // Validate provider role and type
  if (isExistsUser?.role !== 'Provider') {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to create a ski pass service.'
    );
  }

  // Check providerType
  if (isExistsUser?.providerType !== 'Ski_Pass') {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'User is not authorized to create a Ski Pass.'
    );
  }

  if (req.file) {
    const fileUrl = await s3Services.uploadSingleFileToS3(
      req.file,
      USER_UPLOADS_FOLDER
    );
    req.body.thumbnail = fileUrl;
  } else {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Thumbnail file not found.');
  }

  const formData = {
    ...req?.body,
    owner: isExistsUser?._id,
  };

  const result = await SkiPass.create(formData);

  return result;
};

export const reviewSkiPass = async (
  id: string,
  user: JwtPayload,
  payload: Partial<IReview>
) => {
  // Verify user exists
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  // Ensure user role is 'User'
  if (isExistsUser?.role !== 'User') {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You cannot add a review because your account is not a user.'
    );
  }

  // Find the SkiPass product
  const skiPass = await SkiPass.findById(id);
  if (!skiPass) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Ski pass not found');
  }

  //  (Optional) Prevent duplicate reviews by the same user
  const alreadyReviewed = skiPass.reviews.some(
    review => review.userId.toString() === isExistsUser._id.toString()
  );
  if (alreadyReviewed) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'You have already reviewed this ski pass.'
    );
  }

  // Push new review
  const newReview = {
    userId: isExistsUser?._id,
    rating: payload?.rating,
    comment: payload?.comment,
    createdAt: new Date(),
  };

  skiPass.reviews.push(newReview as IReview);

  // Recalculate average rating
  const total = skiPass.reviews.reduce((sum, r) => sum + r.rating, 0);
  skiPass.averageRating = parseFloat(
    (total / skiPass.reviews.length).toFixed(1)
  );

  // Save updated SkiPass
  await skiPass.save();

  return skiPass;
};

const updateSkiPassIntoDB = async (req: Request) => {
  const { id: skiPassId } = req.params;
  const user = req.user as JwtPayload;

  const isExistsSkiPass = await SkiPass.findById(skiPassId);
  if (!isExistsSkiPass) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Ski pass not found.');
  }

  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  } 
  
  // Check provider role & type
  if (
    isExistsUser?.role !== 'Provider' ||
    isExistsUser?.providerType !== 'Ski_Pass'
  ) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to update this restaurant service.'
    );
  }

  if (isExistsSkiPass?.owner?.toString() !== isExistsUser._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not the owner of this product. Cannot update booking status.'
    );
  }

  if (req.file) {
    const fileUrl = await s3Services.uploadSingleFileToS3(
      req.file,
      USER_UPLOADS_FOLDER
    );
    req.body.thumbnail = fileUrl;
  } else {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Thumbnail file not found.');
  }

  const updateData = req?.body;

  const result = await SkiPass.findByIdAndUpdate(
    skiPassId,
    { $set: updateData },
    { new: true }
  );

  return result;
};

const deleteSkiPassIntoDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const skiPass = await SkiPass.findById(id);
  if (!skiPass) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Ski pass not found.');
  }

  if (skiPass.ownerId.toString() !== isExistsUser._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to delete this ski pass.'
    );
  }

  const result = await SkiPass.findByIdAndDelete(id);
  return result;
};

export const SkiPassService = {
  getAllSkiPassFromDB,
  addSkiPassIntoDB,
  reviewSkiPass,
  getSingleSkipPassFromDB,
  updateSkiPassIntoDB,
  deleteSkiPassIntoDB,
};
