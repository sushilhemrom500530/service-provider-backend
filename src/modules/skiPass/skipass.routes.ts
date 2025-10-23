import { Router } from 'express';
import auth from '../../middlewares/auth';
import {SkiPassController} from './skipass.controller';
import { USER_UPLOADS_FOLDER } from './skipass.constant';
import validateRequest from './../../shared/validateRequest';
import { SkipassValidations } from './skipass.validations';
import fileUploadHandler from './../../shared/fileUploadHandler';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';

 const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

const router = Router();

// get all ski pass
router.get(
  '/all',
  auth('User','Admin', 'Provider'), 
  SkiPassController.getAllSkiPassFromDB
);

// get single ski pass 
router.get(
  '/:id',
  auth('User','Admin', 'Provider'),
  SkiPassController.getSingleSkipPassFromDB
);


// create ski pass 
router.post(
  '/create',
  auth('Admin', 'Provider'),
  uploads.single('file'),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
   validateRequest(SkipassValidations.createSkiPassSchema),
  SkiPassController.addSkiPassIntoDB
);


// update
router.patch(
  '/update/:id',
  auth('User', 'Admin', 'Provider'), 
  validateRequest(SkipassValidations.createSkiPassSchema),
  SkiPassController.updateSkiPassIntoDB
);

// delete
router.delete(
  '/delete/:id',
  auth('User', 'Admin', 'Provider'),
  SkiPassController.deleteSkiPassIntoDB
);
 
export const SkiPassRoutes = router;