import { Types } from 'mongoose';
import AppError from '../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import { JwtPayload } from 'jsonwebtoken';
import { Category } from './category.model';
import { ICategory, ISubCategory } from './category.interface';
import { USER_UPLOADS_FOLDER } from './category.constant';

const getAllCategories = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const result = await Category.find({});
  return result;
};

const getCategoryById = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }
  const result = await Category.findById(id);

  if (!result) {
    return {
      message: ` This massage id's ${id} data not found.`,
    };
  }

  return [];
};


const createCategory = async (req: Request) => {
  const user = req.user as JwtPayload;

  // check user
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const { primaryCategoryName } = req.body;

  // Normalize uploaded files structure
  const uploadedFiles = (req as any).files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const thumbnailFile = uploadedFiles?.thumbnail?.[0];
  if (!thumbnailFile) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Thumbnail image is required.'
    );
  }

  const thumbnailUrl = await s3Services.uploadSingleFileToS3(
    thumbnailFile,
    USER_UPLOADS_FOLDER
  );

  if (primaryCategoryName === "Ski_Pass") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'The "Ski_Pass" category cannot be created or updated.'
    );
  }
  const category = await Category.findOne({ primaryCategoryName });
  if (category) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Category with this name already exists.'
    );
  }

  let subCategory: ISubCategory[] = [];

  if (typeof req.body?.subCategory === 'string') {
    try {
      subCategory = JSON.parse(req.body.subCategory);
    } catch {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Invalid subCategory format. Must be valid JSON.'
      );
    }
  } else if (Array.isArray(req.body?.subCategory)) {
    subCategory = req.body.subCategory;
  }

  //  Upload subCategory images if any
  const subCategoryFiles = uploadedFiles?.files || [];
  let processedSubCategory: any[] = [];

  if (subCategory.length > 0) {
    processedSubCategory = await Promise.all(
      subCategory.map(async (item, index) => {
        const subFile = subCategoryFiles[index];
        if (!subFile) {
          throw new AppError(
            StatusCodes.BAD_REQUEST,
            `Subcategory image for "${item?.name}" is missing.`
          );
        }

        const subCategoryPhotoUrl = await s3Services.uploadSingleFileToS3(
          subFile,
          USER_UPLOADS_FOLDER
        );

        return {
          name: item.name,
          categoryPhoto: subCategoryPhotoUrl,
        };
      })
    );
  }

  // Create category with or without subCategory
  const categoryData: any = {
    primaryCategoryName,
    thumbnail: thumbnailUrl,
  };

  if (processedSubCategory.length > 0) {
    categoryData.subCategory = processedSubCategory;
  }

  const result = await Category.create(categoryData);
  return result;
};


const addSubCategory = async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;

  const isExistsUser = await User.findOne({ email: user?.email, role: 'Admin' });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot create this data because your account was not found.'
    );
  }

  const categoryId = req.params.id;

  
  const isExistsCategory = await Category.findById(categoryId);
  if (!isExistsCategory) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Category not found.');
  }
   if(isExistsCategory.primaryCategoryName === "Ski_Pass"){
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'The "Ski_Pass" category cannot be created or updated.'
    );
   }

  let subCategory: ISubCategory[] = [];
  
  if (req.body.subCategory) {
    if (typeof req.body.subCategory === 'string') {
      try {
        subCategory = JSON.parse(req.body.subCategory);
        if (!Array.isArray(subCategory)) subCategory = [];
      } catch {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'Invalid subCategory format. Must be valid JSON.'
        );
      }
    } else if (Array.isArray(req.body.subCategory)) {
      subCategory = req.body.subCategory;
    }
  }

  
  if (subCategory.length === 0) {
    return res.status(StatusCodes.OK).json({
      success: true,
      message: 'No subcategories to add',
      data: isExistsCategory,
    });
  }

  
  const uploadedFiles = (req as any).files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  const subCategoryFiles = uploadedFiles?.files || [];
  if (subCategoryFiles.length > 0 && subCategory.length !== subCategoryFiles.length) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Number of subCategory items must match number of uploaded files.'
    );
  }

  
  const processedSubCategory: ISubCategory[] = await Promise.all(
    subCategory.map(async (item, index) => {
      const subFile = subCategoryFiles[index];
      const categoryPhoto = subFile
        ? await s3Services.uploadSingleFileToS3(subFile, USER_UPLOADS_FOLDER)
        : item.categoryPhoto || ''; // fallback to empty string if not provided

      return {
        name: item.name,
        categoryPhoto,
      };
    })
  );

  
  const result = await Category.findByIdAndUpdate(
    categoryId,
    {
      $push: { subCategory: { $each: processedSubCategory } },
    },
    { new: true }
  );
  return result;
};

const updateCategory = async (req: Request, id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email, role: 'Admin' });
  if (!isExistsUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Admin user not found.');
  }
  
  const isExistsCategory = await Category.findById(id);
  if (!isExistsCategory) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Category not found.');
  }

  const { primaryCategoryName } = req.body;

  
  let thumbnailUrl = isExistsCategory.thumbnail;
  const uploadedFiles2 = (req as any).files as
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;
  const thumbnailFile = uploadedFiles2?.thumbnail?.[0];
  if (thumbnailFile) {
    thumbnailUrl = await s3Services.uploadSingleFileToS3(thumbnailFile, USER_UPLOADS_FOLDER);
  }

  
  let subCategory: ISubCategory[] = [];
  if (typeof req.body?.subCategory === 'string') {
    try {
      subCategory = JSON.parse(req.body.subCategory);
    } catch {
      throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid subCategory JSON format.');
    }
  } else if (Array.isArray(req.body?.subCategory)) {
    subCategory = req.body.subCategory;
  } else {
    subCategory = isExistsCategory.subCategory || [];
  }

  
  const subCategoryFiles2 = uploadedFiles2?.files || [];
  const processedSubCategory = await Promise.all(
    subCategory.map(async (item, index) => {
      const subFile = subCategoryFiles2[index];
      const categoryPhoto = subFile
        ? await s3Services.uploadSingleFileToS3(subFile, USER_UPLOADS_FOLDER)
        : item.categoryPhoto;
      return { ...item, categoryPhoto };
    })
  );

  
  const result = await Category.findByIdAndUpdate(
    id,
    {
      primaryCategoryName: primaryCategoryName || isExistsCategory.primaryCategoryName,
      thumbnail: thumbnailUrl,
      subCategory: processedSubCategory,
    },
    { new: true }
  );

  return result;
};


const deleteCategory = async (
  categoryId: string,
  user: JwtPayload,
  subCategoryIds?: string[]
) => {
  const isExistsUser = await User.findOne({
    email: user?.email,
    role: 'Admin',
  });

  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const category = await Category.findById(categoryId);
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Category not found.');
  }

  // If subCategoryIds provided, delete only those
  const subCategoryList = category.subCategory || [];

  if (subCategoryIds && subCategoryIds.length > 0) {
    const existingIds = subCategoryList
      .filter(sub => subCategoryIds!.includes(sub._id!.toString()))
      .map(sub => sub._id!.toString());

    if (existingIds.length === 0) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'No matching subcategories found to delete.'
      );
    }

    await Category.findByIdAndUpdate(
      categoryId,
      { $pull: { subCategory: { _id: { $in: existingIds } } } },
      { new: true }
    );

    return { deletedCount: existingIds.length };
  }

  // If no subCategoryIds provided, delete the whole category
  await Category.findByIdAndDelete(categoryId);
  return { deletedCount: subCategoryList.length };
};


export const CategoryService = {
  getAllCategories,
  getCategoryById,
  createCategory,
  addSubCategory,
  updateCategory,
  deleteCategory,
};
