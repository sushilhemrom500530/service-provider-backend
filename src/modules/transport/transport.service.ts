import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { Request, Response, Express } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import { User } from './../user/user.model';
import AppError from './../../errors/AppErro';
import { s3Services } from './../../aws/s3Service';
import { IReview } from './../common/common.interface';
import { Transport } from './transport.model';
import { USER_UPLOADS_FOLDER } from './transport.constant';
import { Category } from './../category/category.model';



const getAllTransportFromDB = async (user: JwtPayload, query: any) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  // Pagination
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  // filter
  const search = query.search
    ? { title: { $regex: query.search, $options: "i" } }
    : {};

  // Category filter
  let categoryFilter = {};
  if (query.category) {
    const categories = await Category.find(
      {
        primaryCategoryName: "Transport",
        "subCategory.name": { $regex: query.category, $options: "i" },
      },
      { "subCategory.$": 1 }
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

  // Total count after filters
  const total = await Transport.countDocuments(filters);

  // Fetch paginated data
  const transportList = await Transport.find(filters)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  // Attach category data (your original logic)
  const result = await Promise.all(
    transportList.map(async (item) => {
      const categoryDoc = await Category.findOne(
        {
          primaryCategoryName: "Transport",
          "subCategory._id": item.category,
        },
        { "subCategory.$": 1 }
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


const getAllMyTransportFromDB = async (user: JwtPayload, query: any) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  // Pagination
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const skip = (page - 1) * limit;

  // filter
  const search = query.search
    ? { title: { $regex: query.search, $options: "i" } }
    : {};

  // Category filter
  let categoryFilter = {};
  if (query.category) {
    const categories = await Category.find(
      {
        primaryCategoryName: "Transport",
        "subCategory.name": { $regex: query.category, $options: "i" },
      },
      { "subCategory.$": 1 }
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

  // Total count after filters
  const total = await Transport.countDocuments(filters);

  // Fetch paginated data
  const transportList = await Transport.find(filters)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  // Attach category data (your original logic)
  const result = await Promise.all(
    transportList.map(async (item) => {
      const categoryDoc = await Category.findOne(
        {
          primaryCategoryName: "Transport",
          "subCategory._id": item.category,
        },
        { "subCategory.$": 1 }
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


const getSingleTransportFromDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }
  const transport = await Transport.findById(id).populate({
    path: 'owner',
    select: '-isDeleted -agreeTermsCondition -__v -createdAt -updatedAt',
  });

  if (!transport)
    throw new AppError(StatusCodes.NOT_FOUND, 'Transport not found.');

  // manually populate subcategory
  const categoryDoc = await Category.findOne(
    {
      primaryCategoryName: 'Transport',
      'subCategory._id': transport?.category,
    },
    { 'subCategory.$': 1 }
  );

  const subCategoryData = categoryDoc?.subCategory?.[0] || null;

  return {
    ...transport.toObject(),
    category: subCategoryData,
  };
};

const addTransportIntoDB = async (req: Request) => {
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
      'You are not authorized to create a trasport service.'
    );
  }

  // Now we know user is a Provider — check providerType
  if (isExistsUser?.providerType !== 'Transport') {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only providers with providerType : Transport can create a transport service.'
    );
  }

  const category = await Category.findOne({
    primaryCategoryName: 'Transport',
  });
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Transport Brand not found.');
  }

  const subCategoryItems = category?.subCategory || [];

  const exists = subCategoryItems.some(
    (item : any) => item?._id.toString() === req.body?.category.toString()
  );

  if (!exists) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Invalid sub-category brand ID for Transport.'
    );
  }

  if (req.file) {
    const fileUrl = await s3Services.uploadSingleFileToS3(
      req.file,
      USER_UPLOADS_FOLDER
    );
    req.body.thumbnail = fileUrl;
  } else {
    throw new Error('File not found');
  }

  // Prepare transport data
  const transportData = {
    ...req.body,
    owner: isExistsUser?._id,
  };

  transportData.amount = Number(transportData?.amount || 0);
  transportData.personCount = Number(transportData?.personCount || 0);

  const result = await Transport.create(transportData);
  return result;
};

export const reviewTransport = async (
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
  const transport = await Transport.findById(id);
  if (!transport) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Transport not found');
  }

  //  (Optional) Prevent duplicate reviews by the same user
  const alreadyReviewed = transport?.reviews.some(
    (review :any) => review?.userId.toString() === isExistsUser._id.toString()
  ) as boolean;
  if (alreadyReviewed) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'You have already reviewed this transport.'
    );
  }

  // Push new review
  const newReview = {
    userId: isExistsUser!._id,
    rating: payload?.rating,
    comment: payload?.comment,
    createdAt: new Date(),
  } as IReview || {};

  transport.reviews.push(newReview as IReview);

  // Recalculate average rating
  const total = transport?.reviews.reduce((sum :number, r:any) => sum + r.rating, 0);
  transport.averageRating = parseFloat(
    (total / transport?.reviews.length || 0).toFixed(1)
  );

  // Save updated transport
  await transport.save();

  return transport;
};

const updateTransportIntoDB = async (req: Request) => {
  const id = req?.params?.id;
  const user = req?.user as JwtPayload;

  const isExistsTransport = await Transport.findById(id);

  if (!isExistsTransport) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Transport not found.');
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
    const category = await Category.findOne({
      primaryCategoryName: 'Transport',
    });
    if (!category) {
      throw new AppError(
        StatusCodes.NOT_FOUND,
        'Transport brand category not found.'
      );
    }

    const subCategoryItems = category?.subCategory || [];

    const brandExists = subCategoryItems.some(
      ( item :any) => item?._id.toString() === req.body?.category.toString()
    );

    if (!brandExists) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Invalid sub-category brand ID for Transport.'
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

  const updateData: Partial<any> = { ...req.body };

  if (updateData?.amount !== undefined) {
    updateData.amount = Number(updateData.amount);
  }
  if (updateData?.personCount !== undefined) {
    updateData.personCount = Number(updateData.personCount);
  }

  const result = await Transport.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true }
  );

  return result;
};

const deleteTransportIntoDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const transport = await Transport.findById(id);
  if (!transport) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Transport not found.');
  }

  if (transport?.owner.toString() !== isExistsUser?._id.toString()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You are not authorized to delete this transport.'
    );
  }

  const result = await Transport.findByIdAndDelete(id);
  return result;
};

export const TransportService = {
  getAllTransportFromDB,
  getAllMyTransportFromDB,
  addTransportIntoDB,
  reviewTransport,
  getSingleTransportFromDB,
  updateTransportIntoDB,
  deleteTransportIntoDB,
};
