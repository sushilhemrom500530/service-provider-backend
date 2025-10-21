interface IRegisterData {
  fullName: string;
  email: string;
  password: string;
  phoneNumber: string;
  dateOfBirth: Date;
}

interface ILoginData {
  email: string;
  password: string;
}

interface IVerifyOtpData {
  email: string;
  otp: string;
}

interface IForgotPasswordData {
  email: string;
}

interface IResendOtpData {
  email: string;
}

interface IResetPasswordData {
  newPassword: string;
}

interface ISocialUserData {
  id: string;
  email: string;
  name?: string;
  username?: string;
  verified?: boolean;
}
interface IGoogleAuthData {
  id: string;
  email: string;
  name?: string;
  token?: string;
}

interface ITwitterAuthData {
  id: string;
  username: string;
  name?: string;
  token?: string;
}

export {
  IRegisterData,
  ILoginData,
  IVerifyOtpData,
  IForgotPasswordData,
  IResendOtpData,
  IResetPasswordData,
  IGoogleAuthData,
  ITwitterAuthData,
};
