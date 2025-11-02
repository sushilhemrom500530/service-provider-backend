import { Router } from 'express'; 
import validateRequest from '../../shared/validateRequest';
import { paymentValidations } from './payment.validations'; 
import auth from './../../middlewares/auth'; 
import { WithdrawController } from './Withdraw.controller';
 
const router = Router();
  
router.get(
  '/all',
  auth('Admin'), 
  WithdrawController.getAllFromDB
);
  
router.post(
  '/send-request',
  auth('Provider'), 
  WithdrawController.sendWithdrawRequest
);

 
export const WithdrawRoutes = router;