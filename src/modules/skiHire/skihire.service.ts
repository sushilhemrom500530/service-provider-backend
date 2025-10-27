import { Types } from 'mongoose';
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

  const result = await SkiHire.find();
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
  const result = await SkiHire.findById(id);

  if (!result) {
    return {
      message: ` This massage id's ${id} data not found.`,
    };
  }

  return result;
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
    item => item._id.toString() === categoryId
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
        quantity: Number(item.quantity),
      };
    })
  );

  const totalPrice = processedProductItems.reduce(
    (sum: number, item: any) => sum + item.price * item.quantity,
    0
  );

  const skiHireData = {
    category: categoryId,
    title: req.body.title,
    thumbnail: thumbnailUrl,
    ownerId: isExistsUser._id,
    extraChargePerHour: Number(req.body.extraChargePerHour) || 0,
    totalPrice,
    serviceArea: req.body.serviceArea,
    productItems: processedProductItems,
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

const updateSkiHireIntoDB = async (
  req: Request,
  res: Response,
  payload: Partial<any | {}>
) => {
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
    isExistsUser?.providerType !== 'SkiHire'
  ) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to update this ski hire service.'
    );
  }

  // Handle thumbnail update (optional)
  let thumbnailUrl = isExistsSkiHire.thumbnail;
  const thumbnailFile = req.files?.['thumbnail']?.[0];
  if (thumbnailFile) {
    thumbnailUrl = await s3Services.uploadSingleFileToS3(
      thumbnailFile,
      USER_UPLOADS_FOLDER
    );
  }

  // Parse menu items (if provided)
  let menuItems = isExistsSkiHire.menuItems;
  if (req.body.menuItems) {
    let parsedMenuItems: any[] = [];

    if (typeof req.body.menuItems === 'string') {
      parsedMenuItems = JSON.parse(req.body.menuItems);
    } else if (Array.isArray(req.body.menuItems)) {
      parsedMenuItems = req.body.menuItems;
    }

    const menuItemFiles = req.files?.['menuItems'] || [];

    // Map new or updated menu items
    const processedMenuItems = await Promise.all(
      parsedMenuItems.map(async (item: any, index: number) => {
        const menuFile = menuItemFiles[index];

        let menuImageUrl = item.menuImage || '';

        if (menuFile) {
          menuImageUrl = await s3Services.uploadSingleFileToS3(
            menuFile,
            USER_UPLOADS_FOLDER
          );
        } else if (!menuImageUrl) {
          throw new AppError(
            StatusCodes.BAD_REQUEST,
            `Menu image missing for item ${item.name}`
          );
        }

        return {
          ...item,
          price: Number(item.price),
          menuImage: menuImageUrl,
        };
      })
    );

    menuItems = processedMenuItems;
  }

  //  Recalculate total price
  const totalPrice = menuItems.reduce(
    (sum, item) => sum + Number(item.price || 0),
    0
  );

  // Recalculate day count (if times updated)
  let openTime = req.body.openTime || isExistsSkiHire.openTime;
  let closeTime = req.body.closeTime || isExistsSkiHire.closeTime;

  function timeStrToHours(timeStr: string) {
    const [time, meridian] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    if (meridian === 'PM' && hours !== 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;

    return hours + minutes / 60;
  }

  const openHours = timeStrToHours(openTime);
  const closeHours = timeStrToHours(closeTime);

  let totalHours = closeHours - openHours;
  if (totalHours < 0) totalHours += 24;
  const dayCount = Number((totalHours / 24).toFixed(2));

  const updateData = {
    ...req.body,
    thumbnail: thumbnailUrl,
    menuItems,
    totalPrice,
    dayCount,
  };

  const result = await SkiHire.findByIdAndUpdate(
    id,
    { $set: updateData },
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

  if (skiHire?.ownerId.toString() !== isExistsUser?._id.toString()) {
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
