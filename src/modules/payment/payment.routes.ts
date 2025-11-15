import { Router } from 'express';
import auth from '../../middlewares/auth';
import { PaymentController } from './payment.controller';
import validateRequest from '../../shared/validateRequest'; 

const router = Router();
 
router.get(
  '/all',
  auth('Admin','User'), 
  PaymentController.getAllPayment
);
 
router.get(
  '/:id',
  auth('Admin'), 
  PaymentController.findById
);
 
router.delete(
  '/delete/:id',
  auth('Admin'), 
  PaymentController.deletePayment
);

 
export const PaymentRoutes = router;