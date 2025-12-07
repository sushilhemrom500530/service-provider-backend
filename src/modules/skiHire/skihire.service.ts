import mongoose, { Types } from 'mongoose';
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

const getAllSkiHireFromDB = async (user: JwtPayload, query: any) => {
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
        primaryCategoryName: 'Ski_Hire',
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
  const total = await SkiHire.countDocuments(filters);

  // Fetch paginated data
  const skiHireList = await SkiHire.find(filters)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .populate({
      path: 'owner',
      select: '-isDeleted -agreeTermsCondition -__v -createdAt -updatedAt',
    });

  // Attach matched category (your original logic)
  const result = await Promise.all(
    skiHireList.map(async item => {
      const categoryDoc = await Category.findOne(
        { primaryCategoryName: 'Ski_Hire', 'subCategory._id': item.category },
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

const getAllMySkiHireFromDB = async (user: JwtPayload, query: any) => {
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
        primaryCategoryName: 'Ski_Hire',
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
  const total = await SkiHire.countDocuments(filters);

  // Fetch paginated data
  const skiHireList = await SkiHire.find(filters)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .populate({
      path: 'owner',
      select: '-isDeleted -agreeTermsCondition -__v -createdAt -updatedAt',
    });

  // Attach matched category (your original logic)
  const result = await Promise.all(
    skiHireList.map(async item => {
      const categoryDoc = await Category.findOne(
        { primaryCategoryName: 'Ski_Hire', 'subCategory._id': item.category },
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

const getSingleSkiHireFromDB = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const skiHire = await SkiHire.findById(id)
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
  if (!skiHire)
    throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire data not found.');

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

// const addSkiHireIntoDB = async (req: Request) => {
//   const user = req.user as JwtPayload;
//   const { category: categoryId } = req.body;

//   // check user
//   const isExistsUser = await User.findOne({ email: user?.email });
//   if (!isExistsUser) {
//     throw new AppError(
//       StatusCodes.NOT_FOUND,
//       'You cannot view this data because your account was not found.'
//     );
//   }

//   // Validate provider role and type
//   if (isExistsUser?.role !== 'Provider') {
//     throw new AppError(
//       StatusCodes.FORBIDDEN,
//       'You are not authorized to create a ski hire service.'
//     );
//   }

//   // Now we know user is a Provider — check providerType
//   if (isExistsUser?.providerType !== 'Ski_Hire') {
//     throw new AppError(
//       StatusCodes.FORBIDDEN,
//       'Only providers with providerType : SkiHire can create a ski hire service.'
//     );
//   }

//   const category = await Category.findOne({ primaryCategoryName: 'Ski_Hire' });
//   if (!category) {
//     throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire category not found.');
//   }

//   const subCategoryItems = category?.subCategory || [];

//   const exists = subCategoryItems.some(
//     (item: any) => item?._id?.toString() === categoryId?.toString()
//   );

//   if (!exists) {
//     throw new AppError(
//       StatusCodes.BAD_REQUEST,
//       'Invalid sub-category ID for Ski Hire.'
//     );
//   }

//   const uploadedFiles = (req as any).files as
//     | { [fieldname: string]: any[] }
//     | undefined;

//   const thumbnailFile: any = uploadedFiles?.thumbnail?.[0];
//   if (!thumbnailFile) {
//     throw new AppError(StatusCodes.BAD_REQUEST, 'Thumbnail file not found.');
//   }

//   const thumbnailUrl = await s3Services.uploadSingleFileToS3(
//     thumbnailFile,
//     USER_UPLOADS_FOLDER
//   );

//   // Parse product items
//   let productItems: any[] = [];

//   if (typeof req.body.productItems === 'string') {
//     productItems = JSON.parse(req.body.productItems);
//   } else if (Array.isArray(req.body.productItems)) {
//     productItems = req.body.productItems;
//   } else {
//     throw new AppError(
//       StatusCodes.BAD_REQUEST,
//       'Product items data is missing or invalid.'
//     );
//   }

//   //  Upload product item images
//   const productItemFiles: any[] = uploadedFiles?.images || [];

//   const processedProductItems = await Promise.all(
//     productItems.map(async (item: any, index: number) => {
//       const productFile = productItemFiles[index];
//       if (!productFile) {
//         throw new AppError(
//           StatusCodes.BAD_REQUEST,
//           `Product image for item "${item?.productName}" is missing.`
//         );
//       }

//       const productPhotoUrl = await s3Services.uploadSingleFileToS3(
//         productFile,
//         USER_UPLOADS_FOLDER
//       );

//       return {
//         productName: item?.productName,
//         productPhoto: productPhotoUrl,
//         price: Number(item.price),
//         totalQty: Number(item.quantity),
//         availableQty: Number(item.quantity),
//       };
//     })
//   );

//   const totalPrice = processedProductItems.reduce(
//     (sum: number, item: any) => sum + item?.price,
//     0
//   );

//   const skiHireData = {
//     category: categoryId || req.body.category,
//     title: req.body.title,
//     thumbnail: thumbnailUrl,
//     owner: isExistsUser?._id,
//     extraChargePerHour: Number(req.body.extraChargePerHour || 0) || 0,
//     totalPrice,
//     serviceArea: req.body.serviceArea,
//     items: processedProductItems,
//   };

//   const result = await SkiHire.create(skiHireData);
//   return result;
// };

const addSkiHireIntoDB = async (req: Request) => {
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

  if (isExistsUser?.providerType !== 'Ski_Hire') {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only providers with providerType : SkiHire can create a ski hire service.'
    );
  }

  // Validate category
  const category = await Category.findOne({ primaryCategoryName: 'Ski_Hire' });
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire category not found.');
  }

  const exists = category.subCategory.some(
    (item: any) => item?._id?.toString() === categoryId?.toString()
  );

  if (!exists) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Invalid sub-category ID for Ski Hire.'
    );
  }

  // Uploaded files
  const uploadedFiles = (req as any).files as
    | { [fieldname: string]: any[] }
    | undefined;

  // Thumbnail file
  const thumbnailFile = uploadedFiles?.thumbnail?.[0];
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

  // ============================================================
  //  FIX: SUPPORT files[0], files[1] OR multiple selection
  // ============================================================

  let productItemFiles: any[] = [];

  if (uploadedFiles?.files) {
    if (Array.isArray(uploadedFiles.files)) {
      // Normal multi-file upload
      productItemFiles = uploadedFiles.files;
    } else {
      // Convert index-like keys ('0', '1') into sorted array
      const keys = Object.keys(uploadedFiles.files)
        .map(k => parseInt(k))
        .sort((a, b) => a - b);

      productItemFiles = keys.map(k => uploadedFiles.files[k][0]);
    }
  }

  // ============================================================

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
        productName: item.productName,
        productPhoto: productPhotoUrl,
        price: Number(item.price),
        totalQty: Number(item.quantity),
        availableQty: Number(item.quantity),
      };
    })
  );

  const totalPrice = processedProductItems.reduce(
    (sum: number, item: any) => sum + Number(item?.price),
    0
  );

  const skiHireData = {
    category: categoryId,
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

const reviewSkiHire = async (
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
    throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire data not found');
  }

  //  (Optional) Prevent duplicate reviews by the same user
  const alreadyReviewed =
    skiHire.reviews?.some(
      review => review.userId.toString() === isExistsUser._id.toString()
    ) || false;
  if (alreadyReviewed) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'You have already reviewed this skiHire.'
    );
  }

  // Push new review
  const newReview = {
    userId: isExistsUser!._id,
    rating: payload?.rating,
    comment: payload?.comment,
    createdAt: new Date(),
  };

  if (!Array.isArray(skiHire.reviews)) {
    skiHire.reviews = [];
  }

  skiHire.reviews.push(newReview as IReview);

  // Recalculate average rating
  const total: number = skiHire.reviews.reduce(
    (sum: number, r: IReview) => sum + (r.rating || 0),
    0
  );
  skiHire.averageRating = skiHire.reviews.length
    ? parseFloat((total / skiHire.reviews.length).toFixed(1))
    : 0;

  // Save updated skiHire
  await skiHire.save();

  return skiHire;
};

// const updateSkiHireIntoDB = async (req: Request) => {
//   const id = req?.params?.id;
//   const user = req.user as JwtPayload;

//   // Check if ski hire exists
//   const isExistsSkiHire = await SkiHire.findById(id);
//   if (!isExistsSkiHire) {
//     throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire data not found.');
//   }

//   // Verify user
//   const isExistsUser = await User.findOne({ email: user?.email });
//   if (!isExistsUser) {
//     throw new AppError(
//       StatusCodes.NOT_FOUND,
//       'You cannot view this data because your account was not found.'
//     );
//   }

//   // Check provider role & type
//   if (
//     isExistsUser?.role !== 'Provider' ||
//     isExistsUser?.providerType !== 'Ski_Hire'
//   ) {
//     throw new AppError(
//       StatusCodes.FORBIDDEN,
//       'You are not authorized to update this ski hire service.'
//     );
//   }

//   const uploadedFilesUpdate = (req as any).files as
//     | { [fieldname: string]: any[] }
//     | undefined;

//   if (uploadedFilesUpdate?.thumbnail?.[0]) {
//     const thumbnailFile: any = uploadedFilesUpdate.thumbnail[0];
//     const thumbnailUrl = await s3Services.uploadSingleFileToS3(
//       thumbnailFile,
//       USER_UPLOADS_FOLDER
//     );
//     req.body.thumbnail = thumbnailUrl;
//   }

//   // Update product items if provided
//   if (req.body.productItems) {
//     let productItems: any[] = [];
//     if (typeof req.body?.productItems === 'string') {
//       productItems = JSON.parse(req.body?.productItems);
//     } else if (Array.isArray(req.body?.productItems)) {
//       productItems = req.body?.productItems;
//     } else {
//       throw new AppError(
//         StatusCodes.BAD_REQUEST,
//         'Product items data is invalid.'
//       );
//     }

//     const existingLength = isExistsSkiHire.items.length;

//     if (productItems.length !== existingLength) {
//       throw new AppError(
//         StatusCodes.BAD_REQUEST,
//         `Product items length must match existing length (${existingLength}).`
//       );
//     }

//     const productItemFiles: any[] = uploadedFilesUpdate?.images || [];

//     const processedProductItems = await Promise.all(
//       productItems.map(async (item: any, index: number) => {
//         // Preserve existing photo if exists
//         let productPhoto = item?.productPhoto || '';

//         // Only try to match uploaded file if _id exists
//         let productFile;
//         if (item._id) {
//           productFile = productItemFiles.find(
//             (file: any) => file.fieldname === item?._id.toString()
//           );
//         } else {
//           // fallback: use index to match new products
//           productFile = productItemFiles[index];
//         }

//         if (productFile) {
//           productPhoto = await s3Services.uploadSingleFileToS3(
//             productFile,
//             USER_UPLOADS_FOLDER
//           );
//         }

//         return {
//           _id: item._id, // may be undefined for new products
//           productName: item.productName,
//           productPhoto,
//           price: Number(item.price),
//           totalQty: Number(item.quantity),
//           availableQty: Number(item.quantity),
//         };
//       })
//     );

//     req.body.items = processedProductItems;

//     req.body.totalPrice = processedProductItems.reduce(
//       (sum: number, item: any) => sum + item.price,
//       0
//     );
//   }

//   const result = await SkiHire.findByIdAndUpdate(
//     id,
//     {
//       ...req.body,
//     },
//     { new: true }
//   );

//   return result;
// };

export const updateSkiHireIntoDB = async (req: Request) => {
  const id = req?.params?.id;
  const user = req.user as JwtPayload;

  // Check if ski hire exists
  const isExistsSkiHire = await SkiHire.findById(id);
  if (!isExistsSkiHire) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire data not found.');
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

  const uploadedFilesUpdate = (req as any).files as
    | { [fieldname: string]: any[] }
    | undefined;

  // ------------------------------
  // Update Thumbnail (if uploaded)
  // ------------------------------
  if (uploadedFilesUpdate?.thumbnail?.[0]) {
    const thumbnailFile = uploadedFilesUpdate.thumbnail[0];
    const thumbnailUrl = await s3Services.uploadSingleFileToS3(
      thumbnailFile,
      USER_UPLOADS_FOLDER
    );
    req.body.thumbnail = thumbnailUrl;
  }

  // ------------------------------
  // Update Product Items
  // ------------------------------
  if (req.body.productItems) {
    let productItems: any[] = [];

    if (typeof req.body.productItems === 'string') {
      productItems = JSON.parse(req.body.productItems);
    } else if (Array.isArray(req.body.productItems)) {
      productItems = req.body.productItems;
    } else {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Product items data is invalid.'
      );
    }

    // validation items length match

    // const existingLength = isExistsSkiHire.items.length;

    // if (productItems.length !== existingLength) {
    //   throw new AppError(
    //     StatusCodes.BAD_REQUEST,
    //     `Product items length must match existing length (${existingLength}).`
    //   );
    // }

    // ============================================================
    // FIXED: Support files[0], files[1], files[2]
    // ============================================================
    let productItemFiles: any[] = [];

    if (uploadedFilesUpdate?.files) {
      if (Array.isArray(uploadedFilesUpdate.files)) {
        // Multi-select files → array directly
        productItemFiles = uploadedFilesUpdate.files;
      } else {
        // Convert keys ("0", "1") → sorted numeric array
        const keys = Object.keys(uploadedFilesUpdate.files)
          .map(k => parseInt(k))
          .sort((a, b) => a - b);

        productItemFiles = keys.map(k => uploadedFilesUpdate.files[k][0]);
      }
    }

    // ============================================================

    const processedProductItems = await Promise.all(
      productItems.map(async (item: any, index: number) => {
        // Preserve existing photo
        let productPhoto = item?.productPhoto || '';

        // Try to match uploaded file by index
        let productFile = productItemFiles[index];

        // Upload new file if exists
        if (productFile) {
          productPhoto = await s3Services.uploadSingleFileToS3(
            productFile,
            USER_UPLOADS_FOLDER
          );
        }

        return {
          _id: item._id,
          productName: item.productName,
          productPhoto,
          price: Number(item.price),
          totalQty: Number(item.quantity),
          availableQty: Number(item.quantity),
        };
      })
    );

    req.body.items = processedProductItems;

    req.body.totalPrice = processedProductItems.reduce(
      (sum: number, item: any) => sum + item.price,
      0
    );
  }

  // ------------------------------
  // Final Update Query
  // ------------------------------
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
    throw new AppError(StatusCodes.NOT_FOUND, 'Ski Hire data not found.');
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
  getAllMySkiHireFromDB,
  getSingleSkiHireFromDB,
  addSkiHireIntoDB,
  reviewSkiHire,
  updateSkiHireIntoDB,
  deleteSkiHireIntoDB,
};
