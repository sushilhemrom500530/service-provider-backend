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
import { Category } from './../category/category.model';
import { isRestaurantOpen } from './../../utils/restaurentTimeConvert';

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
  const restaurant = await Restaurant.findById(id).populate({
    path: 'owner',
    select: '-isDeleted -agreeTermsCondition -__v -createdAt -updatedAt',
  });
  if (!restaurant)
    throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant not found.');

  // manually populate subcategory
  const categoryDoc = await Category.findOne(
    {
      primaryCategoryName: 'Restaurant',
      'subCategory._id': restaurant?.category,
    },
    { 'subCategory.$': 1 }
  );

  const subCategoryData = categoryDoc?.subCategory?.[0] || null;

  return {
    ...restaurant.toObject(),
    category: subCategoryData,
  };
};

const addRestaurantIntoDB = async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const { category: categoryId, openTime, closeTime } = req.body;

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

  const category = await Category.findOne({
    primaryCategoryName: 'Restaurant',
  });
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant category not found.');
  }

  const subCategoryItems = category?.subCategory || [];

  const exists = subCategoryItems.some(
    item => item._id.toString() === categoryId
  );

  if (!exists) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Invalid sub-category ID for Restaurant.'
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
    menuItems = JSON.parse(req.body?.menuItems);
  } else if (Array.isArray(req.body?.menuItems)) {
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
        menuPhoto: menuImageUrl,
      };
    })
  );

  // Calculate total price
  const totalPrice = menuItems.reduce(
    (sum: number, item: any) => sum + Number(item.price || 0),
    0
  );
  const isOpenNow = isRestaurantOpen(openTime, closeTime);

  //Prepare restaurant data
  const restaurantData = {
    ...(req.body as IRestaurant),
    owner: isExistsUser?._id,
    thumbnail: thumbnailUrl,
    totalPrice,
    menuItems: processedMenuItems,
    status: isOpenNow ? 'Open' : 'Closed',
  };

  const result = await Restaurant.create(restaurantData);
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

const updateRestaurantIntoDB = async (req: Request) => {
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

    if (typeof req.body?.menuItems === 'string') {
      parsedMenuItems = JSON.parse(req.body?.menuItems);
    } else if (Array.isArray(req.body?.menuItems)) {
      parsedMenuItems = req.body?.menuItems;
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

  const isOpenNow = isRestaurantOpen(req.body?.openTime, req.body?.closeTime);

  const updateData = {
    ...(req.body as Partial<IRestaurant>),
    thumbnail: thumbnailUrl,
    menuItems,
    totalPrice,
    status: isOpenNow ? 'Open' : 'Closed',
  };

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

  if (restaurant?.owner.toString() !== isExistsUser?._id.toString()) {
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
