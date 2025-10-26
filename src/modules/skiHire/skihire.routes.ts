import { Router } from 'express';
import fileUploadHandler from './../../shared/fileUploadHandler'; 
import auth from './../../middlewares/auth'; 
import validateRequest from './../../shared/validateRequest';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import { CommonValidations } from './../common/common.validation';
import { USER_UPLOADS_FOLDER } from './skihire.constant';
import { SkiHireController } from './skihire.controller';

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

const router = Router();

// get all
router.get(
  '/all',
  auth('User', 'Admin', 'Provider'),
  SkiHireController.getAllSkiHireFromDB
);

// get single
router.get(
  '/:id',
  auth('User', 'Admin', 'Provider'),
  SkiHireController.getSingleSkiHireFromDB
);

// create
router.post(
  '/create',
  auth('Admin', 'Provider'), 
  uploads.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'menuItems', maxCount: 20 },
  ]),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  // validateRequest(RestaurantValidations.createRestaurant),
  SkiHireController.addSkiHireIntoDB
);

// review
router.post(
  '/review/:id',
  auth('User'),
  validateRequest(CommonValidations.reviewSchema),
  SkiHireController.reviewSkiHire
);

// update
router.patch(
  '/update/:id',
  auth('Admin', 'Provider'), 
  uploads.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'menuItems', maxCount: 20 },
  ]),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  // validateRequest(RestaurantValidations.updateRestaurant),
  SkiHireController.updateSkiHireIntoDB
);

// delete
router.delete(
  '/delete/:id',
  auth('Admin', 'Provider'),
  SkiHireController.deleteSkiHireIntoDB
);

export const SkiHireRoutes = router;
