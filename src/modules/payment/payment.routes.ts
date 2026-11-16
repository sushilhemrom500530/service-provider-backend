import { Router } from 'express';
import auth from '../../middlewares/auth';
import { PaymentController } from './payment.controller';

const router = Router();

// admin: all payments; customer: only their own
router.get('/all', auth('Admin', 'User'), PaymentController.getAllPayment);
router.get('/:id', auth('Admin'), PaymentController.findById);

export const PaymentRoutes = router;
