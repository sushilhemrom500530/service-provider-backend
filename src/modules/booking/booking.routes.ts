import { Router } from 'express';
import auth from '../../middlewares/auth';
import validateRequest from './../../shared/validateRequest'; 
import fileUploadHandler from './../../shared/fileUploadHandler';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import { BookingController } from './booking.controller';
import { BookingRoutesValidations } from './booking.validations';
 
const router = Router();

// get all 
router.get(
  '/all',
  auth('User', 'Admin', 'Provider'),
  BookingController.getAllBookingFromDB
);

// get single 
router.get(
  '/:id',
  auth('User', 'Admin', 'Provider'),
  BookingController.getSingleBookingFromDB
);


// create  
router.post(
  '/create',
  auth('User', 'Admin', 'Provider'), 
  validateRequest(BookingRoutesValidations.createSkiPassSchema),
  BookingController.addBookingIntoDB
);


// update
router.patch(
  '/update/:id',
  auth('User', 'Admin', 'Provider'), 
  validateRequest(BookingRoutesValidations.createSkiPassSchema),
  BookingController.updateBookingIntoDB
);

// delete
router.delete(
  '/delete/:id',
  auth('User', 'Admin', 'Provider'),
  BookingController.deleteBookingIntoDB
);


export const BookingRoutes = router;
