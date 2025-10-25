import { Router } from 'express';
import auth from '../../middlewares/auth';
import {RestaurantController} from './restaurant.controller';
import { USER_UPLOADS_FOLDER } from './skipass.constant';
import validateRequest from './../../shared/validateRequest';
import { SkipassValidations } from './skipass.validations';
import fileUploadHandler from './../../shared/fileUploadHandler';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';

 const uploads = fileUploadHandler(USER_UPLOADS_FOLDER);

const router = Router();

// get all
router.get(
  '/all',
  auth('User','Admin', 'Provider'), 
  RestaurantController.getAllSkiPassFromDB
);

// get single 
router.get(
  '/:id',
  auth('User','Admin', 'Provider'),
  RestaurantController.getSingleSkipPassFromDB
);


// create 
router.post(
  '/create',
  auth('Admin', 'Provider'),
  uploads.single('file'),
  convertHeicToPngMiddleware(USER_UPLOADS_FOLDER),
   validateRequest(SkipassValidations.createSkiPassSchema),
  RestaurantController.addSkiPassIntoDB
);


// review 
router.post(
  '/review/:id',
  auth('User',),  
   validateRequest(SkipassValidations.reviewSkiPassSchema),
  RestaurantController.reviewSkiPass
);


// update
router.patch(
  '/update/:id',
  auth('User', 'Admin', 'Provider'), 
  validateRequest(SkipassValidations.createSkiPassSchema),
  RestaurantController.updateSkiPassIntoDB
);

// delete
router.delete(
  '/delete/:id',
  auth('Provider'),
  RestaurantController.deleteSkiPassIntoDB
);
 
export const RestaurantRoutes = router;