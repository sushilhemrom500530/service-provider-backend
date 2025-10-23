import { Router, NextFunction, Response, Request } from 'express';
import auth from '../../middlewares/auth';
import { UserController } from './user.controller';
import fileUploadHandler from '../../shared/fileUploadHandler';
import { USER_UPLOADS_FOLDER } from './user.constant';
import convertHeicToPngMiddleware from '../../shared/convertHeicToPngMiddleware';
import validateRequest from './../../shared/validateRequest';
import { UserValidation } from './user.validation';

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

const router = Router();

// //get user activity graph chart
// router.get(
//   '/activity-graph-chart',
//    auth('Admin', 'Provider', 'User'),
//   UserController.userActivityGraphChart
// );

// router.get(
//   '/dashboard/overview',
//    auth('Admin', 'Provider', 'User'),
//   UserController.getDashboardOverview
// );

router.get('/all', UserController.getAllUsers);

router.get(
  '/:id',
  auth('Admin', 'Provider', 'User'),
  UserController.getUserById
);

router.patch(
  '/:id/status',
  auth('Admin', 'Provider', 'User'),
  UserController.updateUserStatus
);

router.get(
  '/profile/me',
  auth('Admin', 'Provider', 'User'),
  UserController.getMyProfile
);

router.patch(
  '/update-profile',
  auth('Admin', 'Provider', 'User'),
  uploads.single('file'),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  validateRequest(UserValidation.updateMyProfileSchema),
  UserController.updateMyProfile
);

router.delete(
  '/delete/:id',
  auth('Admin', 'Provider', 'User'),
  UserController.deleteMyProfile
);

export const UserRoutes = router;
