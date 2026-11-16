import { Router } from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../shared/validateRequest';
import { BookingController as C } from './booking.controller';
import { BookingRoutesValidations as V } from './booking.validations';

const router = Router();
const customer = auth('User');
const provider = auth('Provider', 'Admin');
const anyone = auth('User', 'Provider', 'Admin');

/* -------- availability (before /:id) -------- */
router.get('/availability/:productId', C.availability);

/* -------- create: intent -> Stripe sheet -> create -------- */
router.post('/intent', customer, validateRequest(V.createPaymentIntentSchema), C.createIntent);
router.post('/create', customer, validateRequest(V.createBookingSchema), C.createBooking);
// (Stripe webhook is mounted in app.ts with a raw body: POST /api/v1/booking/webhook)

/* -------- lists -------- */
router.get('/my', customer, C.myBookings);
router.get('/provider', provider, C.providerBookings);
router.get('/admin/all', auth('Admin'), C.allBookingsAdmin);
// older paths used by the app: same data, chosen by role
router.get('/all', anyone, C.roleBookings);
router.get('/my-booking', anyone, C.roleBookings);
router.get('/itinerary', anyone, C.roleBookings);
router.get('/my-booking-home', anyone, C.roleBookings);

/* -------- one booking -------- */
router.get('/:id', anyone, C.bookingById);

/* -------- provider actions -------- */
router.patch('/:id/approve', provider, C.approve);
router.patch('/:id/reject', provider, validateRequest(V.reasonSchema), C.reject);
router.patch('/:id/hand-over', provider, C.handOver);
router.patch('/:id/return', provider, C.returned);
router.patch('/:id/complete', provider, C.complete);

/* -------- admin: settle a complaint (full or partial refund, any state) -------- */
router.patch('/:id/admin-refund', auth('Admin'), C.adminRefund);

/* -------- customer actions -------- */
router.patch('/:id/cancel', customer, validateRequest(V.reasonSchema), C.cancel);
router.post('/:id/late-fee/intent', customer, C.lateFeeIntent);
router.post('/:id/late-fee/confirm', customer, validateRequest(V.lateFeeConfirmSchema), C.lateFeeConfirm);

/* -------- older action paths (kept for the current app) -------- */
router.patch('/update-permit/:id', provider, C.updatePermit);
router.patch('/update-status/:id', provider, C.updateStatus);
router.patch('/reject/:id', provider, validateRequest(V.reasonSchema), C.reject);
router.patch('/hand-over/:id', provider, C.handOver);
router.patch('/complete/:id', provider, C.complete);
router.patch('/refund/:id', customer, validateRequest(V.reasonSchema), C.cancel);

export const BookingRoutes = router;
