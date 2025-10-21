import { Router } from 'express';
import auth from '../../middlewares/auth';
import {SkiPassController} from './skipass.controller';
 
const router = Router();

// get all ski pass
router.get(
  '/all',
  // auth('User','Admin', 'Provider'),
  // validateRequest(paymentValidations.processPayPalPayment),
  SkiPassController.getAllSkiPassFromDB
);

// get single ski pass 
router.get(
  '/:id',
  // auth('User','Admin', 'Provider'),
  // validateRequest(paymentValidations.processPayPalPayment),
  SkiPassController.getSingleSkipPassFromDB
);


// create ski pass 
router.post(
  '/create',
  auth('Admin', 'Provider'),
  // validateRequest(paymentValidations.processPayPalPayment),
  SkiPassController.addSkiPassIntoDB
);

 
export const SkiPassRoutes = router;