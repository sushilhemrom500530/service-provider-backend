import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import { JwtPayload } from 'jsonwebtoken';
import { Restaurant } from './restaurant.model';
import { USER_UPLOADS_FOLDER } from './restaurant.constant';
import { IRestaurant } from './restaurant.interface';

const getAllSkiHireFromDB = async (user: JwtPayload) => {
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

const getSingleSkiHireFromDB = async (id: string, user: JwtPayload) => {
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

  // Upload restaurant thumbnail
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

  //Prepare restaurant data
  const restaurantData = {
    ...(req.body as IRestaurant),
    ownerId: isExistsUser?._id,
    thumbnail: thumbnailUrl,
    totalPrice,
    dayCount,
    menuItems: processedMenuItems,
  };

  const result = await Restaurant.create(restaurantData);
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

const updateSkiHireIntoDB = async (
  req: Request,
  res: Response,
  payload: Partial<any | {}>
) => {
  const id = req?.params?.id;
  const user = req.user as JwtPayload;

  // Check if restaurant exists
  const isExistsRestaurant = await Restaurant.findById(id);
  if (!isExistsRestaurant) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant not found.');
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
    isExistsUser?.providerType !== 'Restaurant'
  ) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to update this restaurant service.'
    );
  }

  // Handle thumbnail update (optional)
  let thumbnailUrl = isExistsRestaurant.thumbnail;
  const thumbnailFile = req.files?.['thumbnail']?.[0];
  if (thumbnailFile) {
    thumbnailUrl = await s3Services.uploadSingleFileToS3(
      thumbnailFile,
      USER_UPLOADS_FOLDER
    );
  }

  // Parse menu items (if provided)
  let menuItems = isExistsRestaurant.menuItems;
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
  let openTime = req.body.openTime || isExistsRestaurant.openTime;
  let closeTime = req.body.closeTime || isExistsRestaurant.closeTime;

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
    ...(req.body as Partial<IRestaurant>),
    thumbnail: thumbnailUrl,
    menuItems,
    totalPrice,
    dayCount,
  };

  const result = await Restaurant.findByIdAndUpdate(
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

export const SkiHireService = {
  getAllSkiHireFromDB,
  getSingleSkiHireFromDB,
  addSkiHireIntoDB,
  reviewSkiHire,
  updateSkiHireIntoDB,
  deleteSkiHireIntoDB,
};
