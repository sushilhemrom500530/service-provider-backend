import { Router } from 'express'; 
import { AboutUsController } from './about.controller';
import auth from './../../../middlewares/auth';
 
const router = Router();

// get all  
router.get(
  '/all',
  // auth('User','Admin','User', 'Provider'),
  // validateRequest(paymentValidations.processPayPalPayment),
  AboutUsController.getAllAboutFromDB
);

// get single   
router.get(
  '/:id',
  // auth('User','Admin'),
  AboutUsController.getSingleAboutFromDB
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

// delete 
router.delete(
  '/delete/:id',
  // auth('Admin'), 
  AboutUsController.deleteAboutFromDB
);

 
export const AboutUsRoutes = router;