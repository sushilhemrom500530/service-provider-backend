import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import { JwtPayload } from 'jsonwebtoken';
import { Restaurant } from './restaurant.model';

const getAllRestaurantFromDB = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const result = await Restaurant.find();
  return result;
};

const getSingleRestaurantFromDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }
  const result = await Restaurant.findById(id);

  if (!result) {
    return {
      message: ` This massage id's ${id} data not found.`,
    };
  }

  return result;
};

const addRestaurantIntoDB = async (req: Request, res: Response) => {
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
      'You are not authorized to create a restaurant service.'
    );
  }

  // Now we know user is a Provider — check providerType
  if (isExistsUser?.providerType !== 'Restaurant') {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only providers with providerType : Restaurant can create a restaurant service.'
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

  const result = await Restaurant.create(updateData);

  return result;
};

export const reviewRestaurant = async (
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
  const restaurant = await Restaurant.findById(id);
  if (!restaurant) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  //  (Optional) Prevent duplicate reviews by the same user
  const alreadyReviewed = restaurant.reviews.some(
    review => review.userId.toString() === isExistsUser._id.toString()
  );
  if (alreadyReviewed) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'You have already reviewed this restaurant.'
    );
  }

  // Push new review
  const newReview = {
    userId: isExistsUser?._id,
    rating: payload?.rating,
    comment: payload?.comment,
    createdAt: new Date(),
  };

  restaurant.reviews.push(newReview as IReview);

  // Recalculate average rating
  const total = restaurant.reviews.reduce((sum, r) => sum + r.rating, 0);
  restaurant.averageRating = parseFloat(
    (total / restaurant.reviews.length).toFixed(1)
  );

  // Save updated restaurant
  await restaurant.save();

  return restaurant;
};

const updateRestaurantIntoDB = async (
  req: Request,
  res: Response,
  payload: Partial<any | {}>
) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;

  const isExistsRestaurant = await Restaurant.findById(id);
  if (!isExistsRestaurant) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant not found.');
  }

  // check user
  const existsUser = await User.findById(req?.body?.ownerId);
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

  const result = await Restaurant.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true }
  );

  return result;
};

const deleteRestaurantIntoDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const restaurant = await Restaurant.findById(id);
  if (!restaurant) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant not found.');
  }

  if (restaurant?.ownerId.toString() !== isExistsUser?._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to delete this restaurant.'
    );
  }

  const result = await Restaurant.findByIdAndDelete(id);
  return result;
};

export const RestaurantService = {
  getAllRestaurantFromDB,
  addRestaurantIntoDB,
  reviewRestaurant,
  getSingleRestaurantFromDB,
  updateRestaurantIntoDB,
  deleteRestaurantIntoDB,
};
