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

  return [];
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

const updateCategory = async (
  req: Request,
  res: Response,
  payload: Partial<any | {}>
) => {
  const id = req?.params?.id;
  const user = req.user as JwtPayload;

  return [];
};

const deleteCategory = async (id: string, user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const result = await Category.findByIdAndDelete(id);
  return [];
};

export const CategoryService = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
