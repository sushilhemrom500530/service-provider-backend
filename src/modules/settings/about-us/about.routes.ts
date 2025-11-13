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
  AboutUsController.addAboutIntoDB
);

// update 
router.patch(
  '/update/:id',
  // auth('Admin'), 
  AboutUsController.updateAboutFromDB
);
 
 
export const AboutUsRoutes = router;