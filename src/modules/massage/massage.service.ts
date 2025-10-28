import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { User } from './../user/user.model';
import AppError from './../../errors/AppErro';
import { Massage } from './massage.model';
import { s3Services } from './../../aws/s3Service';
import { IReview } from './../common/common.interface';
import { USER_UPLOADS_FOLDER } from './massage.constant';
import { Category } from './../category/category.model';

const getAllMassageFromDB = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const massages = await Massage.find().populate({
    path: 'owner',
    select: '-isDeleted -agreeTermsCondition -__v -createdAt -updatedAt',
  });

  const result = await Promise.all(
    massages.map(async massage => {
      const categoryDoc = await Category.findOne(
        {
          primaryCategoryName: 'Massage',
          'subCategory._id': massage.category,  
        },
        { 'subCategory.$': 1 }
      );

      const subCategoryData = categoryDoc?.subCategory?.[0] || null;

      return {
        ...massage.toObject(),
        category: subCategoryData,  
      };
    })
  );

  return result;
};

const getSingleMassageFromDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }
  const massage = await Massage.findById(id).populate({
    path: 'owner',
    select: '-isDeleted -agreeTermsCondition -__v -createdAt -updatedAt',
  });
  if (!massage) throw new AppError(StatusCodes.NOT_FOUND, 'Massage not found.');

  // manually populate subcategory
  const categoryDoc = await Category.findOne(
    {
      primaryCategoryName: 'Massage',
      'subCategory._id': massage?.category,
    },
    { 'subCategory.$': 1 }
  );

  const subCategoryData = categoryDoc?.subCategory?.[0] || null;

  return {
    ...massage.toObject(),
    category: subCategoryData,
  };
};

const addMassageIntoDB = async (req: Request) => {
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
      'You are not authorized to create a massage service.'
    );
  }

  // Now we know user is a Provider — check providerType
  if (isExistsUser?.providerType !== 'Massage') {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only providers with providerType : Massage can create a massage service.'
    );
  }

  const category = await Category.findOne({
    primaryCategoryName: 'Massage',
  });
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Massage Category not found.');
  }

  const subCategoryItems = category?.subCategory || [];

  const exists = subCategoryItems.some(
    item => item?._id.toString() === req.body?.category.toString()
  );

  if (!exists) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Invalid sub-category ID for Massage.'
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
    owner: isExistsUser?._id as Types.ObjectId,
  };

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
  const massage = await Massage.findById(id);
  if (!massage) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Massage not found');
  }

  //  (Optional) Prevent duplicate reviews by the same user
  const alreadyReviewed = massage.reviews.some(
    review => review.userId.toString() === isExistsUser._id.toString()
  );
  if (alreadyReviewed) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'You have already reviewed this massage.'
    );
  }

  // Push new review
  const newReview = {
    userId: isExistsUser?._id,
    rating: payload?.rating,
    comment: payload?.comment,
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

const updateMassageIntoDB = async (req: Request) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;

  const isExistsMassage = await Massage.findById(id);

  if (!isExistsMassage) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Massage not found.');
  }

  // check user
  const existsUser = await User.findById({ _id: user?.userId });
  if (!existsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  if (req.body?.category) {
    const isExistsCategory = await Category.findOne({
      primaryCategoryName: 'Massage',
    });
    if (!isExistsCategory) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Massage category not found.');
    }

    const subCategoryItems = isExistsCategory?.subCategory || [];

    const brandExists = subCategoryItems.some(
      item => item?._id.toString() === req.body?.category.toString()
    );

    if (!brandExists) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Invalid sub-category ID for Massage.'
      );
    }
  }

  if (req.file) {
    const fileUrl = await s3Services.uploadSingleFileToS3(
      req.file,
      USER_UPLOADS_FOLDER
    );
    req.body.thumbnail = fileUrl;
  }

  const updateData = req?.body;

  const result = await Massage.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true }
  );
  return result;
};

const deleteMassageIntoDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const massage = await Massage.findById(id);
  if (!massage) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Massage not found.');
  }

  if (massage?.owner?.toString() !== isExistsUser?._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to delete this massage.'
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
