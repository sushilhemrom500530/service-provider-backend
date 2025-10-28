import { Router } from 'express';
import fileUploadHandler from './../../shared/fileUploadHandler';
import { USER_UPLOADS_FOLDER } from './restaurant.constant';
import auth from './../../middlewares/auth';
import { RestaurantController } from './restaurant.controller';
import validateRequest from './../../shared/validateRequest';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import { RestaurantValidations } from './restaurant.validations';
import { CommonValidations } from './../common/common.validation';

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

const router = Router();

// get all
router.get(
  '/all',
  auth('User', 'Admin', 'Provider'),
  RestaurantController.getAllRestaurantFromDB
);

// get single
router.get(
  '/:id',
  auth('User', 'Admin', 'Provider'),
  RestaurantController.getSingleRestaurantFromDB
);

// create
router.post(
  '/create',
  auth('Admin', 'Provider'), 
  uploads.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'files', maxCount: 20 },
  ]),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  validateRequest(RestaurantValidations.createRestaurant),
  RestaurantController.addRestaurantIntoDB
);

// review
router.post(
  '/review/:id',
  auth('User'),
  validateRequest(CommonValidations.reviewSchema),
  RestaurantController.reviewRestaurant
);

// update
router.patch(
  '/update/:id',
  auth('Admin', 'Provider'), 
  uploads.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'files', maxCount: 20 },
  ]),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  validateRequest(RestaurantValidations.updateRestaurant),
  RestaurantController.updateRestaurantIntoDB
);

// delete
router.delete(
  '/delete/:id',
  auth('Admin', 'Provider'),
  RestaurantController.deleteRestaurantIntoDB
);

export const RestaurantRoutes = router;
