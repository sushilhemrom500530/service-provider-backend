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

  const restaurant = await Restaurant.find({
    owner: isExistsUser?._id,
  }).populate({
    path: 'owner',
    select: '-isDeleted -agreeTermsCondition -__v -createdAt -updatedAt',
  });

  const result = await Promise.all(
    restaurant.map(async restuar => {
      const categoryDoc = await Category.findOne(
        {
          primaryCategoryName: 'Restaurant',
          'subCategory._id': restuar.category,
        },
        { 'subCategory.$': 1 }
      );

      const subCategoryData = categoryDoc?.subCategory?.[0] || null;

      return {
        ...restuar.toObject(),
        category: subCategoryData,
      };
    })
  );

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

  // Check if user exists
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  // Validate role and providerType
  if (isExistsUser.role !== 'Provider')
    throw new AppError(StatusCodes.FORBIDDEN, 'You are not authorized to create a restaurant.');
  if (isExistsUser.providerType !== 'Restaurant')
    throw new AppError(StatusCodes.FORBIDDEN, 'Provider must be Restaurant type.');

  // Validate category
  const category = await Category.findOne({ primaryCategoryName: 'Restaurant' });
  if (!category) throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant category not found.');

  const subCategoryItems = category?.subCategory || [];
  const exists = subCategoryItems.some(item => item._id.toString() === req.body.category);
  if (!exists) throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid sub-category ID.');

  // Upload thumbnail
  const thumbnailFile = req.files?.['thumbnail']?.[0];
  if (!thumbnailFile) throw new AppError(StatusCodes.BAD_REQUEST, 'Thumbnail file not found.');
  const thumbnailUrl = await s3Services.uploadSingleFileToS3(thumbnailFile, USER_UPLOADS_FOLDER);

  // Parse menu items (ICategoryItem[])
 let items: any[] = [];
  if (typeof req.body.items === 'string') {
    items = JSON.parse(req.body.items);
  } else if (Array.isArray(req.body.items)) {
    items = req.body.items;
  } else {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Items data is missing or invalid.');
  }

  // 🔹 Validate items
if (items.length !== 2) {
  throw new AppError(StatusCodes.BAD_REQUEST, 'Items must contain exactly 2 seat types: Normal and VIP.');
}

// Check for duplicate seat names (case-insensitive)
const seatNames = items.map(i => i.seat?.trim().toLowerCase());
const duplicateSeat = seatNames.some((seat, index) => seatNames.indexOf(seat) !== index);
if (duplicateSeat) {
  throw new AppError(StatusCodes.BAD_REQUEST, 'Duplicate seat types are not allowed.');
}

  // Upload item photos (1:1 mapping)
  const itemFiles = req.files?.['files'] || [];
  const processedItems = await Promise.all(
    items.map(async (item, index) => {
      const file = itemFiles[index];
      let photoUrl = item.photo;
      if (file) {
        photoUrl = await s3Services.uploadSingleFileToS3(file, USER_UPLOADS_FOLDER);
      }
      return {
        ...item,
        totalQty: Number(item.totalQty),
        availableQty: Number(item.totalQty),
        price: Number(item.price),
        photo: photoUrl,
      };
    })
  );

  // Parse slots and availableSlots (ISlot[])
  let slots: ISlot[] = [];
  if (typeof req.body.slots === 'string') slots = JSON.parse(req.body.slots);
  else if (Array.isArray(req.body.slots)) slots = req.body.slots;

  let availableSlots: ISlot[] = [];
  if (typeof req.body.availableSlots === 'string') availableSlots = JSON.parse(req.body.availableSlots);
  else if (Array.isArray(req.body.availableSlots)) availableSlots = req.body.availableSlots;

  // Calculate status
  const isOpenNow = isRestaurantOpen(req.body.openTime, req.body.closeTime);

  // Prepare restaurant data
  const restaurantData: IRestaurant = {
    title: req.body.title,
    thumbnail: thumbnailUrl,
    category: req.body.category,
    owner: isExistsUser._id,
    openTime: req.body.openTime,
    closeTime: req.body.closeTime,
    serviceArea: req.body.serviceArea,
    foodType: req.body.foodType,
    status: isOpenNow ? 'Open' : 'Closed',
    description: req.body.description,
    slots,
    availableSlots:slots,
    availableSlots,
    items: processedItems,
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

  let thumbnailUrl = isExistsRestaurant?.thumbnail;
  const thumbnailFile = req.files?.['thumbnail']?.[0];
  const menuItemFiles = req.files?.['files'] || [];

  if (thumbnailFile) {
    thumbnailUrl = await s3Services.uploadSingleFileToS3(
      thumbnailFile,
      USER_UPLOADS_FOLDER
    );
  }

  // Parse menu items (if provided)
  let menuItems = isExistsRestaurant?.items || [];

  if (req.body.menuItems) {
    let parsedMenuItems: any[] = [];

    if (typeof req.body.menuItems === 'string') {
      try {
        parsedMenuItems = JSON.parse(req.body.menuItems);
      } catch (err) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'Invalid JSON format for menuItems.'
        );
      }
    } else if (Array.isArray(req.body.menuItems)) {
      parsedMenuItems = req.body.menuItems;
    }

    const processedMenuItems = await Promise.all(
      parsedMenuItems.map(async (item: any, index: number) => {
        const menuFile = menuItemFiles[index];
        let menuImageUrl = item?.menuPhoto || item?.menuImage || '';

        // Upload new file if available
        if (menuFile) {
          menuImageUrl = await s3Services.uploadSingleFileToS3(
            menuFile,
            USER_UPLOADS_FOLDER
          );
        }

        // Validate image presence
        if (!menuImageUrl) {
          throw new AppError(
            StatusCodes.BAD_REQUEST,
            `Menu image missing for item "${item.name || 'Unnamed'}".`
          );
        }

        // Validate price
        const price = Number(item.price);
        if (isNaN(price) || price <= 0) {
          throw new AppError(
            StatusCodes.BAD_REQUEST,
            `Invalid or missing price for menu item "${item.name}".`
          );
        }

        return {
          ...item,
          price,
          menuPhoto: menuImageUrl,
        };
      })
    );

    menuItems = processedMenuItems;
  }

  // Calculate total price
  req.body.totalPrice = menuItems.reduce((sum, item) => {
    if (!item || typeof item.price === 'undefined') return sum;
    const price = Number(item.price);
    return sum + (isNaN(price) ? 0 : price);
  }, 0);

  const isOpenNow = isRestaurantOpen(req.body?.openTime, req.body?.closeTime);

  const updateData = {
    ...(req.body as Partial<IRestaurant>),
    thumbnail: thumbnailUrl,
    items: menuItems,
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
