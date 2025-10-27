import { StatusCodes } from 'http-status-codes';
import AppError from '../../errors/AppErro';
import { IUser, UserStatus, IUpdateData } from './user.interface';
import { User } from './user.model';
import { IPaginationOptions, IPaginationResult } from '../../types/pagination';
import { JwtPayload } from 'jsonwebtoken';

 
const getAllUsers = async (
  filters: Record<string, any>,
  options: IPaginationOptions
): Promise<IPaginationResult<IUser>> => {
  const query: Record<string, any> = {};

  if (filters.role) {
    query.role = filters.role;
  } else {
    query.role = { $nin: ['Admin'] };
  }

  if (filters.status) {
    query.status = filters.status;
  } else {
    query.status = 'Active';
  }

  if (filters.searchTerm && typeof filters.searchTerm === 'string') {
    query.$or = [
      { email: { $regex: filters.searchTerm, $options: 'i' } },
      { fullName: { $regex: filters.searchTerm, $options: 'i' } },
    ];
  }

  options.sortBy = options.sortBy || 'createdAt';
  options.select = '-password -__v';

  const result = await User.paginate(query, options);
  return result;
};

const getUserById = async (userId: string): Promise<IUser | null> => {
  const user = await User.findOne({
    _id: userId,
    status: UserStatus.Active,
  }).select(
    '-password -__v -security -preferences -socialAccounts -profile._id  -isResetPassword -metadata.ipAddresses -metadata.userAgent -metadata._id'
  );
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }
  return user;
};
 
 
const updateUserStatus = async (
  userId: string,
  user: JwtPayload,
  status: UserStatus
): Promise<IUser | null> => {
  const existsUser = await User.findOne({
    email: user?.email,
    role: 'Admin',
  });

  if (!existsUser)
    throw new AppError(StatusCodes.NOT_FOUND, 'Only Admin can delete user.');

  const result = await User.findByIdAndUpdate(
    userId,
    { status },
    { new: true, runValidators: true }
  );
  return result;
};

//  Get My Profile
const getMyProfile = async (userId: string): Promise<IUser | null> => {
  const user = await User.findOne({
    _id: userId,
    status: UserStatus.Active,
  }).select(
    '-password -__v -security -preferences -socialAccounts -profile._id  -isResetPassword -metadata.ipAddresses -metadata.userAgent -metadata._id'
  );
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }
  return user;
};

//  Update My Profile
const updateMyProfile = async (
  userId: string,
  updateData: IUpdateData
): Promise<IUser | null> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  const result = await User.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true }
  );

  return result;
};

//  Delete My Profile
const deleteMyProfile = async (userId: string): Promise<IUser | null> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }
  const result = await User.findByIdAndDelete(userId);
  return result;
};

export const UserService = {
  getAllUsers,
  getUserById,
  updateUserStatus,
  getMyProfile,
  updateMyProfile, 
  deleteMyProfile,
};
