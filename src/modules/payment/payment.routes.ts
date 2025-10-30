import { Router } from 'express';
import auth from '../../middlewares/auth';
import { PaymentController } from './payment.controller';
import validateRequest from '../../shared/validateRequest';
import { paymentValidations } from './payment.validations';

const router = Router();
 
router.get(
  '/all',
  auth('User'), 
  PaymentController.getAllPayment
);

 
export const PaymentRoutes = router;