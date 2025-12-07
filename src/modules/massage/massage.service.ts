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

const getAllMassageFromDB = async (user: JwtPayload, query: any) => {
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
        primaryCategoryName: 'Massage',
        'subCategory.name': { $regex: query.category, $options: 'i' },
      },
      { 'subCategory.$': 1 }
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

  // Total count
  const total = await Massage.countDocuments(filters);

  // Paginated items
  const massageList = await Massage.find(filters)
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'owner',
      select: '-isDeleted -agreeTermsCondition -__v -createdAt -updatedAt',
    })
    .sort({ createdAt: -1 });

  // Attach category (your original logic)
  const result = await Promise.all(
    massageList.map(async item => {
      const categoryDoc = await Category.findOne(
        {
          primaryCategoryName: 'Massage',
          'subCategory._id': item.category,
        },
        { 'subCategory.$': 1 }
      );

      return {
        ...item.toObject(),
        category: categoryDoc?.subCategory?.[0] || null,
      };
    })
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

const getAllMyMassageFromDB = async (user: JwtPayload, query: any) => {
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
        primaryCategoryName: 'Massage',
        'subCategory.name': { $regex: query.category, $options: 'i' },
      },
      { 'subCategory.$': 1 }
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

  // Total count
  const total = await Massage.countDocuments(filters);

  // Paginated items
  const massageList = await Massage.find(filters)
    .skip(skip)
    .limit(limit)
    .populate({
      path: 'owner',
      select: '-isDeleted -agreeTermsCondition -__v -createdAt -updatedAt',
    })
    .sort({ createdAt: -1 });

  // Attach category (your original logic)
  const result = await Promise.all(
    massageList.map(async item => {
      const categoryDoc = await Category.findOne(
        {
          primaryCategoryName: 'Massage',
          'subCategory._id': item.category,
        },
        { 'subCategory.$': 1 }
      );

      return {
        ...item.toObject(),
        category: categoryDoc?.subCategory?.[0] || null,
      };
    })
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

const getSingleMassageFromDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }
  const massage = await Massage.findById(id)
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

  if (!massage)
    throw new AppError(StatusCodes.NOT_FOUND, 'Massage data not found.');

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
  // const exists = subCategoryItems.some(
  //   item => item?._id.toString() === req.body?.category.toString()
  const exists = subCategoryItems.some(item =>
    item?._id ? item._id.toString() === req.body?.category?.toString() : false
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
    throw new AppError(StatusCodes.NOT_FOUND, 'Massage data not found');
  }

  //  (Optional) Prevent duplicate reviews by the same user
  const alreadyReviewed =
    massage.reviews?.some(
      review => review.userId.toString() === isExistsUser._id.toString()
    ) || false;

  if (alreadyReviewed) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'You have already reviewed this massage.'
    );
  }

  // Push new review
  const newReview = {
    userId: isExistsUser!._id,
    rating: payload?.rating,
    comment: payload?.comment,
    createdAt: new Date(),
  } as IReview;

  // massage.reviews.push(newReview as IReview);
  if (!Array.isArray(massage.reviews)) {
    massage.reviews = [];
  }

  massage.reviews.push(newReview);

  // total balance
  // const total = massage?.reviews.reduce((sum: number, r: IReview) => sum + r?.
  // rating, 0);
  const total = massage.reviews.reduce(
    (sum: number, r: IReview) => sum + (r?.rating || 0),
    0
  );

  // Recalculate average rating
  massage.averageRating = parseFloat(
    (total / (massage.reviews.length || 1)).toFixed(1)
  );

  // Save updated massage
  await massage.save();

  return massage;
};

const updateMassageIntoDB = async (req: Request) => {
  const id = req.params.id;
  const user = req.user as JwtPayload;

  // Find existing massage
  const existingMassage = await Massage.findById(id);
  if (!existingMassage) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Massage data not found.');
  }

  // Check user
  const existsUser = await User.findById(user?.userId);
  if (!existsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  // Handle category validation
  if (req.body?.category) {
    const category = await Category.findOne({ primaryCategoryName: 'Massage' });
    if (!category) {
      throw new AppError(StatusCodes.NOT_FOUND, 'Massage category not found.');
    }

    const subCategoryItems = category.subCategory || [];
    const isValidSubCategory = subCategoryItems.some(
      item => item?._id.toString() === req.body.category?.toString()
    );

    if (!isValidSubCategory) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Invalid sub-category ID for Massage.'
      );
    }
  }

  // Handle thumbnail upload
  if (req.file) {
    const fileUrl = await s3Services.uploadSingleFileToS3(
      req.file,
      USER_UPLOADS_FOLDER
    );
    req.body.thumbnail = fileUrl;
  }

  // console.log('req.body from here :', req.body);

  // Handle priceByDuration safely (preserve _id for existing items)
  if (req.body?.priceByDuration) {
    const existingPrices = existingMassage.priceByDuration.map(p =>
      p.toObject()
    ); // existing items
    const incomingPrices = req.body.priceByDuration;

    const mergedPrices: typeof existingPrices = [];

    incomingPrices.forEach((item: any, index: number) => {
      if (item._id) {
        // Existing item: update by _id
        const existingItem = existingPrices.find(
          p => p._id.toString() === item._id
        );
        if (existingItem) {
          mergedPrices.push({
            _id: existingItem._id,
            duration: item.duration,
            amount: item.amount,
          });
        } else {
          // _id provided but not found in DB, treat as new
          mergedPrices.push(item);
        }
      } else {
        // No _id: if index exists in DB, keep existing _id
        if (existingPrices[index]) {
          mergedPrices.push({
            _id: existingPrices[index]._id,
            duration: item.duration,
            amount: item.amount,
          });
        } else {
          // New item, Mongoose will generate _id
          mergedPrices.push(item);
        }
      }
    });

    // Keep other existing items untouched (not in incoming array)
    const incomingIds = mergedPrices
      .map(p => p._id?.toString())
      .filter(Boolean);
    const untouchedOld = existingPrices.filter(
      p => !incomingIds.includes(p._id?.toString())
    );

    req.body.priceByDuration = [...mergedPrices]; // untouchedOld (when want to add previous price duration)
  }

  // Update massage
  const updateData = req.body;
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
    throw new AppError(StatusCodes.NOT_FOUND, 'Massage data not found.');
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
  getAllMyMassageFromDB,
  addMassageIntoDB,
  reviewMassage,
  getSingleMassageFromDB,
  updateMassageIntoDB,
  deleteMassageIntoDB,
};
