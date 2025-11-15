import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { UserService } from './user.service';
import pick from '../../shared/pick'; 
import { s3Services } from '../../aws/s3Service';
import { User } from './user.model';
import { JwtPayload } from 'jsonwebtoken';
import { USER_UPLOADS_FOLDER } from './user.constant';

const getAllUsers = catchAsync(async (req, res) => {
  // const result = await User.find({ isDeleted: false, status:'Active' });
  // sendResponse(res, {
  //   code: StatusCodes.OK,
  //   message: 'Users retrieved successfully.',
  //   data: result,
  // });
  const filters = pick(req.query, ['role', 'status', 'searchTerm']);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);
  const users = await UserService.getAllUsers(filters, options);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Users retrieved successfully.',
    data: users,
  });
});

const getUserById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const user = await UserService.getUserById(id);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'User retrieved successfully.',
    data: user,
  });
});

const updateUserStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const user = req.user as JwtPayload;
  const result = await UserService.updateUserStatus(id, user, status);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'User status updated successfully.',
    data: result,
  });
});
 

const getMyProfile = catchAsync(async (req, res) => {
  const { userId } = req.user;
  if(!userId){
    throw new Error('User id not found');
  }
  const user = await UserService.getMyProfile(userId);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Profile retrieved successfully.',
    data: user,
  });
});

const updateMyProfile = catchAsync(async (req, res) => {
  const { userId } = req.user;
  // Handle file upload
  if (req.file) {
    const fileUrl = await s3Services.uploadSingleFileToS3(
      req.file,
      USER_UPLOADS_FOLDER
    );
    req.body.profileUrl = fileUrl;
  } else {
    throw new Error('File not found');
  }

  const updateData = req?.body;

  const result = await UserService.updateMyProfile(userId, updateData);

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Profile updated successfully.',
    data: result,
  });
});

const deleteMyProfile = catchAsync(async (req, res) => {
  const { userId } = req.user;
  if(!userId){
    throw new Error('User id not found');
  }
  await UserService.deleteMyProfile(userId);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'User deleted successfully.',
    data: {},
  });
});

export const UserController = {
  getAllUsers,
  getUserById,
  updateUserStatus,
  getMyProfile, 
  updateMyProfile,
  deleteMyProfile, 
};
