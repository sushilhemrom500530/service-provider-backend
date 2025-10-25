import { Router } from 'express';
import auth from '../../middlewares/auth';
import { SkiPassController } from './skipass.controller';
import { USER_UPLOADS_FOLDER } from './skipass.constant';
import validateRequest from './../../shared/validateRequest';
import { SkipassValidations } from './skipass.validations';
import fileUploadHandler from './../../shared/fileUploadHandler';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import { CommonValidations } from './../common/common.validation';

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

const router = Router();

// get all
router.get(
  '/all',
  auth('User', 'Admin', 'Provider'),
  SkiPassController.getAllSkiPassFromDB
);

// get single
router.get(
  '/:id',
  auth('User', 'Admin', 'Provider'),
  SkiPassController.getSingleSkipPassFromDB
);

// create
router.post(
  '/create',
  auth('Admin', 'Provider'),
  uploads.single('file'),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  validateRequest(SkipassValidations.createSkiPassSchema),
  SkiPassController.addSkiPassIntoDB
);

// review
router.post(
  '/review/:id',
  auth('User'),
  validateRequest(CommonValidations.reviewSchema),
  SkiPassController.reviewSkiPass
);

// update
router.patch(
  '/update/:id',
  auth('User', 'Admin', 'Provider'),
  uploads.single('file'),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  validateRequest(SkipassValidations.updateSkiPassSchema),
  SkiPassController.updateSkiPassIntoDB
);

// delete
router.delete(
  '/delete/:id',
  auth('Provider'),
  SkiPassController.deleteSkiPassIntoDB
);

export const SkiPassRoutes = router;
