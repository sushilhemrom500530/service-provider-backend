import { Router } from 'express'; 
import validateRequest from '../../shared/validateRequest';
import { paymentValidations } from './payment.validations';
import { WalletController } from './wallet.controller';
import auth from './../../middlewares/auth';

const router = Router();
 
router.patch(
  '/update-profit',
  auth('Admin'), 
  WalletController.updateWalletProfit
);

 
export const WalletRoutes = router;