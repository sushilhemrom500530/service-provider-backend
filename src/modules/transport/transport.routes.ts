import { Router } from 'express';
import auth from '../../middlewares/auth';
import fileUploadHandler from './../../shared/fileUploadHandler';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import validateRequest from './../../shared/validateRequest';
import { CommonValidations } from './../common/common.validation';
import { USER_UPLOADS_FOLDER } from './transport.constant';
import { TransportController } from './transport.controller';
import { TransportValidations } from './transport.validations';

const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

const router = Router();

// get all
router.get(
  '/all',
  auth('User', 'Admin', 'Provider'),
  TransportController.getAllTransportFromDB
);

// get single
router.get(
  '/:id',
  auth('User', 'Admin', 'Provider'),
  TransportController.getSingleTransportFromDB
);

// create
router.post(
  '/create',
  auth('Admin', 'Provider'),
  uploads.fields([
    { name: 'brandPhoto', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  validateRequest(TransportValidations.createTransport),
  TransportController.addTransportIntoDB
);

// review
router.post(
  '/review/:id',
  auth('User'),
  validateRequest(CommonValidations.reviewSchema),
  TransportController.reviewTransport
);

// update
router.patch(
  '/update/:id',
  auth('User', 'Admin', 'Provider'),
  uploads.fields([
    { name: 'brandPhoto', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
  validateRequest(TransportValidations.updateTransport),
  TransportController.updateTransportIntoDB
);

// delete
router.delete(
  '/delete/:id',
  auth('Provider'),
  TransportController.deleteTransportIntoDB
);

export const TransportRoutes = router;
