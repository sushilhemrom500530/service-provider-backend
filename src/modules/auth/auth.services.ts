import bcrypt from 'bcrypt';
import { config } from '../../config';
import { TokenType } from '../token/token.interface';
import { OtpType } from '../otp/otp.interface';
import moment from 'moment';
import { Token } from '../token/token.model';
import AppError from '../../errors/AppErro';
import { AuthMethod, IUser, UserStatus } from '../user/user.interface';
import { StatusCodes } from 'http-status-codes';
import { OtpService } from '../otp/otp.services';
import { TokenService } from '../token/token.services';
import { IRegisterData, IVerifyOtpData } from './auth.interface';
import { User } from './../user/user.model';

// Move validateUserStatus here to avoid circular dependency
const validateUserStatus = (user: IUser) => {
  if (user?.status === UserStatus.Blocked) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'User account is blocked.');
  } else if (user?.status === UserStatus.Inactive) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'User account is inactive.');
  } else if (user?.status === UserStatus.Banned) {
    if (user?.banExpiresAt && user?.banExpiresAt > new Date()) {
      throw new AppError(StatusCodes.BAD_REQUEST, 'User account is banned.');
    }
  } else if (user?.status === UserStatus.Delete) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'User account is deleted.');
  }
};

const registerUser = async (userData: Partial<IUser>) => {
  const existingUser = await User.findOne({ email: userData?.email });
  if (existingUser) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'User already exists.');
  }
  const isTypeOfSkiPass = await User.find({
    email: userData?.email,
    providerType: 'Ski_Pass',
  });

  if (userData?.providerType === 'Ski_Pass') {
    const existingSkiPassProvider = await User.findOne({
      providerType: 'Ski_Pass',
    });
    if (existingSkiPassProvider) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        'Only one user can be the Ski Pass provider.'
      );
    }
  }
  const newUser = await User.create(userData);

  // console.log("creating user info is :", newUser);

  // Step 4: Send verification OTP
  // try {
  //   await OtpService.createVerificationEmailOtp(newUser?.email);
  // } catch (error) {
  //   throw new AppError(
  //     StatusCodes.INTERNAL_SERVER_ERROR,
  //     'Failed to send verification email.'
  //   );
  // }

  // Step 5: Generate tokens
  const tokens = await TokenService.accessAndRefreshToken(newUser);

  return {
    tokens,
    newUser,
  };
};

// Step 6: Update user profile after registration
const updateUserProfile = async (email: string, updates: Partial<IUser>) => {
  const updatedUser = await User.findOneAndUpdate(
    { email },
    { $set: updates },
    { new: true }
  );

  if (!updatedUser) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  return updatedUser;
};

  

const verifyOtp = async (payload: IVerifyOtpData) => {
  const user = await User.findOne({ email: payload.email });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  validateUserStatus(user);

  await OtpService.verifyOTP(
    user.email,
    payload.otp
    // user.isResetPassword ? OtpType.RESET_PASSWORD : OtpType.VERIFY
  );

  // Update user status based on OTP type
  if (!user.isResetPassword) {
    // Email verification
    user.status = UserStatus.Active;
  }
  await user.save();

  return {
    message: user.isResetPassword
      ? 'OTP verified. You can now reset your password.'
      : 'Email verified successfully. Your account is now active.',
    email: user.email,
    verified: true,
  };
};

const forgotPassword = async (email: string) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  validateUserStatus(user);

  await OtpService.createResetPasswordOtp(user?.email);
  user.isResetPassword = true;
  await user.save();

  return {
    message: 'Password reset OTP sent to your email.',
    email: user.email,
  };
};

const resendOtp = async (email: string) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  validateUserStatus(user);

  let message: string;

  if (user) {
    await OtpService.createResetPasswordOtp(user.email);
    message = 'Password reset OTP has been resent to your email.';
  }
  // else {
  //   // Check if user is already verified
  //   if (user.status === UserStatus.Active) {
  //     throw new AppError(
  //       StatusCodes.BAD_REQUEST,
  //       'Your account is already verified.'
  //     );
  //   }
  //   await OtpService.createVerificationEmailOtp(user.email);
  //   message = 'Verification OTP has been resent to your email.';
  // }

  return {
    message,
    email: user.email,
  };
};

const resetPassword = async (email: string, password: string) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  validateUserStatus(user);

  console.log('User: ', user);

  // Verify that password reset was requested
  // if (!user.isResetPassword) {
  //   throw new AppError(
  //     StatusCodes.BAD_REQUEST,
  //     'Password reset was not requested. Please request password reset first.'
  //   );
  // }

  user.password = password;
  user.isResetPassword = false;
  // user.security.lastPasswordChange = new Date();
  await user.save();

  return {
    message: 'Password reset successfully.',
    email: user.email,
  };
};

const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string
) => {
  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  validateUserStatus(user);

  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) {
    throw new AppError(
      StatusCodes.UNAUTHORIZED,
      'Current password is incorrect.'
    );
  }

  // Check if new password is same as current
  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'New password must be different from current password.'
    );
  }

  user.password = newPassword;
  // user.security.lastPasswordChange = new Date();
  await user.save();

  return {
    message: 'Password changed successfully.',
    userId: user._id,
  };
};

const logout = async (refreshToken: string) => {
  const token = await Token.findOneAndDelete({
    token: refreshToken,
    type: TokenType.REFRESH,
  });

  if (!token) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid refresh token.');
  }

  return {
    message: 'Logged out successfully.',
  };
};

const refreshAuth = async (refreshToken: string) => {
  const payload = await TokenService.verifyToken(
    refreshToken,
    config.jwt.refreshSecret,
    TokenType.REFRESH
  );

  const user = await User.findById(payload?.userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  validateUserStatus(user);

  // Update last login metadata
  user.metadata.lastLoginAt = new Date();
  await user.save();

  // Delete old refresh token
  await Token.deleteOne({ token: refreshToken, type: TokenType.REFRESH });

  // Generate new tokens
  const tokens = await TokenService.accessAndRefreshToken(user);

  return {
    tokens,
    user: {
      _id: user._id,
      email: user.email,
      role: user.role,
      authMethods: user.authMethods,
      primaryAuthMethod: user.primaryAuthMethod,
    },
  };
};

export const AuthService = {
  registerUser,
  updateUserProfile, 
  verifyOtp,
  resetPassword,
  forgotPassword,
  resendOtp,
  logout,
  changePassword,
  refreshAuth,
};
