import mongoose, { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import { JwtPayload } from 'jsonwebtoken';
import { Restaurant } from './restaurant.model';
import { USER_UPLOADS_FOLDER } from './restaurant.constant';
import { IRestaurant, ISlot } from './restaurant.interface';
import { Category } from './../category/category.model';
import { isRestaurantOpen } from './../../utils/restaurentTimeConvert';
import { IReview } from './../common/common.interface';

const getAllRestaurantFromDB = async (user: JwtPayload, query: any) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  // Pagination
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  // Search filter
  const search = query.search
    ? { title: { $regex: query.search, $options: 'i' } }
    : {};

  // Category filter
  let categoryFilter = {};
  if (query.category) {
    const categories = await Category.find(
      {
        primaryCategoryName: 'Restaurant',
        'subCategory.name': { $regex: query.category, $options: 'i' },
      },
      { 'subCategory.$': 1 },
    );

    const categoryIds = categories.map(c => c.subCategory?.[0]?._id);

    if (categoryIds.length > 0) {
      categoryFilter = { category: { $in: categoryIds } };
    } else {
      return {
        data: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      };
    }
  }

  const filters = {
    ...search,
    ...categoryFilter,
  };

  // Total after filters
  const total = await Restaurant.countDocuments(filters);

  // Fetch paginated restaurant data
  const restaurantList = await Restaurant.find(filters)
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'owner',
      select: '-isDeleted -agreeTermsCondition -__v -createdAt -updatedAt',
    })
    .sort({ createdAt: -1 });

  // Attach category data (kept exactly as your logic)
  const result = await Promise.all(
    restaurantList.map(async item => {
      const categoryDoc = await Category.findOne(
        {
          primaryCategoryName: 'Restaurant',
          'subCategory._id': item.category,
        },
        { 'subCategory.$': 1 },
      );

      return {
        ...item.toObject(),
        category: categoryDoc?.subCategory?.[0] || null,
      };
    }),
  );

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    result,
  };
};

const getAllMyRestaurantFromDB = async (user: JwtPayload, query: any) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  // Pagination
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  // Search filter
  const search = query.search
    ? { title: { $regex: query.search, $options: 'i' } }
    : {};

  // Category filter
  let categoryFilter = {};
  if (query.category) {
    const categories = await Category.find(
      {
        primaryCategoryName: 'Restaurant',
        'subCategory.name': { $regex: query.category, $options: 'i' },
      },
      { 'subCategory.$': 1 },
    );

    const categoryIds = categories.map(c => c.subCategory?.[0]?._id);

    if (categoryIds.length > 0) {
      categoryFilter = { category: { $in: categoryIds } };
    } else {
      return {
        data: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      };
    }
  }

  const filters = {
    owner: isExistsUser._id,
    ...search,
    ...categoryFilter,
  };

  // Total after filters
  const total = await Restaurant.countDocuments(filters);

  // Fetch paginated restaurant data
  const restaurantList = await Restaurant.find(filters)
    .select('-__v')
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'owner',
      select: 'email address fullName profileUrl',
    })
    .sort({ createdAt: -1 });

  // Attach category data (kept exactly as your logic)
  const result = await Promise.all(
    restaurantList.map(async item => {
      const categoryDoc = await Category.findOne(
        {
          primaryCategoryName: 'Restaurant',
          'subCategory._id': item.category,
        },
        { 'subCategory.$': 1 },
      );

      return {
        ...item.toObject(),
        category: categoryDoc?.subCategory?.[0] || null,
      };
    }),
  );

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    result,
  };
};

const getSingleRestaurantFromDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.',
    );
  }
  const restaurant = await Restaurant.findById(id)
    .populate({
      path: 'owner',
      select: '-isDeleted -agreeTermsCondition -__v -createdAt -updatedAt',
    })
    .populate({
      path: 'reviews.userId',
      select: 'fullName email phoneNumber profileUrl createdAt', // choose what you want
    })
    .populate({
      path: 'refunds.userId',
      select: 'fullName email phoneNumber profileUrl createdAt',
    });

  if (!restaurant)
    throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant not found.');

  // manually populate subcategory
  const categoryDoc = await Category.findOne(
    {
      primaryCategoryName: 'Restaurant',
      'subCategory._id': restaurant?.category,
    },
    { 'subCategory.$': 1 },
  );

  const subCategoryData = categoryDoc?.subCategory?.[0] || null;

  return {
    ...restaurant.toObject(),
    category: subCategoryData,
  };
};

// const addRestaurantIntoDB = async (req: Request) => {
//   const user = req.user as JwtPayload;

//   // Check if user exists
//   const isExistsUser = await User.findOne({ email: user?.email });
//   if (!isExistsUser)
//     throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

//   // Validate role and providerType
//   if (isExistsUser.role !== 'Provider')
//     throw new AppError(
//       StatusCodes.FORBIDDEN,
//       'You are not authorized to create a restaurant.'
//     );
//   if (isExistsUser.providerType !== 'Restaurant')
//     throw new AppError(
//       StatusCodes.FORBIDDEN,
//       'Provider must be Restaurant type.'
//     );

//   // Validate category
//   const category = await Category.findOne({
//     primaryCategoryName: 'Restaurant',
//   });
//   if (!category)
//     throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant category not found.');

//   const subCategoryItems = category?.subCategory || [];
//   const exists = subCategoryItems.some(
//     (item: any) => item?._id?.toString() === req.body?.category?.toString()
//   ) as boolean;
//   if (!exists)
//     throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid sub-category ID.');

//   // Upload thumbnail
//   const uploadedFiles = (req as any).files as
//     | { [fieldname: string]: any[] }
//     | undefined;

//   const thumbnailFile: any = uploadedFiles?.thumbnail?.[0];
//   if (!thumbnailFile)
//     throw new AppError(StatusCodes.BAD_REQUEST, 'Thumbnail file not found.');
//   const thumbnailUrl = await s3Services.uploadSingleFileToS3(
//     thumbnailFile,
//     USER_UPLOADS_FOLDER
//   );

//   // Parse menu items (ICategoryItem[])
//   let items: any[] = [];
//   if (typeof req.body.items === 'string') {
//     items = JSON.parse(req.body.items);
//   } else if (Array.isArray(req.body.items)) {
//     items = req.body.items;
//   } else {
//     throw new AppError(
//       StatusCodes.BAD_REQUEST,
//       'Items data is missing or invalid.'
//     );
//   }

//   // 🔹 Validate items
//   if (items.length !== 2) {
//     throw new AppError(
//       StatusCodes.BAD_REQUEST,
//       'Items must contain exactly 2 seat types: Normal and VIP.'
//     );
//   }

//   // Check for duplicate seat names (case-insensitive)
//   const seatNames = items.map(i => i?.seat?.trim().toLowerCase());
//   const duplicateSeat = seatNames.some(
//     (seat, index) => seatNames.indexOf(seat) !== index
//   );
//   if (duplicateSeat) {
//     throw new AppError(
//       StatusCodes.BAD_REQUEST,
//       'Duplicate seat types are not allowed.'
//     );
//   }

//   // Upload item photos (1:1 mapping)
//   const itemFiles: any[] = uploadedFiles?.files || [];
//   const processedItems = await Promise.all(
//     items.map(async (item, index) => {
//       const file = itemFiles[index];
//       let photoUrl = item.photo;
//       if (file) {
//         photoUrl = await s3Services.uploadSingleFileToS3(
//           file,
//           USER_UPLOADS_FOLDER
//         );
//       }
//       return {
//         ...item,
//         totalQty: Number(item.totalQty),
//         availableQty: Number(item.totalQty),
//         price: Number(item.price),
//         photo: photoUrl,
//       };
//     })
//   );

//   // Parse slots and availableSlots (ISlot[])
//   let slots: ISlot[] = [];
//   if (typeof req.body.slots === 'string') slots = JSON.parse(req.body.slots);
//   else if (Array.isArray(req.body.slots)) slots = req.body.slots;

//   // coppy available slots on slots
//   let availableSlots = slots;

//   // Calculate status
//   const isOpenNow = isRestaurantOpen(req.body.openTime, req.body.closeTime);

//   // Prepare restaurant data
//   const restaurantData: Partial<IRestaurant> = {
//     title: req.body.title,
//     thumbnail: thumbnailUrl,
//     category: req.body.category,
//     owner: isExistsUser._id,
//     openTime: req.body.openTime,
//     closeTime: req.body.closeTime,
//     serviceArea: req.body.serviceArea,
//     foodType: req.body.foodType,
//     status: isOpenNow ? 'Open' : 'Closed',
//     description: req.body.description,
//     slots,
//     items: processedItems,
//   };

//   const result = await Restaurant.create(restaurantData);
//   return result;
// };

const addRestaurantIntoDB = async (req: Request) => {
  const user = req.user as JwtPayload;

  // Check if user exists
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser)
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  // Validate role and providerType
  if (isExistsUser.role !== 'Provider')
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to create a restaurant.',
    );
  if (isExistsUser.providerType !== 'Restaurant')
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Provider must be Restaurant type.',
    );

  // Validate category
  const category = await Category.findOne({
    primaryCategoryName: 'Restaurant',
  });
  if (!category)
    throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant category not found.');

  const subCategoryItems = category?.subCategory || [];
  const exists = subCategoryItems.some(
    (item: any) => item?._id?.toString() === req.body?.category?.toString(),
  ) as boolean;
  if (!exists)
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid sub-category ID.');

  // Upload thumbnail
  const uploadedFiles = (req as any).files as
    | { [fieldname: string]: any[] }
    | undefined;

  const thumbnailFile: any = uploadedFiles?.thumbnail?.[0];
  if (!thumbnailFile)
    throw new AppError(StatusCodes.BAD_REQUEST, 'Thumbnail file not found.');
  const thumbnailUrl = await s3Services.uploadSingleFileToS3(
    thumbnailFile,
    USER_UPLOADS_FOLDER,
  );

  // Parse menu items (ICategoryItem[])
  let items: any[] = [];
  if (typeof req.body.items === 'string') {
    items = JSON.parse(req.body.items);
  } else if (Array.isArray(req.body.items)) {
    items = req.body.items;
  } else {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Items data is missing or invalid.',
    );
  }

  // 🔹 Validate items
  if (items.length !== 2) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Items must contain exactly 2 seat types: Normal and VIP.',
    );
  }

  // Check for duplicate seat names (case-insensitive)
  const seatNames = items.map(i => i?.seat?.trim().toLowerCase());
  const duplicateSeat = seatNames.some(
    (seat, index) => seatNames.indexOf(seat) !== index,
  );
  if (duplicateSeat) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Duplicate seat types are not allowed.',
    );
  }

  // 🔹 Upload item photos (supports files[0], files[1] from Postman)
  let itemFiles: any[] = [];
  if (uploadedFiles?.files) {
    if (Array.isArray(uploadedFiles.files)) {
      itemFiles = uploadedFiles.files;
    } else {
      // convert object keys '0', '1' → array in order
      const keys = Object.keys(uploadedFiles.files)
        .map(k => parseInt(k))
        .sort((a, b) => a - b);
      itemFiles = keys.map(k => uploadedFiles.files[k][0]); // each key is array
    }
  }

  const processedItems = await Promise.all(
    items.map(async (item, index) => {
      const file = itemFiles[index];
      let photoUrl = item.photo;
      if (file) {
        photoUrl = await s3Services.uploadSingleFileToS3(
          file,
          USER_UPLOADS_FOLDER,
        );
      }
      return {
        ...item,
        totalQty: Number(item.totalQty),
        availableQty: Number(item.totalQty),
        price: Number(item.price),
        photo: photoUrl,
      };
    }),
  );

  // Parse slots and availableSlots (ISlot[])
  let slots: ISlot[] = [];
  if (typeof req.body.slots === 'string') slots = JSON.parse(req.body.slots);
  else if (Array.isArray(req.body.slots)) slots = req.body.slots;

  let availableSlots = slots; // copy available slots

  // Calculate status
  const isOpenNow = isRestaurantOpen(req.body.openTime, req.body.closeTime);

  // Prepare restaurant data
  const restaurantData: Partial<IRestaurant> = {
    title: req.body.title,
    thumbnail: thumbnailUrl,
    category: req.body.category,
    owner: isExistsUser._id,
    openTime: req.body.openTime,
    closeTime: req.body.closeTime,
    serviceArea: req.body.serviceArea,
    foodType: req.body.foodType,
    status: isOpenNow ? 'Open' : 'Closed',
    // description: req.body.description,
    slots,
    items: processedItems,
  };

  const result = await Restaurant.create(restaurantData);
  return result;
};

export const reviewRestaurant = async (
  id: string,
  user: JwtPayload,
  payload: Partial<IReview>,
) => {
  // Verify user exists
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.',
    );
  }

  // Ensure user role is 'User'
  if (isExistsUser?.role !== 'User') {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You cannot add a review because your account is not a user.',
    );
  }

  // Find the SkiPass product
  const restaurant = await Restaurant.findById(id);
  if (!restaurant) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant not found');
  }

  //  (Optional) Prevent duplicate reviews by the same user
  const alreadyReviewed =
    restaurant.reviews?.some(
      review => review?.userId.toString() === isExistsUser?._id.toString(),
    ) || false;
  if (alreadyReviewed) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'You have already reviewed this restaurant.',
    );
  }

  // Push new review
  const newReview = {
    userId: isExistsUser!._id,
    rating: payload?.rating,
    comment: payload?.comment,
    createdAt: new Date(),
  } as IReview;

  if (!Array.isArray(restaurant.reviews)) {
    restaurant.reviews = [];
  }

  restaurant.reviews.push(newReview);

  // Recalculate average rating
  const total: number = restaurant.reviews.reduce(
    (sum: number, r: IReview) => sum + (r?.rating || 0),
    0,
  );
  restaurant.averageRating = restaurant.reviews.length
    ? parseFloat((total / restaurant.reviews.length).toFixed(1))
    : 0;

  // Save updated restaurant
  await restaurant.save();

  return restaurant;
};

// export const updateRestaurantIntoDB = async (req: Request) => {
//   const id = req.params.id;
//   const user = req.user as JwtPayload;

//   // Check if restaurant exists
//   const restaurant = await Restaurant.findById(id);
//   if (!restaurant)
//     throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant not found.');

//   // Check user
//   const isExistsUser = await User.findOne({ email: user?.email });
//   if (!isExistsUser)
//     throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
//   if (
//     isExistsUser.role !== 'Provider' ||
//     isExistsUser.providerType !== 'Restaurant'
//   ) {
//     throw new AppError(
//       StatusCodes.FORBIDDEN,
//       'You are not authorized to update this restaurant.'
//     );
//   }

//   // Validate category if provided
//   if (req.body.category) {
//     const category = await Category.findOne({
//       primaryCategoryName: 'Restaurant',
//     });
//     if (!category)
//       throw new AppError(
//         StatusCodes.NOT_FOUND,
//         'Restaurant category not found.'
//       );

//     const subCategoryItems = category?.subCategory || [];
//     const exists = subCategoryItems.some(
//       (item: any) => item?._id.toString() === req.body.category
//     ) as boolean;
//     if (!exists)
//       throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid sub-category ID.');
//     restaurant.category = req.body?.category;
//   }

//   // Upload new thumbnail if provided
//   const uploadedFilesUpdate = (req as any).files as
//     | { [fieldname: string]: any[] }
//     | undefined;

//   const thumbnailFile: any = uploadedFilesUpdate?.thumbnail?.[0];
//   if (thumbnailFile) {
//     const thumbnailUrl = await s3Services.uploadSingleFileToS3(
//       thumbnailFile,
//       USER_UPLOADS_FOLDER
//     );
//     restaurant.thumbnail = thumbnailUrl;
//   }

//   // Update items if provided
//   if (req.body.items) {
//     let items: any[] = [];
//     if (typeof req.body.items === 'string') items = JSON.parse(req.body.items);
//     else if (Array.isArray(req.body.items)) items = req.body.items;
//     else
//       throw new AppError(
//         StatusCodes.BAD_REQUEST,
//         'Items data is missing or invalid.'
//       );

//     if (items.length !== 2) {
//       throw new AppError(
//         StatusCodes.BAD_REQUEST,
//         'Items must contain exactly 2 seat types: Normal and VIP.'
//       );
//     }

//     const seatNames = items.map(i => i.seat?.trim().toLowerCase());
//     const duplicateSeat = seatNames.some(
//       (seat, index) => seatNames.indexOf(seat) !== index
//     );
//     if (duplicateSeat) {
//       throw new AppError(
//         StatusCodes.BAD_REQUEST,
//         'Duplicate seat types are not allowed.'
//       );
//     }

//     const itemFiles: any[] = uploadedFilesUpdate?.files || [];
//     const processedItems = await Promise.all(
//       items.map(async (item, index) => {
//         const file = itemFiles[index];
//         let photoUrl = item.photo || restaurant.items[index]?.photo;
//         if (file)
//           photoUrl = await s3Services.uploadSingleFileToS3(
//             file,
//             USER_UPLOADS_FOLDER
//           );

//         return {
//           ...item,
//           totalQty: Number(item.totalQty),
//           availableQty: Number(item.totalQty),
//           price: Number(item.price),
//           photo: photoUrl,
//         };
//       })
//     );

//     restaurant.items = processedItems;
//   }

//   // Update slots if provided
//   if (req.body.slots) {
//     let newSlots: ISlot[] = [];

//     if (typeof req.body.slots === 'string') {
//       newSlots = JSON.parse(req.body.slots);
//     } else if (Array.isArray(req.body.slots)) {
//       newSlots = req.body.slots;
//     }

//     const oldSlots = restaurant.slots || [];

//     const mergedSlots: ISlot[] = [];

//     //  Keep existing IDs for old slots
//     newSlots.forEach((slot, index) => {
//       if (oldSlots[index]) {
//         mergedSlots.push({
//           _id: oldSlots[index]._id,
//           startTime: slot.startTime,
//           endTime: slot.endTime,
//         });
//       } else {
//         mergedSlots.push({
//           startTime: slot.startTime,
//           endTime: slot.endTime,
//         } as ISlot);
//       }
//     });

//     // Assign updated slots
//     restaurant.slots = mergedSlots;
//     restaurant.availableSlots = mergedSlots; // MATCH EXACTLY
//   }

//   // Update other fields
//   const fieldsToUpdate: Partial<IRestaurant> = {
//     title: req.body.title,
//     openTime: req.body.openTime,
//     closeTime: req.body.closeTime,
//     serviceArea: req.body.serviceArea,
//     foodType: req.body.foodType,
//     // description: req.body.description,
//   };

//   Object.keys(fieldsToUpdate).forEach(key => {
//     if (fieldsToUpdate[key as keyof IRestaurant] !== undefined) {
//       (restaurant as any)[key] = fieldsToUpdate[key as keyof IRestaurant];
//     }
//   });

//   // Recalculate status
//   if (req.body.openTime && req.body.closeTime) {
//     restaurant.status = isRestaurantOpen(
//       restaurant.openTime,
//       restaurant.closeTime
//     )
//       ? 'Open'
//       : 'Closed';
//   }

//   const updatedRestaurant = await restaurant.save();
//   return updatedRestaurant;
// };

export const updateRestaurantIntoDB = async (req: Request) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;
  console.log('get all form data :', req.body);
  // Check if restaurant exists
  const restaurant = await Restaurant.findById(id);
  if (!restaurant)
    throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant not found.');

  // Check user
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser)
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  if (
    isExistsUser.role !== 'Provider' ||
    isExistsUser.providerType !== 'Restaurant'
  ) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to update this restaurant.',
    );
  }
  console.log('get all form data :', req.body);

  // Validate category if provided

  if (req.body.category) {
    const category = await Category.findOne({
      primaryCategoryName: 'Restaurant',
    });
    if (!category)
      throw new AppError(
        StatusCodes.NOT_FOUND,
        'Restaurant category not found.',
      );

    const subCategoryItems = category?.subCategory || [];
    const exists = subCategoryItems.some(
      (item: any) => item?._id.toString() === req.body.category,
    ) as boolean;

    if (!exists)
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid sub-category ID.');

    restaurant.category = req.body?.category;
  }

  // -----------------------
  // FILE HANDLING (updated)
  // -----------------------

  const uploadedFiles = (req as any).files as
    | { [fieldname: string]: any[] }
    | undefined;

  // Thumbnail
  const thumbnailFile = uploadedFiles?.thumbnail?.[0];
  if (thumbnailFile) {
    const thumbnailUrl = await s3Services.uploadSingleFileToS3(
      thumbnailFile,
      USER_UPLOADS_FOLDER,
    );
    restaurant.thumbnail = thumbnailUrl;
  }

  // -----------------------
  // UPDATE ITEMS (FULL FIX WITH QUANTITY CALCULATION)
  // -----------------------

  if (req.body.items) {
    let items: any[] = [];

    if (typeof req.body.items === 'string') items = JSON.parse(req.body.items);
    else if (Array.isArray(req.body.items)) items = req.body.items;
    else
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Items data is missing or invalid.',
      );

    // Duplicate seat validation
    const seatNames = items.map(i => (i.seat || '').trim().toLowerCase());
    const duplicateSeat = seatNames.some(
      (seat, index) => seat && seatNames.indexOf(seat) !== index,
    );

    if (duplicateSeat) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Duplicate seat types are not allowed.',
      );
    }

    // Build file list (supports files[], files["0"], files["1"])
    let itemFiles: any[] = [];
    if (uploadedFiles?.files) {
      if (Array.isArray(uploadedFiles.files)) {
        itemFiles = uploadedFiles.files;
      } else {
        const keys = Object.keys(uploadedFiles.files)
          .map(k => parseInt(k))
          .filter(n => !Number.isNaN(n))
          .sort((a, b) => a - b);

        itemFiles = keys.map(k => uploadedFiles.files[k][0]);
      }
    }

    const existingItems = restaurant.items ? [...restaurant.items] : [];

    // Process incoming items
    const processedIncoming = await Promise.all(
      items.map(async (item, index) => {
        const file = itemFiles[index];

        const seatNormalized = (item.seat || '')
          .toString()
          .trim()
          .toLowerCase();

        const existing = existingItems.find(
          (ei: any) =>
            (ei.seat || '').toString().trim().toLowerCase() === seatNormalized,
        );

        // ---- PHOTO ----
        let photoUrl = item.photo || (existing ? existing.photo : undefined);
        if (file) {
          photoUrl = await s3Services.uploadSingleFileToS3(
            file,
            USER_UPLOADS_FOLDER,
          );
        }

        // ---- QUANTITY CALCULATION ----
        let newTotalQty = Number(item.totalQty);
        let newAvailableQty = 0;

        if (existing) {
          const oldTotalQty = Number(existing.totalQty);
          const oldAvailableQty = Number(existing.availableQty);

          const diff = newTotalQty - oldTotalQty; // may be negative

          // Client provided availableQty?
          if (item.availableQty !== undefined && item.availableQty !== null) {
            newAvailableQty = Number(item.availableQty);
          } else {
            // Auto-adjust availableQty based on difference
            newAvailableQty = oldAvailableQty + diff;
          }

          // Never allow below 0
          if (newAvailableQty < 0) newAvailableQty = 0;
        } else {
          // New item
          newAvailableQty =
            item.availableQty !== undefined && item.availableQty !== null
              ? Number(item.availableQty)
              : newTotalQty;
        }

        const priceNum =
          item.price !== undefined
            ? Number(item.price)
            : existing
              ? existing.price
              : 0;

        const out: any = {
          seat: item.seat,
          photo: photoUrl,
          totalQty: newTotalQty,
          availableQty: newAvailableQty,
          price: priceNum,
          description:
            item.description ?? (existing ? existing.description : ''),
        };

        // if (existing && existing?._id) {
        //   out?._id = existing?._id; // preserve
        // }
        if (existing && existing._id) {
          out._id = existing._id;
        } else if (item._id) {
          out._id = item._id;
        }

        return out;
      }),
    );

    // ------------- MERGE -------------
    const mergedMap: Map<string, any> = new Map();

    existingItems.forEach((ei: any) => {
      const key = ei._id
        ? ei._id.toString()
        : (ei.seat || '').toString().trim().toLowerCase();
      mergedMap.set(key, ei);
    });

    processedIncoming.forEach(pi => {
      if (pi._id) {
        mergedMap.set(pi._id.toString(), pi);
      } else {
        const key = (pi.seat || '').toString().trim().toLowerCase();
        if (mergedMap.has(key)) mergedMap.set(key, pi);
        else
          mergedMap.set(`${key}-${Math.random().toString(36).slice(2, 8)}`, pi);
      }
    });

    const finalItems = Array.from(mergedMap.values());

    restaurant.items = finalItems.map((it: any) => ({
      ...(it._id ? { _id: it._id } : {}),
      seat: it.seat,
      photo: it.photo,
      totalQty: Number(it.totalQty),
      availableQty: Number(it.availableQty),
      price: Number(it.price),
      description: it.description ?? '',
    }));
  }

  // -----------------------
  // UPDATE SLOTS (same logic)
  // -----------------------

  // if (req.body.slots) {
  //   let newSlots: ISlot[] = [];

  //   if (typeof req.body.slots === 'string') {
  //     newSlots = JSON.parse(req.body.slots);
  //   } else if (Array.isArray(req.body.slots)) {
  //     newSlots = req.body.slots;
  //   }

  //   const oldSlots = restaurant.slots || [];
  //   const oldAvailableSlots = restaurant.availableSlots || [];

  //   const mergedSlots: any[] = [];

  //   // 1️⃣ Merge slots with preservation of existing _id
  //   newSlots.forEach(slot => {
  //     if (slot._id) {
  //       mergedSlots.push({
  //         _id: slot._id,
  //         startTime: slot.startTime,
  //         endTime: slot.endTime,
  //       });
  //     } else {
  //       mergedSlots.push({
  //         _id: new mongoose.Types.ObjectId(),
  //         startTime: slot.startTime,
  //         endTime: slot.endTime,
  //       });
  //     }
  //   });

  //   restaurant.slots = mergedSlots;

  //   const oldAvailableMap = new Map(
  //     oldAvailableSlots.map(s => [s._id?.toString(), s]),
  //   );

  //   const newAvailableSlots: any[] = [];

  //   mergedSlots.forEach(slot => {
  //     const slotId = slot._id.toString();

  //     if (oldAvailableMap.has(slotId)) {
  //       newAvailableSlots.push(oldAvailableMap.get(slotId));
  //     } else {
  //       newAvailableSlots.push({
  //         _id: slot._id,
  //         startTime: slot.startTime,
  //         endTime: slot.endTime,
  //       });
  //     }
  //   });

  //   restaurant.availableSlots = newAvailableSlots;
  // }

  // -----------------------
  // UPDATE SLOTS (FIXED)
  // -----------------------

  // -----------------------
  // UPDATE SLOTS (PATCH STYLE ✅)
  // -----------------------

  // -----------------------
  // UPDATE SLOTS (FINAL FIX)
  // -----------------------

  if (req.body.slots) {
    let incomingSlots: any[] = [];

    // ✅ Parse input
    if (typeof req.body.slots === 'string') {
      incomingSlots = JSON.parse(req.body.slots);
    } else if (Array.isArray(req.body.slots)) {
      incomingSlots = req.body.slots;
    }

    // ✅ Remove empty items (VERY IMPORTANT for your case)
    incomingSlots = incomingSlots
      .filter((slot: any) => slot && (slot.startTime || slot.endTime))
      .map((slot: any) => ({
        _id: slot._id?.toString(),
        startTime: slot.startTime,
        endTime: slot.endTime,
      }));

    const existingSlots = restaurant.slots || [];

    const existingMap = new Map(
      existingSlots.map((s: any) => [s._id.toString(), s]),
    );

    // 🔁 PATCH behavior (update + create, no delete)
    for (const slot of incomingSlots) {
      if (!slot) continue;

      if (slot._id && existingMap.has(slot._id)) {
        // ✅ UPDATE EXISTING SLOT
        const existing = existingMap.get(slot._id);

        if (slot.startTime !== undefined) {
          existing.startTime = slot.startTime;
        }
        if (slot.endTime !== undefined) {
          existing.endTime = slot.endTime;
        }

        // 🔁 sync availableSlots
        const available = (restaurant.availableSlots || []).find(
          (a: any) => a._id.toString() === slot._id,
        );

        if (available) {
          available.startTime = existing.startTime;
          available.endTime = existing.endTime;
        }
      } else {
        // 🆕 CREATE NEW SLOT
        const newId = new mongoose.Types.ObjectId();

        const newSlot = {
          _id: newId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        };

        restaurant.slots.push(newSlot);

        if (!restaurant.availableSlots) {
          restaurant.availableSlots = [];
        }

        restaurant.availableSlots.push({
          _id: newId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
      }
    }
  }
  // -----------------------
  // UPDATE OTHER FIELDS
  // -----------------------

  const fieldsToUpdate: Partial<IRestaurant> = {
    title: req.body.title,
    openTime: req.body.openTime,
    closeTime: req.body.closeTime,
    serviceArea: req.body.serviceArea,
    foodType: req.body.foodType,
  };

  Object.keys(fieldsToUpdate).forEach(key => {
    if (fieldsToUpdate[key as keyof IRestaurant] !== undefined) {
      (restaurant as any)[key] = fieldsToUpdate[key as keyof IRestaurant];
    }
  });

  // Recalculate status
  if (req.body.openTime && req.body.closeTime) {
    restaurant.status = isRestaurantOpen(
      restaurant.openTime,
      restaurant.closeTime,
    )
      ? 'Open'
      : 'Closed';
  }

  const updatedRestaurant = await restaurant.save();
  return updatedRestaurant;
};

const deleteRestaurantIntoDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.',
    );
  }

  const restaurant = await Restaurant.findById(id);
  if (!restaurant) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant not found.');
  }

  if (restaurant?.owner.toString() !== isExistsUser?._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to delete this restaurant.',
    );
  }

  const result = await Restaurant.findByIdAndDelete(id);
  return result;
};

const updateServiceFee = async (payload: any) => {
  const { serviceFee } = payload;
  const result = await Restaurant.updateMany({}, { $set: { serviceFee } });
  return result;
};

export const RestaurantService = {
  getAllRestaurantFromDB,
  getAllMyRestaurantFromDB,
  addRestaurantIntoDB,
  reviewRestaurant,
  getSingleRestaurantFromDB,
  updateRestaurantIntoDB,
  deleteRestaurantIntoDB,
  updateServiceFee,
};
