import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { User } from './../user/user.model';
import AppError from './../../errors/AppErro'; 
import { s3Services } from './../../aws/s3Service';
import { IReview } from './../common/common.interface'; 
import { Transport } from './transport.model';
import { USER_UPLOADS_FOLDER } from './transport.constant';

const getAllTransportFromDB = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const result = await Transport.find();
  return result;
};

const getSingleTransportFromDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }
  const result = await Transport.findById(id).populate('ownerId');

  if (!result) {
    return {
      message: ` This transport id's ${id} data not found.`,
    };
  }
  return result;
};

const addTransportIntoDB = async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
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
      'You are not authorized to create a trasport service.'
    );
  }

  // Now we know user is a Provider — check providerType
  if (isExistsUser?.providerType !== 'Transport') {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only providers with providerType : Transport can create a transport service.'
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

  const updateData = {
    ...req?.body,
    ownerId: isExistsUser._id as Types.ObjectId,
  };

  const result = await Massage.create(updateData);

  return result;
};

export const reviewTransport = async (
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
  const transport = await Transport.findById(id);
  if (!transport) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Transport not found');
  }

  //  (Optional) Prevent duplicate reviews by the same user
  const alreadyReviewed = transport.reviews.some(
    review => review.userId.toString() === isExistsUser._id.toString()
  );
  if (alreadyReviewed) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'You have already reviewed this transport.'
    );
  }

  // Push new review
  const newReview = {
    userId: isExistsUser?._id,
    rating: payload?.rating,
    comment: payload?.comment,
    createdAt: new Date(),
  };

  transport.reviews.push(newReview as IReview);

  // Recalculate average rating
  const total = transport.reviews.reduce((sum, r) => sum + r.rating, 0);
  transport.averageRating = parseFloat(
    (total / transport.reviews.length).toFixed(1)
  );

  // Save updated transport
  await transport.save();

  return transport;
};

const updateTransportIntoDB = async (
  req: Request,
  res: Response,
  payload: Partial<any | {}>
) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;

  const isExistsTransport = await Transport.findById(id);

  if (!isExistsTransport) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Transport not found.');
  }

  // check user
  const existsUser = await User.findById({ _id: user?.userId });
  if (!existsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
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

  const result = await Massage.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true }
  );
  return result;
};

const deleteTransportIntoDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const transport = await Transport.findById(id);
  if (!transport) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Transport not found.');
  }

  if (transport?.ownerId.toString() !== isExistsUser?._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to delete this transport.'
    );
  }

  const result = await Transport.findByIdAndDelete(id);
  return result;
};

export const TransportService = {
  getAllTransportFromDB,
  addTransportIntoDB,
  reviewTransport,
  getSingleTransportFromDB,
  updateTransportIntoDB,
  deleteTransportIntoDB,
};
