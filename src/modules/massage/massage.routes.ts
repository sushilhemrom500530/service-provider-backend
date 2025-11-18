import { Router } from 'express';
import auth from '../../middlewares/auth';
import fileUploadHandler from './../../shared/fileUploadHandler';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import { USER_UPLOADS_FOLDER } from './massage.constant';
import { MassageController } from './massage.controller';
import validateRequest from './../../shared/validateRequest';
import { MassageValidations } from './massage.validations';
import { CommonValidations } from './../common/common.validation';

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

const router = Router();

// get all
router.get(
  '/all',
  auth('User', 'Admin', 'Provider'),
  MassageController.getAllMassageFromDB
);


// specific provider all
router.get(
  '/my-all',
  auth('User', 'Admin', 'Provider'),
  MassageController.getAllMyMassageFromDB
);

// get single
router.get(
  '/:id',
  auth('User', 'Admin', 'Provider'),
  MassageController.getSingleMassageFromDB
);

// create
router.post(
  '/create',
  auth('Admin', 'Provider'),
  uploads.single('file'),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  validateRequest(MassageValidations.createMassage),
  MassageController.addMassageIntoDB
);

// review
router.post(
  '/review/:id',
  auth('User'),
  validateRequest(CommonValidations.reviewSchema),
  MassageController.reviewMassage
);

// update
router.patch(
  '/update/:id',
  auth('User', 'Admin', 'Provider'),
  uploads.single('file'),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER), 
  validateRequest(MassageValidations.updateMassage),
  MassageController.updateMassageIntoDB
);

// delete
router.delete(
  '/delete/:id',
  auth('Provider'),
  MassageController.deleteMassageIntoDB
);

export const MassageRoutes = router;
