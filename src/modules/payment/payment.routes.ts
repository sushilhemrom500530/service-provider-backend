import { Router } from 'express';
import auth from '../../middlewares/auth';
import { PaymentController } from './payment.controller';
import validateRequest from '../../shared/validateRequest';
import { paymentValidations } from './payment.validations';

const router = Router();

// Process PayPal payment
router.post(
  '/paypal',
  auth('Common'),
  validateRequest(paymentValidations.processPayPalPayment),
  PaymentController.processPayPalPayment
);

// Process Zelle payment
router.post(
  '/zelle',
  auth('Common'),
  validateRequest(paymentValidations.processZellePayment),
  PaymentController.processZellePayment
);

// Process refund (Admin only)
router.patch(
  '/:id/refund',
  auth('Admin', 'Super_Admin'),
  validateRequest(paymentValidations.processRefund),
  PaymentController.processRefund
);

// Get all payments (Admin only)
router.get(
  '/',
  auth('Admin', 'Super_Admin'),
  PaymentController.getAllPayments
);

// Get current user's payments
router.get(
  '/my-payments',
  auth('Common'),
  PaymentController.getUserPayments
);

// Get payment by ID
router.get(
  '/:id',
  auth('Common'),
  validateRequest(paymentValidations.getPaymentById),
  PaymentController.getPaymentById
);

export const PaymentRoutes = router;