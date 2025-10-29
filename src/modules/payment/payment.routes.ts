import { Router } from 'express';
import auth from '../../middlewares/auth';
import { PaymentController } from './payment.controller';
import validateRequest from '../../shared/validateRequest';
import { paymentValidations } from './payment.validations';

const router = Router();

// Process PayPal payment
router.post(
  '/payment-request',
  auth('User'),
  // validateRequest(paymentValidations.processToPayment),
  PaymentController.processToPayment
);
 
export const PaymentRoutes = router;