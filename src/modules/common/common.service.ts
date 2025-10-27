import { User } from './../user/user.model';
import { Category } from './../category/category.model';
import AppError from './../../errors/AppErro';
import { StatusCodes } from 'http-status-codes';

const getSkiPassCategory = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const category = await Category.findOne({ primaryCategoryName: 'Ski_Pass' });
  if (!category) {
     return {message:'Ski Pass category not found.'};  
  }
 
  const items = category?.subCategory || [];
  return items;
};


const getSkiHireCategory = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const category = await Category.findOne({ primaryCategoryName: 'Ski_Hire' });
  if (!category) {
     return {message:'Ski Hire category not found.'};  
  }
 
  const items = category?.subCategory || [];
  return items;
};

const getRestaurantCategory = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const category = await Category.findOne({ primaryCategoryName: 'Restaurant' });
  if (!category) {
     return {message:'Restaurant category not found.'};  
  }
 
  const items = category?.subCategory || [];
  return items;
};

const getTransportCategory = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const category = await Category.findOne({ primaryCategoryName: 'Transport' });
  if (!category) {
    return {message:'Transport category not found.'};
  }
 
  const items = category?.subCategory || [];
  return items;
};

const getMassageCategory = async (user: JwtPayload) => {
  const isExistsUser = await User.findOne({ email: user?.email });
  if (!isExistsUser) {
    throw new AppError(
      StatusCodes.NOT_FOUND,
      'You cannot view this data because your account was not found.'
    );
  }

  const category = await Category.findOne({ primaryCategoryName: 'Massage' });
  if (!category) {
     return {message:'Massage category not found.'}; 
  }
 
  const items = category?.subCategory || [];
  return items;
};

export const CommonService = {
  getSkiPassCategory,
  getSkiHireCategory,
  getRestaurantCategory,
  getTransportCategory,
  getMassageCategory
};
