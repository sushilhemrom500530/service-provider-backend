import { Router } from 'express';
import auth from '../../middlewares/auth';
import { NotificationController } from './notification.controllers';

const router = Router();

router.get(
  '/all',
  auth('Admin', 'Provider', 'User'),
  NotificationController.getALLNotification
);
 
export const NotificationRoutes = router;