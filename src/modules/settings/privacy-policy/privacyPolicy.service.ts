import { Types } from 'mongoose'; 
import { StatusCodes } from 'http-status-codes';
import { PrivacyPolicy } from './privacyPolicy.model';
import { JwtPayload } from 'jsonwebtoken';
import { About } from './../about-us/about.model';
import { User } from './../../user/user.model';
import { ISettings } from './../common/settings.interface';
import AppError from './../../../errors/AppErro';

const getAllPrivacyFromDB = async (user: JwtPayload) => {

  // const existsUser = await User.findOne({
  //   email: user?.email,
  //   role: user?.role,
  // }); 

  // if (!existsUser) throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  const result = await PrivacyPolicy.find({});
  console.log("find privacy policy", result);

  return result;
};

const addPrivacyIntoDB = async (payload: ISettings, user: JwtPayload) => {
   
   if(!payload?.content) throw new AppError(StatusCodes.BAD_REQUEST, 'Missing required fields');

  const existsPrivacy = await PrivacyPolicy.findOne({});
  if (existsPrivacy) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Privacy Policy already exists.'
    );
  }

//   const rawContent = decode(payload.content);

  // const isUserExists = await User.findOne({
  //   email: user?.email,
  //   role: user?.role,
  // });

  // if (!isUserExists) {
  //   throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  // }

  const result = await PrivacyPolicy.create({
    content: payload?.content,
    assignee: isUserExists.role || user?.role,
  });

  return result;
};

const updatePrivacyFromDB = async (
  id: string,
  payload: Partial<ISettings>,
  user: JwtPayload
) => {

   if(!payload?.content) throw new AppError(StatusCodes.BAD_REQUEST, 'Missing required fields');
   

  // const isUserExists = await User.findOne({
  //   email: user?.email,
  //   role: user?.role,
  // });

  // if (!isUserExists)
  //   throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  const existsPrivacy = await PrivacyPolicy.findById(id);
  if (!existsPrivacy)
    throw new AppError(StatusCodes.NOT_FOUND, 'Privacy Policy not found.');

  // Decode HTML if content is provided
  //   if (payload.content) {
  //     payload.content = decode(payload.content);
  //   }

  const result = await PrivacyPolicy.findByIdAndUpdate(
    id,
    { ...payload },
    { new: true, runValidators: true }
  );

  return result;
};

export const PrivacyPolicyService = {
  getAllPrivacyFromDB,
  addPrivacyIntoDB,
  updatePrivacyFromDB,
};
