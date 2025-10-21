import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { config } from '../../config';
import moment from 'moment';
import bcrypt from 'bcrypt';
import { User } from '../user/user.model';
import { AuthMethod, IUser, UserStatus } from '../user/user.interface';
import AppError from '../../errors/AppErro';
import { TokenService } from '../token/token.services';
import { AuthService } from './auth.services';
import { OtpService } from '../otp/otp.services';
import { SocialAuthService } from './socialAuth.services';

// Moved validateUserStatus to AuthService to avoid circular dependency
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


const register = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.registerUser(req.body);

  sendResponse(res, {
    code: StatusCodes.CREATED,
    message:
      'User created successfully. Please check your email for verification code.',
    data: result,
  });
});

const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const { email } = req.user; // if JWT middleware populates req.user
  const result = await AuthService.updateUserProfile(email, req.body);

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'User profile updated successfully.',
    data: result,
  });
});



// const register = catchAsync(async (req, res) => {
//   const result = await AuthService.registerUser(req.body)
//   sendResponse(res, {
//     code: StatusCodes.CREATED,
//     message:
//       'User created successfully. Please check your email for verification code.',
//     data: result,
//   });
// });

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid credentials.');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password); 
  if (!isPasswordValid) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'password is incorrect.');
  }
 
  if (user?.status === UserStatus.Unverified) {
    await OtpService.createVerificationEmailOtp(user?.email);
    sendResponse(res, {
      code: StatusCodes.OK,
      message: 'Email is not verified. Please verify your email.',
      data: null,
    });
    return;
  }

  await user.save();

  const tokens = await TokenService.accessAndRefreshToken(user);
  // Set cookies for access and refresh tokens
  res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: config.environment === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
  const formatedUserData = {
    _id: user?.id,
    email: user?.email,
    role: user?.role,
    status: user?.status,
    profile: user?.profile,
    metadata: {
      createdAt: user?.metadata?.createdAt,
      updatedAt: user?.metadata?.updatedAt,
    },
  };
  // Send response with tokens
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'User logging in successfully.',
    data: { user: formatedUserData, tokens },
  });
});



const verifyOtp = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  const result = await AuthService.verifyOtp({ email, otp });
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'OTP verified successfully.',
    data: result,
  });
});

const resendOtp = catchAsync(async (req, res) => {
  const { email } = req.body;
  const result = await AuthService.resendOtp(email);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'A new OTP has been sent to your email. Please check your inbox',
    data: result,
  });
});

const forgotPassword = catchAsync(async (req, res) => {
  const result = await AuthService.forgotPassword(req.body.email);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'A OTP has been sent to your email. Please check your inbox',
    data: result,
  });
});
 
const changePassword = catchAsync(async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError(StatusCodes.UNAUTHORIZED, 'User not authenticated');
  }
  const { currentPassword, newPassword  } = req.body;
// mfaToken
  await User.findById(userId).select('+mfaSecret');

  const result = await AuthService.changePassword(
    userId,
    currentPassword,
    newPassword
  );
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Password changed successfully.',
    data: result,
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const { email, newPassword } = req.body;
  const result = await AuthService.resetPassword(email, newPassword);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Password reset successfully.',
    data: result,
  });
});

const logout = catchAsync(async (req, res) => {
  //get refresh token from cookies
  const { refreshToken } = req.body;
  if (!refreshToken) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Refresh token is required.');
  }
  await AuthService.logout(refreshToken);
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'User logged out successfully.',
    data: null,
  });
});

const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Refresh token is required.');
  }
  const tokens = await AuthService.refreshAuth(refreshToken);
  res.cookie('accessToken', tokens.tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('refreshToken', tokens.tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Refresh token retrieved successfully.',
    data: tokens,
  });
});

 
 const getLinkedAccounts = catchAsync(async (req, res) => {
  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Linked accounts fetched successfully.',
    data: [], // or your real logic
  });
});
 

export const AuthController = {
  register,
  updateProfile,
  login,
  verifyOtp,
  resendOtp,
  logout,
  changePassword,
  refreshToken,
  forgotPassword,
  resetPassword, 
  getLinkedAccounts
};
