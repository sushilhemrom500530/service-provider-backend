import { Router } from 'express';
import auth from '../../middlewares/auth';
import validateRequest from './../../shared/validateRequest';
import fileUploadHandler from './../../shared/fileUploadHandler';
import convertHeicToPngMiddleware from './../../shared/convertHeicToPngMiddleware';
import { BookingController } from './booking.controller';
import { BookingRoutesValidations } from './booking.validations';
import { SkipassValidations } from './../skiPass/skipass.validations';
import { CommonValidations } from './../common/common.validation';

const router = Router();

// get all
router.get(
  '/all',
  auth('User', 'Admin', 'Provider'),
  BookingController.getAllBookingFromDB,
);

// get my booking
router.get(
  '/my-booking',
  auth('User', 'Admin', 'Provider'),
  BookingController.getMyBookingIntoDB,
);

router.get(
  '/itinerary',
  auth('User', 'Admin', 'Provider'),
  BookingController.getMyAllBookingIntoDB,
);

// get my booking for home
router.get(
  '/my-booking-home',
  auth('User', 'Admin', 'Provider'),
  BookingController.getMyBookingForHome,
);

// get single
router.get(
  '/:id',
  auth('User', 'Admin', 'Provider'),
  BookingController.getSingleBookingFromDB,
);

// step 1: create Stripe payment intent (returns clientSecret + publishable key)
router.post(
  '/intent',
  auth('User'),
  validateRequest(BookingRoutesValidations.createPaymentIntentSchema),
  BookingController.createPaymentIntent,
);

// step 2: create booking after Stripe payment succeeded (requires paymentIntentId)
router.post(
  '/create',
  auth('User'),
  validateRequest(BookingRoutesValidations.createBookingSchema),
  BookingController.addBookingIntoDB,
);

// update
router.patch(
  '/update-status/:id',
  auth('Admin', 'Provider'),
  validateRequest(BookingRoutesValidations.updateBookingSchema),
  BookingController.updateBookingStatus,
);

// reject (provider declines): full refund to the customer + stock back
router.patch(
  '/reject/:id',
  auth('Admin', 'Provider'),
  validateRequest(BookingRoutesValidations.rejectBookingSchema),
  BookingController.rejectBooking,
);

// hand-over: equipment / vehicle given to the customer (rental starts)
router.patch(
  '/hand-over/:id',
  auth('Admin', 'Provider'),
  BookingController.handOverBooking,
);

// complete
router.patch(
  '/complete/:id',
  auth('Admin', 'Provider'),
  BookingController.completeBooking,
);

// update permission
router.patch(
  '/update-permit/:id',
  auth('Admin', 'Provider'),
  validateRequest(BookingRoutesValidations.updatePermitBookingSchema),
  BookingController.updatePermitBookingStatus,
);

// refund
router.patch(
  '/refund/:id',
  auth('User'),
  validateRequest(CommonValidations.refundSchema),
  BookingController.refundBookingIntoDB,
);

// delete
router.delete(
  '/delete/:id',
  auth('Admin', 'User'),
  BookingController.deleteBookingIntoDB,
);

export const BookingRoutes = router;
