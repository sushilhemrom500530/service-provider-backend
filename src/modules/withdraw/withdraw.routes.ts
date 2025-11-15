import { Router } from 'express'; 
// import validateRequest from '../../shared/validateRequest'; 
import auth from './../../middlewares/auth';  
import { WithdrawController } from './withdraw.controller';
 
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
  
router.patch(
  '/accept-request',
  auth('Admin'), 
  WithdrawController.acceptWithdrawRequest
);

 
export const WithdrawRoutes = router;