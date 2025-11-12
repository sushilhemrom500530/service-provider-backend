import { Types, mongoose } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import { JwtPayload } from 'jsonwebtoken';
import { IReview } from '../common/common.interface';
import { SkiHire } from './skihire.model';
import { Category } from './../category/category.model';
import { USER_UPLOADS_FOLDER } from './skihire.constant';

const getAllSkiHireFromDB = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const skiHire = await SkiHire.find({ owner: isExistsUser?._id }).populate({
    path: 'owner',
    select: '-isDeleted -agreeTermsCondition -__v -createdAt -updatedAt',
  });

  const result = await Promise.all(
    skiHire.map(async skih => {
      const categoryDoc = await Category.findOne(
        {
          primaryCategoryName: 'Ski_Hire',
          'subCategory._id': skih.category,
        },
        { 'subCategory.$': 1 }
      );

      const subCategoryData = categoryDoc?.subCategory?.[0] || null;

      return {
        ...skih.toObject(),
        category: subCategoryData,
      };
    })
  );
  return result;
};

const getSingleSkiHireFromDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const skiHire = await SkiHire.findById(id).populate({
    path: 'owner',
    select: '-isDeleted -agreeTermsCondition -__v -createdAt -updatedAt',
  });
  if (!skiHire)
    throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire not found.');

  // manually populate subcategory
  const categoryDoc = await Category.findOne(
    { primaryCategoryName: 'Ski_Hire', 'subCategory._id': skiHire?.category },
    { 'subCategory.$': 1 }
  );

  const subCategoryData = categoryDoc?.subCategory?.[0] || null;

  return {
    ...skiHire.toObject(),
    category: subCategoryData,
  };
};

const addSkiHireIntoDB = async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const { category: categoryId } = req.body;

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
      'You are not authorized to create a ski hire service.'
    );
  }

  // Now we know user is a Provider — check providerType
  if (isExistsUser?.providerType !== 'Ski_Hire') {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only providers with providerType : SkiHire can create a ski hire service.'
    );
  }

  const category = await Category.findOne({ primaryCategoryName: 'Ski_Hire' });
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire category not found.');
  }

  const subCategoryItems = category?.subCategory || [];

  const exists = subCategoryItems.some(
    item => item?._id.toString() === categoryId
  );

  if (!exists) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Invalid sub-category ID for Ski Hire.'
    );
  }

  const thumbnailFile = req.files?.['thumbnail']?.[0];
  if (!thumbnailFile) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Thumbnail file not found.');
  }

  const thumbnailUrl = await s3Services.uploadSingleFileToS3(
    thumbnailFile,
    USER_UPLOADS_FOLDER
  );

  // Parse product items
  let productItems: any[] = [];

  if (typeof req.body.productItems === 'string') {
    productItems = JSON.parse(req.body.productItems);
  } else if (Array.isArray(req.body.productItems)) {
    productItems = req.body.productItems;
  } else {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Product items data is missing or invalid.'
    );
  }

  //  Upload product item images
  const productItemFiles = req.files?.['images'] || [];

  const processedProductItems = await Promise.all(
    productItems.map(async (item: any, index: number) => {
      const productFile = productItemFiles[index];
      if (!productFile) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Product image for item "${item?.productName}" is missing.`
        );
      }

      const productPhotoUrl = await s3Services.uploadSingleFileToS3(
        productFile,
        USER_UPLOADS_FOLDER
      );

      return {
        productName: item?.productName,
        productPhoto: productPhotoUrl,
        price: Number(item.price),
        totalQty: Number(item.quantity),
        availableQty: Number(item.quantity),
      };
    })
  );

  const totalPrice = processedProductItems.reduce(
    (sum: number, item: any) => sum + item?.price,
    0
  );

  const skiHireData = {
    category: categoryId || req.body.category,
    title: req.body.title,
    thumbnail: thumbnailUrl,
    owner: isExistsUser?._id,
    extraChargePerHour: Number(req.body.extraChargePerHour || 0) || 0,
    totalPrice,
    serviceArea: req.body.serviceArea,
    items: processedProductItems,
  }; 

  const result = await SkiHire.create(skiHireData);
  return result;
};

export const reviewSkiHire = async (
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
  const skiHire = await SkiHire.findById(id);
  if (!skiHire) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire not found');
  }

  //  (Optional) Prevent duplicate reviews by the same user
  const alreadyReviewed = skiHire.reviews.some(
    review => review.userId.toString() === isExistsUser._id.toString()
  );
  if (alreadyReviewed) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'You have already reviewed this skiHire.'
    );
  }

  // Push new review
  const newReview = {
    userId: isExistsUser?._id,
    rating: payload?.rating,
    comment: payload?.comment,
    createdAt: new Date(),
  };

  skiHire.reviews.push(newReview as IReview);

  // Recalculate average rating
  const total = skiHire.reviews.reduce((sum, r) => sum + r.rating, 0);
  skiHire.averageRating = parseFloat(
    (total / skiHire.reviews.length).toFixed(1)
  );

  // Save updated skiHire
  await skiHire.save();

  return skiHire;
};

const updateSkiHireIntoDB = async (req: Request) => {
  const id = req?.params?.id;
  const user = req.user as JwtPayload;

  // Check if ski hire exists
  const isExistsSkiHire = await SkiHire.findById(id);
  if (!isExistsSkiHire) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire not found.');
  }

  // Verify user
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
    isExistsUser?.providerType !== 'Ski_Hire'
  ) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to update this ski hire service.'
    );
  }

  if (req.files?.['thumbnail']?.[0]) {
    const thumbnailFile = req.files['thumbnail'][0];
    const thumbnailUrl = await s3Services.uploadSingleFileToS3(
      thumbnailFile,
      USER_UPLOADS_FOLDER
    );
    req.body.thumbnail = thumbnailUrl;
  }

  // Update product items if provided
  if (req.body.productItems) {
    let productItems: any[] = [];
    if (typeof req.body?.productItems === 'string') {
      productItems = JSON.parse(req.body?.productItems);
    } else if (Array.isArray(req.body?.productItems)) {
      productItems = req.body?.productItems;
    } else {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Product items data is invalid.'
      );
    }

    const existingLength = isExistsSkiHire?.productItems.length;

    if (productItems.length !== existingLength) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Product items length must match existing length (${existingLength}).`
      );
    }

    const productItemFiles = req.files?.['images'] || [];

    const processedProductItems = await Promise.all(
      productItems.map(async (item: any, index: number) => {
        // Preserve existing photo if exists
        let productPhoto = item?.productPhoto || '';

        // Only try to match uploaded file if _id exists
        let productFile;
        if (item._id) {
          productFile = productItemFiles.find(
            (file: any) => file.fieldname === item?._id.toString()
          );
        } else {
          // fallback: use index to match new products
          productFile = productItemFiles[index];
        }

        if (productFile) {
          productPhoto = await s3Services.uploadSingleFileToS3(
            productFile,
            USER_UPLOADS_FOLDER
          );
        }

        return {
          _id: item._id, // may be undefined for new products
          productName: item.productName,
          productPhoto,
          price: Number(item.price),
          quantity: Number(item.quantity),
        };
      })
    );

    req.body.items = processedProductItems;

    req.body.totalPrice = processedProductItems.reduce(
      (sum: number, item: any) => sum + item.price,
      0
    );
  }

  const result = await SkiHire.findByIdAndUpdate(
    id,
    {
      ...req.body,
    },
    { new: true }
  );

  return result;
};

const deleteSkiHireIntoDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const skiHire = await SkiHire.findById(id);
  if (!skiHire) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire not found.');
  }

  if (skiHire?.owner.toString() !== isExistsUser?._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to delete this ski hire.'
    );
  }

  const result = await SkiHire.findByIdAndDelete(id);
  return result;
};

export const SkiHireService = {
  getAllSkiHireFromDB,
  getSingleSkiHireFromDB,
  addSkiHireIntoDB,
  reviewSkiHire,
  updateSkiHireIntoDB,
  deleteSkiHireIntoDB,
};
