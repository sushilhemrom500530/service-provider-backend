import { Router } from 'express';
import fileUploadHandler from './../../shared/fileUploadHandler'; 
import auth from './../../middlewares/auth'; 
import validateRequest from './../../shared/validateRequest';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import { CommonValidations } from './../common/common.validation';
import { USER_UPLOADS_FOLDER } from './skihire.constant';
import { SkiHireController } from './skihire.controller';
import { SkiHireValidations } from './skihire.validations';

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

const router = Router();

// get all
router.get(
  '/all',
  auth('User', 'Admin', 'Provider'),
  SkiHireController.getAllSkiHireFromDB
);

// specific provider all
router.get(
  '/my-all',
  auth('User', 'Admin', 'Provider'),
  SkiHireController.getAllMySkiHireFromDB
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
    { name: 'files', maxCount: 20 },
  ]),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  validateRequest(SkiHireValidations.createSkiHireSchema),
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
    { name: 'images', maxCount: 20 },
  ]),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  validateRequest(SkiHireValidations.updateSkiHireSchema),
  SkiHireController.updateSkiHireIntoDB
);

// delete
router.delete(
  '/delete/:id',
  auth('Admin', 'Provider'),
  SkiHireController.deleteSkiHireIntoDB
);

export const SkiHireRoutes = router;
