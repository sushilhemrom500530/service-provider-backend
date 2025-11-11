import { Router } from 'express'; 
import { AboutUsController } from './about.controller';
import auth from './../../../middlewares/auth';
 
const router = Router();

// get all  
router.get(
  '/all',
  // auth('User','Admin', 'Provider'), 
  AboutUsController.getAllAboutFromDB
);
 

// create 
router.post(
  '/create',
  // auth('Admin'),
  // validateRequest(paymentValidations.processPayPalPayment),
  AboutUsController.addAboutIntoDB
);

// update 
router.patch(
  '/update/:id',
  // auth('Admin'),
  // validateRequest(paymentValidations.processPayPalPayment),
  AboutUsController.updateAboutFromDB
);
 
 
export const AboutUsRoutes = router;