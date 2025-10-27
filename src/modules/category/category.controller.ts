import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse'; 
import { s3Services } from '../../aws/s3Service'; 
import { JwtPayload } from 'jsonwebtoken';
import { Category } from './category.model';
import { CategoryService } from './category.service';
import { Request } from 'express';

const getAllCategories = catchAsync(async (req, res) => {
  
  const result = await Category.find({ isDeleted: false, status:'Active' });
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

const updateCategory = catchAsync(async (req, res) => {
  const { id } = req.params; 
  const { status } = req.body;
  const user = req.user as JwtPayload;
  const result = await CategoryService.updateCategory(id, user, status);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Category updated successfully.',
    data: result,
  });
}); 
 
 
const deleteCategory = catchAsync(async (req, res) => {
  const { userId } = req.user;
  await CategoryService.deleteCategory(userId);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'User deleted successfully.',
    data: {},
  });
});

export const CategoryController = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory, 
  deleteCategory,
};
