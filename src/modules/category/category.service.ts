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

const createCategory = async (req: Request, res: Response) => {
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

  const thumbnailFile = req.files?.['thumbnail']?.[0];
  // if (!thumbnailFile) {
  //   throw new AppError(StatusCodes.BAD_REQUEST, 'Thumbnail file not found.');
  // }

  const thumbnailUrl = await s3Services.uploadSingleFileToS3(
    thumbnailFile,
    USER_UPLOADS_FOLDER
  );

  let subCategory: ICategory[] = [];

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
  } else {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'SubCategory data is missing or invalid.'
    );
  }

  //  Upload subCategory images
  const subCategoryFiles = req.files?.['files'] || [];

  const processedSubCategory = await Promise.all(
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

  const categoryData = {
    primaryCategoryName,
    thumbnail: thumbnailUrl,
    subCategory: processedSubCategory,
  };

  const result: ICategory = await Category.create(categoryData);

  return result;
};

const addSubCategory = async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  // check user
  const isExistsUser = await User.findOne({
    email: user?.email,
    role: 'Admin',
  });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot create this data because your account was not found.'
    );
  }

  const categoryId = req.params.id;

  // Check if category exists
  const isExistsCategory = await Category.findById(categoryId);
  if (!isExistsCategory) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Category not found.');
  }
  // Parse subCategory data
  let subCategory: ISubCategory[] = [];
  if (typeof req.body.subCategory === 'string') {
    try {
      subCategory = JSON.parse(req.body?.subCategory);
    } catch (error) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Invalid subCategory format. Must be valid JSON.'
      );
    }
  } else if (Array.isArray(req.body?.subCategory)) {
    subCategory = req.body.subCategory;
  } else {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'SubCategory data is missing or invalid.'
    );
  }

  const subCategoryFiles = req.files?.['files'] || [];
  if (subCategory.length !== subCategoryFiles.length) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Number of subCategory items must match number of uploaded files.'
    );
  }
  const processedSubCategory = await Promise.all(
    subCategory.map(async (item, index) => {
      const subFile = subCategoryFiles[index];
      let categoryPhoto = item.categoryPhoto;

      if (subFile) {
        categoryPhoto = await s3Services.uploadSingleFileToS3(
          subFile,
          USER_UPLOADS_FOLDER
        );
      }

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
  // check user
  const isExistsUser = await User.findOne({
    email: user?.email,
    role: 'Admin',
  });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot update this data because your account was not found.'
    );
  }

  const isExistsCategory = await Category.findById(id);
  if (!isExistsCategory) {
    throw new AppError(StatusCodes.NOT_FOUND, 'Category not found.');
  }

  if (isExistsCategory?.primaryCategoryName !== req.body?.primaryCategoryName) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Primary category name cannot be changed.'
    );
  }

  const { primaryCategoryName } = req.body;

  let thumbnailUrl = isExistsCategory.thumbnail;
  const thumbnailFile = req.files?.['thumbnail']?.[0];
  if (thumbnailFile) {
    thumbnailUrl = await s3Services.uploadSingleFileToS3(
      thumbnailFile,
      USER_UPLOADS_FOLDER
    );
  }

  // Parse subCategory JSON
  let subCategory: ISubCategory[] = [];
  if (typeof req.body?.subCategory === 'string') {
    try {
      subCategory = JSON.parse(req.body?.subCategory);
    } catch (error) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Invalid subCategory format. Must be valid JSON.'
      );
    }
  } else if (Array.isArray(req.body?.subCategory)) {
    subCategory = req.body?.subCategory;
  } else {
    subCategory = isExistsCategory?.subCategory as ISubCategory[];
  }

  const subCategoryFiles = req.files?.['files'] || [];
  const processedSubCategory = await Promise.all(
    subCategory.map(async (item, index) => {
      const subFile = subCategoryFiles[index];
      let categoryPhoto = item.categoryPhoto;

      // If new image uploaded for this index
      if (subFile) {
        categoryPhoto = await s3Services.uploadSingleFileToS3(
          subFile,
          USER_UPLOADS_FOLDER
        );
      }

      return {
        ...item,
        categoryPhoto,
      };
    })
  );

  const result = await Category.findByIdAndUpdate(
    id,
    {
      primaryCategoryName:
        primaryCategoryName || isExistsCategory?.primaryCategoryName,
      thumbnail: thumbnailUrl,
      subCategory: processedSubCategory,
    },
    { new: true }
  );

  return result;
};

const deleteCategory = async (
  categoryId: string,
  subCategoryIds: string,
  user: JwtPayload
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

  const ids = Array.isArray(subCategoryIds) ? subCategoryIds : [subCategoryIds];

  const existingIds = category.subCategory
    .filter(sub => ids.includes(sub._id.toString()))
    .map(sub => sub._id.toString());

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
};

export const CategoryService = {
  getAllCategories,
  getCategoryById,
  createCategory,
  addSubCategory,
  updateCategory,
  deleteCategory,
};
