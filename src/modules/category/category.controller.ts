import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { s3Services } from '../../aws/s3Service';
import { JwtPayload } from 'jsonwebtoken';
import { Category } from './category.model';
import { CategoryService } from './category.service';
import { Request } from 'express';

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
  const user = await CategoryService.getCategoryById(id);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Category retrieved successfully.',
    data: user,
  });
});

const createCategory = catchAsync(async (req, res) => {
  const user = req.user as JwtPayload;
  const result = await CategoryService.createCategory(req as Request, user);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Category create successfully.',
    data: result,
  });
});

const addSubCategory = catchAsync(async (req, res) => {
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
    user
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
    // queryValue can be string or array (if multiple same query keys)
    if (Array.isArray(queryValue)) {
      subCategoryIds = queryValue.flatMap(v => v.split(','));
    } else {
      subCategoryIds = queryValue.split(',');
    }
  }

  const result = await CategoryService.deleteCategory(
    id,
    subCategoryIds,
    req.user as JwtPayload
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
