import { Router, NextFunction, Response, Request } from 'express';
import auth from '../../middlewares/auth'; 
import fileUploadHandler from '../../shared/fileUploadHandler'; 
import convertHeicToPngMiddleware from '../../shared/convertHeicToPngMiddleware';
import validateRequest from './../../shared/validateRequest'; 

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

const router = Router();
 

router.get('/all', UserController.getAllUsers);

router.get(
  '/:id',
  auth('Admin', 'Provider'),
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
