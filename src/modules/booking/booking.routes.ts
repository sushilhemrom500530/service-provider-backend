import { Router } from 'express';
import auth from '../../middlewares/auth';
import validateRequest from './../../shared/validateRequest';
import fileUploadHandler from './../../shared/fileUploadHandler';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import { BookingController } from './booking.controller';
import { BookingRoutesValidations } from './booking.validations';
import { SkipassValidations } from './../skiPass/skipass.validations';

const router = Router();

// get all
router.get(
  '/all',
  auth('User', 'Admin', 'Provider'),
  BookingController.getAllBookingFromDB
);

// get my booking
router.get(
  '/my-booking',
  auth('User', 'Admin', 'Provider'),
  BookingController.getMyBookingIntoDB
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
  validateRequest(BookingRoutesValidations.createBookingSchema),
  BookingController.addBookingIntoDB
);

// update
router.patch(
  '/update-status/:id',
  auth('Provider'),
  validateRequest(BookingRoutesValidations.updateBookingSchema),
  BookingController.updateBookingStatus
);

// refund
router.patch(
  '/refund/:id',
  auth('User'),
  validateRequest(SkipassValidations.refundSkiPassSchema),
  BookingController.refundBookingIntoDB
);

// delete
router.delete(
  '/delete/:id',
  auth('User', 'Admin', 'Provider'),
  BookingController.deleteBookingIntoDB
);

export const BookingRoutes = router;
