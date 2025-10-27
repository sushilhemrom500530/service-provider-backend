import { Router } from 'express';
import { authValidations } from './auth.validations';
import validateRequest from '../../shared/validateRequest';
import { AuthController } from './auth.controller';
import auth from './../../middlewares/auth';
const router = Router();



router.post(
  '/register',   
    validateRequest(authValidations.registerProviderSchema),  
  AuthController.register
);
 

router.post(
  '/verify-otp',
  validateRequest(authValidations.verifyOTP),
  AuthController.verifyOtp
);
 
router.post(
  '/login',
  //  auth('Admin', 'User', 'Provider'),
  validateRequest(authValidations.login),
  AuthController.login
);

 
router.post('/resend-otp',
    validateRequest(authValidations.sendOTP),
   AuthController.resendOtp
  );
 
router.post(
  '/forgot-password',
  validateRequest(authValidations.forgotPassword),
  AuthController.forgotPassword
);
 
router.post(
  '/reset-password', 
  validateRequest(authValidations.resetPassword),
  AuthController.resetPassword
);
 
router.post(
  '/refresh-token',
  validateRequest(authValidations.refreshToken),
  AuthController.refreshToken
);

router.post(
  '/change-password',
   auth('Admin', 'User', 'Provider'),
  validateRequest(authValidations.changePassword),
  AuthController.changePassword
);


router.post(
  '/logout',
  // validateRequest(authValidations.logout),
  
  AuthController.logout
);
 
 
export const AuthRoutes = router;
