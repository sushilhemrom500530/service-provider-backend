import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import { JwtPayload } from 'jsonwebtoken';  
import { IReview } from '../common/common.interface';
import { SkiHire } from './skihire.model';

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
  if (isExistsUser?.providerType !== 'SkiHire') {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only providers with providerType : SkiHire can create a ski hire service.'
    );
  }

  // Upload ski hire thumbnail
  const thumbnailFile = req.files?.['thumbnail']?.[0];
  if (!thumbnailFile) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Thumbnail file not found.');
  }
  const thumbnailUrl = await s3Services.uploadSingleFileToS3(
    thumbnailFile,
    USER_UPLOADS_FOLDER
  );

  // Parse menu items JSON
  let menuItems: any[] = [];
  if (typeof req.body.menuItems === 'string') {
    menuItems = JSON.parse(req.body.menuItems);
  } else if (Array.isArray(req.body.menuItems)) {
    menuItems = req.body.menuItems;
  } else {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Menu items data is missing or invalid.'
    );
  }

  // Upload menu item images
  const menuItemFiles = req.files?.['menuItems'] || [];
  const processedMenuItems = await Promise.all(
    menuItems.map(async (item: any, index: number) => {
      const menuFile = menuItemFiles[index];
      if (!menuFile) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `Menu image for item ${item?.name} is missing.`
        );
      }

      const menuImageUrl = await s3Services.uploadSingleFileToS3(
        menuFile,
        USER_UPLOADS_FOLDER
      );

      return {
        ...item,
        price: Number(item.price),
        menuImage: menuImageUrl,
      };
    })
  );

  // Calculate total price
  const { openTime, closeTime } = req.body;
  const totalPrice = menuItems.reduce(
    (sum: number, item: any) => sum + Number(item.price || 0),
    0
  );

  // day count calculation
  function timeStrToHours(timeStr: string) {
    const [time, meridian] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);

    if (meridian === 'PM' && hours !== 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;

    return hours + minutes / 60;
  }

  // Convert openTime and closeTime to hours
  const openHours = timeStrToHours(openTime);
  const closeHours = timeStrToHours(closeTime);

  // Calculate total hours difference
  let totalHours = closeHours - openHours;
  if (totalHours < 0) totalHours += 24; // handle overnight shifts

  // Calculate dayCount as fractional days
  const dayCount = Number((totalHours / 24).toFixed(2));

  //Prepare ski hire data
  const skiHireData = {
    ...(req.body ),
    ownerId: isExistsUser?._id,
    thumbnail: thumbnailUrl,
    totalPrice,
    dayCount,
    menuItems: processedMenuItems,
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
    ...(req.body),
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
