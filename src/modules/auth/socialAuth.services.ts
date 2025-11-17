// import { User } from '../user/user.model';
// import { AuthMethod, IUser, UserStatus } from '../user/user.interface';
// import { TokenService } from '../token/token.services';
// import AppError from '../../errors/AppErro';
// import { StatusCodes } from 'http-status-codes';

// interface ISocialUserData {
//   id: string;
//   email: string;
//   name?: string;
//   username?: string;
//   verified?: boolean;
// }

// interface ISocialAuthResponse {
//   user: {
//     _id: string;
//     email: string;
//     role: string;
//     status: string;
//     profile: any;
//     authMethods: AuthMethod[];
//     primaryAuthMethod: AuthMethod;
//     metadata: any;
//   };
//   tokens: {
//     accessToken: string;
//     refreshToken: string;
//   };
//   isNewUser: boolean;
//   linkedAccount: boolean;
// }

// // Unified social authentication handler
// const handleSocialAuth = async (
//   provider: AuthMethod,
//   userData: ISocialUserData
// ): Promise<ISocialAuthResponse> => {
//   try {
//     // Check if user exists with this email
//     const existingUser = await User.findOne({ email: userData.email });

//     if (existingUser) {
//       // Check if the user already has this social account linked
//       const socialField =
//         provider === AuthMethod.Google
//           ? 'google'
//           : provider === AuthMethod.Twitter
//           ? 'twitter'
//           : 'facebook';

//       const existingSocialId = existingUser.socialAccounts?.[socialField]?.id;

//       if (existingSocialId && existingSocialId !== userData.id) {
//         throw new AppError(
//           StatusCodes.CONFLICT,
//           `This email is already linked to a different ${provider} account. Please use the correct ${provider} account or sign in with email/password.`
//         );
//       }

//       // Check if user already has a password (email auth) and this is first time linking social
//       if (
//         existingUser.authMethods.includes(AuthMethod.Email) &&
//         !existingUser.authMethods.includes(provider)
//       ) {
//         throw new AppError(
//           StatusCodes.CONFLICT,
//           `This email (${userData.email}) is already registered with email/password. Please sign in with your password first, then link your ${provider} account from settings.`
//         );
//       }

//       // If social account already exists, just login
//       if (existingUser.authMethods.includes(provider)) {
//         // Update social account info
//         const updatedSocialAccounts = { ...existingUser.socialAccounts };
//         updatedSocialAccounts[socialField] = {
//           id: userData.id,
//           email: userData.email,
//           name: userData.name,
//           username: userData.username || '',
//           verified: userData.verified || true,
//           linkedAt:
//             existingUser.socialAccounts[socialField]?.linkedAt || new Date(),
//         };

//         existingUser.socialAccounts = updatedSocialAccounts;

//         // Update profile if name is provided and profile is empty
//         if (userData.name && !existingUser.profile?.fullName) {
//           existingUser.profile = {
//             ...existingUser.profile,
//             fullName: userData.name,
//           };
//         }

//         // Activate user if they were unverified
//         if (existingUser.status === UserStatus.Unverified) {
//           existingUser.status = UserStatus.Active;
//         }

//         await existingUser.save();

//         const tokens = await TokenService.accessAndRefreshToken(existingUser);

//         return {
//           user: formatUserResponse(existingUser),
//           tokens,
//           isNewUser: false,
//           linkedAccount: false,
//         };
//       }
//     }

//     // If no existing user, create new user with social auth only
//     if (!existingUser) {
//       const socialAccountData = {
//         [provider === AuthMethod.Google
//           ? 'google'
//           : provider === AuthMethod.Twitter
//           ? 'twitter'
//           : 'facebook']: {
//           id: userData.id,
//           email: userData.email,
//           name: userData.name,
//           username: userData.username,
//           verified: userData.verified || true,
//           linkedAt: new Date(),
//         },
//       };

//       const newUser = await User.create({
//         email: userData.email,
//         // No password required for social-only accounts
//         authMethods: [provider],
//         primaryAuthMethod: provider,
//         status: UserStatus.Active,
//         profile: {
//           fullName: userData.name,
//         },
//         socialAccounts: socialAccountData,
//       });

//       const tokens = await TokenService.accessAndRefreshToken(newUser);

//       return {
//         user: formatUserResponse(newUser),
//         tokens,
//         isNewUser: true,
//         linkedAccount: false,
//       };
//     }

//     throw new AppError(
//       StatusCodes.INTERNAL_SERVER_ERROR,
//       'Unexpected error during social authentication'
//     );
//   } catch (error) {
//     if (error instanceof AppError) {
//       throw error;
//     }

//     console.error(`${provider} authentication error:`, error);
//     throw new AppError(
//       StatusCodes.INTERNAL_SERVER_ERROR,
//       `Error processing ${provider} authentication`
//     );
//   }
// };

// // Link social account to existing user (for users who are already logged in)
// const linkSocialAccount = async (
//   userId: string,
//   provider: AuthMethod,
//   userData: ISocialUserData
// ): Promise<{ success: boolean; message: string }> => {
//   try {
//     const user = await User.findById(userId);

//     if (!user) {
//       throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
//     }

//     // Check if this social account is already linked to another user
//     const socialField =
//       provider === AuthMethod.Google
//         ? 'google'
//         : provider === AuthMethod.Twitter
//         ? 'twitter'
//         : 'facebook';

//     const existingUserWithSocial = await User.findOne({
//       [`socialAccounts.${socialField}.id`]: userData.id,
//       _id: { $ne: userId },
//     });

//     if (existingUserWithSocial) {
//       throw new AppError(
//         StatusCodes.CONFLICT,
//         `This ${provider} account is already linked to another user account.`
//       );
//     }

//     // Check if user already has this provider linked
//     if (user.authMethods.includes(provider)) {
//       throw new AppError(
//         StatusCodes.CONFLICT,
//         `Your account is already linked to a ${provider} account.`
//       );
//     }

//     // Link the social account
//     const updatedSocialAccounts = { ...user.socialAccounts };
//     updatedSocialAccounts[socialField] = {
//       id: userData.id,
//       email: userData.email,
//       name: userData.name,
//       username: userData.username || '',
//       verified: userData.verified || true,
//       linkedAt: new Date(),
//     };

//     user.socialAccounts = updatedSocialAccounts;
//     user.authMethods.push(provider);

//     await user.save();

//     return {
//       success: true,
//       message: `${provider} account linked successfully`,
//     };
//   } catch (error) {
//     if (error instanceof AppError) {
//       throw error;
//     }

//     throw new AppError(
//       StatusCodes.INTERNAL_SERVER_ERROR,
//       `Error linking ${provider} account`
//     );
//   }
// };

// // Unlink social account
// const unlinkSocialAccount = async (
//   userId: string,
//   provider: AuthMethod
// ): Promise<{ success: boolean; message: string }> => {
//   try {
//     const user = await User.findById(userId);

//     if (!user) {
//       throw new AppError(StatusCodes.NOT_FOUND, 'User not found');
//     }

//     // Cannot unlink if it's the only auth method
//     if (user.authMethods.length === 1 && user.authMethods.includes(provider)) {
//       throw new AppError(
//         StatusCodes.BAD_REQUEST,
//         `Cannot unlink ${provider}. You must have at least one authentication method. Please set a password first.`
//       );
//     }

//     // Remove from auth methods
//     user.authMethods = user.authMethods.filter(method => method !== provider);

//     // Update primary auth method if needed
//     if (user.primaryAuthMethod === provider) {
//       user.primaryAuthMethod = user.authMethods[0];
//     }

//     // Remove social account data
//     const socialField =
//       provider === AuthMethod.Google
//         ? 'google'
//         : provider === AuthMethod.Twitter
//         ? 'twitter'
//         : 'facebook';

//     const updatedSocialAccounts = { ...user.socialAccounts };
//     delete updatedSocialAccounts[socialField];
//     user.socialAccounts = updatedSocialAccounts;

//     await user.save();

//     return {
//       success: true,
//       message: `${provider} account unlinked successfully`,
//     };
//   } catch (error) {
//     if (error instanceof AppError) {
//       throw error;
//     }

//     throw new AppError(
//       StatusCodes.INTERNAL_SERVER_ERROR,
//       `Error unlinking ${provider} account`
//     );
//   }
// };

// // Helper function to format user response
// const formatUserResponse = (user: IUser) => ({
//   _id: user._id.toString(),
//   email: user.email,
//   role: user.role,
//   status: user.status,
//   profile: user.profile,
//   authMethods: user.authMethods,
//   primaryAuthMethod: user.primaryAuthMethod,
//   metadata: {
//     createdAt: user.metadata?.createdAt,
//     updatedAt: user.metadata?.updatedAt,
//     lastLoginAt: user.metadata?.lastLoginAt,
//   },
// });

// // Specific handlers for backward compatibility
// const handleGoogleAuth = async (googleUser: {
//   id: string;
//   email: string;
//   name?: string;
// }) => {
//   return handleSocialAuth(AuthMethod.Google, {
//     id: googleUser.id,
//     email: googleUser.email,
//     name: googleUser.name,
//     verified: true,
//   });
// };

// const handleTwitterAuth = async (twitterUser: {
//   id: string;
//   username?: string;
//   name?: string;
//   email?: string;
// }) => {
//   if (!twitterUser.email) {
//     throw new AppError(
//       StatusCodes.BAD_REQUEST,
//       'Twitter authentication requires email access. Please enable email permissions in your Twitter app settings.'
//     );
//   }

//   return handleSocialAuth(AuthMethod.Twitter, {
//     id: twitterUser.id,
//     email: twitterUser.email,
//     name: twitterUser.name,
//     username: twitterUser.username,
//     verified: true,
//   });
// };

// export const SocialAuthService = {
//   handleSocialAuth,
//   handleGoogleAuth,
//   handleTwitterAuth,
//   linkSocialAccount,
//   unlinkSocialAccount,
// };
