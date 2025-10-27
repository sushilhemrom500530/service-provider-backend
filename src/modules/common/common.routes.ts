import { Router } from 'express'; 
import auth from './../../middlewares/auth'; 
import { CommonController } from './common.controller';
 
const router = Router();


router.get(
  '/ski-pass',
  auth('User', 'Admin', 'Provider'),
  CommonController.getSkiPassCategory
);


router.get(
  '/ski-hire',
  auth('User', 'Admin', 'Provider'),
  CommonController.getSkiHireCategory
);


router.get(
  '/restaurant',
  auth('User', 'Admin', 'Provider'),
  CommonController.getRestaurantCategory
);


router.get(
  '/transport',
  auth('User', 'Admin', 'Provider'),
  CommonController.getTransportCategory
);


router.get(
  '/massage',
  auth('User', 'Admin', 'Provider'),
  CommonController.getMassageCategory
);

export const CommonRoutes = router;
