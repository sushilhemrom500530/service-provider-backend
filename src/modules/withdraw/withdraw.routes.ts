import { Router } from 'express'; 
import validateRequest from '../../shared/validateRequest';
import { paymentValidations } from './payment.validations'; 
import auth from './../../middlewares/auth'; 
import { WithdrawController } from './Withdraw.controller';
 
const router = Router();
 
// router.patch(
//   '/update-profit',
//   auth('Admin'), 
//   WalletController.updateWalletProfit
// );
 
router.get(
  '/all',
  auth('Admin'), 
  WithdrawController.getAllFromDB
);

 
export const WithdrawRoutes = router;