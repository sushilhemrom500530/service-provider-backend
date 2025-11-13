import { Router } from 'express';  
import auth from './../../../middlewares/auth';
import { CustomerSupportController } from './customer.support.controller';
 
const router = Router();

// get all  
router.get(
  '/all',
  auth('User','Admin', 'Provider'), 
  CustomerSupportController.getSupport
);
 
// create 
router.post(
  '/create',
 auth('Admin','Provider', 'User'), 
  CustomerSupportController.createSupport
);

// update 
router.patch(
  '/update/:id',
  auth('Admin','Provider', 'User'), 
  CustomerSupportController.updateSupport
);

 
 
export const SupportRoutes = router; 