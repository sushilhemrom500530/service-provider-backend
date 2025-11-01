import { Router } from 'express'; 
import validateRequest from '../../shared/validateRequest'; 
import { WalletController } from './wallet.controller';
import auth from './../../middlewares/auth';
import { WalletValidations } from './wallet.validation';

const router = Router();
 
router.patch(
  '/update-profit',
  auth('Admin'), 
  WalletController.updateWalletProfit
);


router.get(
  '/get-balance',
  auth('Admin','Provider', 'User'), 
  WalletController.getBalanceById
);


router.post(
  '/add',
  auth('Admin', 'Provider'), 
  validateRequest(WalletValidations.addWallet),
  WalletController.addWallet
);

 
export const WalletRoutes = router;