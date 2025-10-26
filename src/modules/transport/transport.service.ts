import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { Request, Response, Express } from 'express';
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

  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const brandPhotoFile = files?.['brandPhoto']?.[0];
  const thumbnailFile = files?.['thumbnail']?.[0];

  if (!brandPhotoFile || !thumbnailFile) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Both brandPhoto and thumbnail files are required.'
    );
  }

  // Upload files to S3
  const [brandPhotoUrl, thumbnailUrl] = await Promise.all([
    s3Services.uploadSingleFileToS3(brandPhotoFile, USER_UPLOADS_FOLDER),
    s3Services.uploadSingleFileToS3(thumbnailFile, USER_UPLOADS_FOLDER),
  ]);

  // Prepare transport data
  const transportData = {
    ...req.body,
    ownerId: isExistsUser?._id,
    brandPhoto: brandPhotoUrl,
    thumbnail: thumbnailUrl,
  };

  // Ensure numeric fields are properly typed
  transportData.personCount = Number(transportData.personCount);
  transportData.amount = Number(transportData.amount);

  // Create transport document
  const result = await Transport.create(transportData);
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
  const id = req?.params?.id;
  const user = req?.user as JwtPayload;

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

  const files = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;
  let brandPhotoUrl = isExistsTransport?.brandPhoto;
  let thumbnailUrl = isExistsTransport?.thumbnail;

  if (files?.['brandPhoto']?.[0]) {
    brandPhotoUrl = await s3Services.uploadSingleFileToS3(
      files['brandPhoto'][0],
      USER_UPLOADS_FOLDER
    );
  }

  if (files?.['thumbnail']?.[0]) {
    thumbnailUrl = await s3Services.uploadSingleFileToS3(
      files['thumbnail'][0],
      USER_UPLOADS_FOLDER
    );
  }

  const updateData = {
    ...req.body,
    brandPhoto: brandPhotoUrl,
    thumbnail: thumbnailUrl,
  };

  // Convert numeric fields
  if (updateData.personCount) {
    updateData.personCount = Number(updateData?.personCount);
  }
  if (updateData.amount) {
    updateData.amount = Number(updateData?.amount);
  }

  const result = await Transport.findByIdAndUpdate(
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
