import { Router } from 'express'; 
import { PrivacyPolicyController } from './privacyPolicy.controller';
import auth from './../../../middlewares/auth';
 
const router = Router();

// get all  
router.get(
  '/all',
  auth('User','Admin', 'Provider'), 
  PrivacyPolicyController.getAllPrivacyFromDB
);

 

// create 
router.post(
  '/create',
  auth('Admin'),
  // validateRequest(paymentValidations.processPayPalPayment),
  PrivacyPolicyController.addPrivacyIntoDB
);

// update 
router.patch(
  '/update/:id',
  auth('Admin'),
  // validateRequest(paymentValidations.processPayPalPayment),
  PrivacyPolicyController.updatePrivacyFromDB
);

 
 
export const PrivacyPolicyRoutes = router; 