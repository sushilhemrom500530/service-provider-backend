import { Router } from 'express';
import auth from '../../middlewares/auth';
import { NotificationController } from './notification.controllers';

const router = Router();
const anyone = auth('Admin', 'Provider', 'User');

// list (newest first) + alias used by the app today
router.get('/', anyone, NotificationController.getMyNotifications);
router.get('/all', anyone, NotificationController.getMyNotifications);

router.get('/unread-count', anyone, NotificationController.getUnreadCount);
router.patch('/read-all', anyone, NotificationController.markAllRead);
router.patch('/:id/read', anyone, NotificationController.markRead);

export const NotificationRoutes = router;
