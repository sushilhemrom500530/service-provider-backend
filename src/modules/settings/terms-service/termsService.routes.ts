import { Router } from 'express'; 
import { TermsAndServiceController } from './termsService.controller';
import auth from './../../../middlewares/auth';
 
const router = Router();

// get all  
router.get(
  '/all',
  // auth('User','Admin','User', 'Provider'),
  // validateRequest(paymentValidations.processPayPalPayment),
  TermsAndServiceController.getAllTermsFromDB
);

// get single   
router.get(
  '/:id',
  // auth('User','Admin'),
  TermsAndServiceController.getSingleTermsFromDB
);


// create 
router.post(
  '/create',
  // auth('Admin'),
  // validateRequest(paymentValidations.processPayPalPayment),
  TermsAndServiceController.addTermsIntoDB
);

// update 
router.patch(
  '/update/:id',
  // auth('Admin'),
  // validateRequest(paymentValidations.processPayPalPayment),
  TermsAndServiceController.updateTermsFromDB
);

// delete 
router.delete(
  '/delete/:id',
  // auth('Admin'), 
  TermsAndServiceController.deleteTermsFromDB
);

 
export const TermsAndServiceRoutes = router; 