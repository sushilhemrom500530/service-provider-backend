import { Router } from 'express'; 
import { PrivacyPolicyController } from './privacyPolicy.controller';
import auth from './../../../middlewares/auth';
 
const router = Router();

// get all  
router.get(
  '/all',
  // auth('User','Admin','User', 'Provider'),
  // validateRequest(paymentValidations.processPayPalPayment),
  PrivacyPolicyController.getAllPrivacyFromDB
);

// get single   
router.get(
  '/:id',
  // auth('User','Admin'),
  PrivacyPolicyController.getSinglePrivacyFromDB
);


// create 
router.post(
  '/create',
  // auth('Admin'),
  // validateRequest(paymentValidations.processPayPalPayment),
  PrivacyPolicyController.addPrivacyIntoDB
);

// update 
router.patch(
  '/update/:id',
  // auth('Admin'),
  // validateRequest(paymentValidations.processPayPalPayment),
  PrivacyPolicyController.updatePrivacyFromDB
);

// delete 
router.delete(
  '/delete/:id',
  // auth('Admin'), 
  PrivacyPolicyController.deletePrivacyFromDB
);

 
export const PrivacyPolicyRoutes = router; 