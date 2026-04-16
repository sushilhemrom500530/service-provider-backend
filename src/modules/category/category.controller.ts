import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { s3Services } from '../../aws/s3Service';
import { JwtPayload } from 'jsonwebtoken';
import { Category } from './category.model';
import { CategoryService } from './category.service';
import { Request, Response } from 'express';

const getAllCategories = catchAsync(async (req, res) => {
  const result = await Category.find();
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Categories retrieved successfully.',
    data: result,
  });
  // const filters = pick(req.query, ['role', 'status', 'searchTerm']);
  // const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);
  // const users = await UserService.getAllUsers(filters, options);
  // sendResponse(res, {
  //   code: StatusCodes.OK,
  //   message: 'Users retrieved successfully.',
  //   data: users,
  // });
});

const getCategoryById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const user = req.user as JwtPayload;
  // const user = await CategoryService.getCategoryById(id);
  const category = await CategoryService.getCategoryById(id, user);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Category retrieved successfully.',
    data: category,
  });
});

const createCategory = catchAsync(async (req, res) => {
  const result = await CategoryService.createCategory(req as Request);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Category create successfully.',
    data: result,
  });
});

const addSubCategory = catchAsync(async (req, res) => {
  // const result = await CategoryService.addSubCategory(req as Request);
  const result = await CategoryService.addSubCategory(req as Request);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Sub category create successfully.',
    data: result,
  });
});

const updateCategory = catchAsync(async (req, res) => {
  const id = req?.params?.id;
  const user = req.user as JwtPayload;
  const result = await CategoryService.updateCategory(
    req as Request,
    id as string,
    user,
  );
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Category updated successfully.',
    data: result,
  });
});

const deleteCategory = catchAsync(async (req, res) => {
  const { id } = req.params;
  // Read subCategoryIds from query if present
  let subCategoryIds: string[] | undefined;
  if (req.query.subCategoryIds) {
    const queryValue = req.query.subCategoryIds;
    if (Array.isArray(queryValue)) {
      //   subCategoryIds = queryValue.flatMap(v => v.split(','));
      // } else {
      subCategoryIds = queryValue.flatMap(v =>
        (typeof v === 'string' ? v : String(v)).split(','),
      );
    } else if (typeof queryValue === 'string') {
      subCategoryIds = queryValue.split(',');
    } else {
      subCategoryIds = String(queryValue).split(',');
    }
  }

  const result = await CategoryService.deleteCategory(
    id,
    req.user as JwtPayload,
    subCategoryIds,
  );

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Sub category deleted successfully.',
    data: result,
  });
});

export const CategoryController = {
  getAllCategories,
  getCategoryById,
  createCategory,
  addSubCategory,
  updateCategory,
  deleteCategory,
};
