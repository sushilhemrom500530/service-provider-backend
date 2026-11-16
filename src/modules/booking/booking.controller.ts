import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { BookingService } from './booking.service';

const me = (req: Request) => req.user as JwtPayload;
const idParam = (req: Request) => String(req.params.id);
const viewerOf = (req: Request) =>
  me(req).role === 'Admin' ? 'admin' : me(req).role === 'Provider' ? 'provider' : 'customer';

const ok = (res: Response, message: string, data: unknown, meta?: any, code = StatusCodes.OK) =>
  sendResponse(res, { code, message, data, meta });

/* ---------------- create ---------------- */

const createIntent = catchAsync(async (req, res) => {
  const data = await BookingService.createBookingIntent(me(req), req.body);
  ok(res, 'Payment ready. Show the Stripe payment sheet.', data);
});

const createBooking = catchAsync(async (req, res) => {
  const booking = await BookingService.createBookingFromPayment(me(req), req.body);
  ok(res, 'Booking created.', await BookingService.detail(booking, 'customer'), undefined, StatusCodes.CREATED);
});

const stripeWebhook = catchAsync(async (req, res) => {
  const result = await BookingService.handleStripeWebhook(
    req.body as Buffer,
    req.headers['stripe-signature'] as string | undefined,
  );
  res.status(StatusCodes.OK).json(result);
});

const availability = catchAsync(async (req, res) => {
  const data = await BookingService.getAvailability(String(req.params.productId), req.query as any);
  ok(res, 'Availability fetched.', data);
});

/* ---------------- read ---------------- */

const myBookings = catchAsync(async (req, res) => {
  const { data, meta } = await BookingService.getMyBookings(me(req), req.query as any);
  ok(res, 'Bookings fetched.', data, meta);
});

const providerBookings = catchAsync(async (req, res) => {
  const { data, meta } = await BookingService.getProviderBookings(me(req), req.query as any);
  ok(res, 'Bookings fetched.', data, meta);
});

/** Old shared paths: customers get their bookings, providers their listings' bookings */
const roleBookings = catchAsync(async (req, res) => {
  const user = me(req);
  const result =
    user.role === 'Admin'
      ? await BookingService.getAllBookingsAdmin(req.query as any)
      : user.role === 'Provider'
        ? await BookingService.getProviderBookings(user, req.query as any)
        : await BookingService.getMyBookings(user, req.query as any);
  ok(res, 'Bookings fetched.', result.data, result.meta);
});

const allBookingsAdmin = catchAsync(async (req, res) => {
  const { data, meta } = await BookingService.getAllBookingsAdmin(req.query as any);
  ok(res, 'Bookings fetched.', data, meta);
});

const bookingById = catchAsync(async (req, res) => {
  ok(res, 'Booking fetched.', await BookingService.getBookingById(idParam(req), me(req)));
});

/* ---------------- actions ---------------- */

const action =
  (fn: (id: string, user: JwtPayload, req: Request) => Promise<any>, message: string) =>
  catchAsync(async (req, res) => {
    const result = await fn(idParam(req), me(req), req);
    const booking = result?.booking ?? result;
    const data = await BookingService.detail(booking, viewerOf(req) as any);
    ok(res, message, result?.refund ? { ...data, refund: result.refund } : data);
  });

const approve = action((id, user) => BookingService.approveBooking(id, user), 'Booking confirmed.');
const reject = action(
  (id, user, req) => BookingService.rejectBooking(id, user, req.body?.reason),
  'Booking rejected and refunded.',
);
const handOver = action((id, user) => BookingService.handOverBooking(id, user), 'Rental handed over.');
const returned = action(
  (id, user) => BookingService.returnRental(id, user),
  'Rental returned.',
);
const complete = action((id, user) => BookingService.completeBooking(id, user), 'Booking completed.');
const cancel = action(
  (id, user, req) => BookingService.cancelByCustomer(id, user, req.body?.reason),
  'Booking cancelled.',
);

/** Old endpoint: PATCH /update-permit/:id { isPermitted: true } */
const updatePermit = catchAsync(async (req, res) => {
  if (req.body?.isPermitted === false || req.body?.isPermitted === 'false') {
    const booking = await BookingService.rejectBooking(idParam(req), me(req), req.body?.reason);
    return ok(res, 'Booking rejected and refunded.', await BookingService.detail(booking, viewerOf(req) as any));
  }
  const booking = await BookingService.approveBooking(idParam(req), me(req));
  ok(res, 'Booking confirmed.', await BookingService.detail(booking, viewerOf(req) as any));
});

/** Old endpoint: PATCH /update-status/:id { bookingStatus } -> mapped to the real actions */
const updateStatus = catchAsync(async (req, res) => {
  const status = String(req.body?.bookingStatus || req.body?.status || '');
  const id = idParam(req);
  const user = me(req);
  let booking: any;
  if (['Cancelled', 'Cancel', 'Rejected'].includes(status))
    booking = await BookingService.rejectBooking(id, user, req.body?.reason);
  else if (['Completed', 'Complete'].includes(status)) booking = await BookingService.completeBooking(id, user);
  else if (['Confirmed', 'Approved', 'Active'].includes(status)) booking = await BookingService.approveBooking(id, user);
  else
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Use the booking actions: approve, reject, hand-over, return, complete.',
    });
  ok(res, 'Booking updated.', await BookingService.detail(booking, viewerOf(req) as any));
});

const adminRefund = action(
  (id, user, req) => BookingService.adminRefund(id, user, req.body?.amount, req.body?.reason),
  'Refund issued.',
);

/* ---------------- late fee ---------------- */

const lateFeeIntent = catchAsync(async (req, res) => {
  ok(res, 'Payment ready. Show the Stripe payment sheet.', await BookingService.createLateFeeIntent(idParam(req), me(req)));
});

const lateFeeConfirm = catchAsync(async (req, res) => {
  const booking = await BookingService.confirmLateFee(String(req.body?.paymentIntentId), me(req));
  ok(res, 'Late fee paid.', await BookingService.detail(booking, 'customer'));
});

export const BookingController = {
  createIntent,
  createBooking,
  stripeWebhook,
  availability,
  myBookings,
  providerBookings,
  roleBookings,
  allBookingsAdmin,
  bookingById,
  approve,
  reject,
  handOver,
  returned,
  complete,
  cancel,
  updatePermit,
  updateStatus,
  lateFeeIntent,
  lateFeeConfirm,
  adminRefund,
};
