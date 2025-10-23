import { Router } from 'express'; 
import { TermsAndServiceController } from './termsService.controller';
import auth from './../../../middlewares/auth';
 
const router = Router();

// get all  
router.get(
  '/all',
  auth('User','Admin', 'Provider'), 
  TermsAndServiceController.getAllTermsFromDB
);

 
// create 
router.post(
  '/create',
  auth('Admin'),
  // validateRequest(paymentValidations.processPayPalPayment),
  TermsAndServiceController.addTermsIntoDB
);

// update 
router.patch(
  '/update/:id',
  auth('Admin'),
  // validateRequest(paymentValidations.processPayPalPayment),
  TermsAndServiceController.updateTermsFromDB
);
 

 
export const TermsAndServiceRoutes = router; 