import { Types } from 'mongoose'; 
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express'; 
import { JwtPayload } from 'jsonwebtoken'; 
import { User } from './../user/user.model';
import AppError from './../../errors/AppErro';
import { Massage } from './massage.model';
import { s3Services } from './../../aws/s3Service';
import { IReview } from './../common/common.interface';

const getAllMassageFromDB = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  const result = await Massage.find();
  return result;
};

const getSingleMassageFromDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }
  const result = await Massage.findById(id);
  return result;
};

const addMassageIntoDB = async (req: Request, res: Response) => {
  // check user
  const user = await User.findById(req?.body?.ownerId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  // Check providerType
  if (user.providerType !== 'Ski_Pass') {
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

  const updateData = req?.body;

  const result = await Massage.create(updateData);

  return result;
};

export const reviewMassage = async (
  id: string,
  user: JwtPayload,
  payload: Partial<IReview>
) => {
  // Verify user exists
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found.");
  }

  // Ensure user role is 'User'
  if (isExistsUser?.role !== "User") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You cannot add a review because your account is not a user."
    );
  }

  // Find the SkiPass product
  const massage = await Massage.findById(id);
  if (!massage) {
    throw new AppError(StatusCodes.NOT_FOUND, "Massage not found");
  }

  //  (Optional) Prevent duplicate reviews by the same user
  const alreadyReviewed = massage.reviews.some(
    (review) => review.userId.toString() === isExistsUser._id.toString()
  );
  if (alreadyReviewed) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "You have already reviewed this massage."
    );
  }

  // Push new review
  const newReview = {
    userId: isExistsUser._id,
    rating: payload.rating,
    comment: payload.comment,
    createdAt: new Date(),
  };

  massage.reviews.push(newReview as IReview);

  // Recalculate average rating
  const total = massage.reviews.reduce((sum, r) => sum + r.rating, 0);
  massage.averageRating = parseFloat(
    (total / massage.reviews.length).toFixed(1)
  );

  // Save updated massage
  await massage.save();

  return massage;
};

const updateMassageIntoDB = async (
  req: Request,
  res: Response,
  payload: Partial<any | {}>
) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;

  // check user
  const existsUser = await User.findById(req?.body?.ownerId);
  if (!existsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
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

  const result = await Massage.create(updateData);

  return result;
};

const deleteMassageIntoDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }
 
  const massage = await Massage.findById(id);
  if (!massage) {
    throw new AppError(StatusCodes.NOT_FOUND, "Massage not found.");
  }
 
  if (massage?.ownerId.toString() !== isExistsUser?._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You are not authorized to delete this massage."
    );
  }

  const result = await Massage.findByIdAndDelete(id);
  return result;
};

export const MassageService = {
  getAllMassageFromDB,
  addMassageIntoDB,
  reviewMassage,
  getSingleMassageFromDB,
  updateMassageIntoDB,
  deleteMassageIntoDB,
};
