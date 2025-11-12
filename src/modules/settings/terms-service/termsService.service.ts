import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import { User } from './../../user/user.model';
import AppError from './../../../errors/AppErro';
import { TermsAndService } from './termsService.model';
import { ISettings } from './../common/settings.interface';

const getAllTermsFromDB = async (user: JwtPayload) => {
  // const existsUser = await User.findOne({
  //   email: user?.email,
  //   role: user?.role,
  // });

  // if (!existsUser) throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');

  const result = await TermsAndService.find({});

  return result;
};

const addTermsIntoDB = async (payload: ISettings, user: JwtPayload) => {
  if (!payload?.content)
    throw new AppError(StatusCodes.BAD_REQUEST, 'Missing required fields');

  const existsTerms = await TermsAndService.findOne({});
  if (existsTerms) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'Terms And Service already exists.'
    );
  }

  // const rawContent = decode(payload.content);

  // const isUserExists = await User.findOne({
  //   email: user?.email,
  //   role: user?.role,
  // });

  // if (!isUserExists) {
  //   throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  // }

  const result = await TermsAndService.create({
    content: payload?.content,
    assignee: isUserExists.role || user?.role,
  });

  return result;
};

const updateTermsFromDB = async (
  id: string,
  payload: Partial<ISettings>,
  user: JwtPayload
) => {
  if (!payload?.content)
    throw new AppError(StatusCodes.BAD_REQUEST, 'Missing required fields');

  // const isUserExists = await User.findOne({
  //   email: user?.email,
  //   role: user?.role,
  // });

  // if (!isUserExists) throw new AppError(StatusCodes.NOT_FOUND, "User not found.");

  const existsTerms = await TermsAndService.findById(id);
  if (!existsTerms)
    throw new AppError(StatusCodes.NOT_FOUND, 'Terms And Service not found.');

  // Decode HTML if content is provided
  //   if (payload.content) {
  //     payload.content = decode(payload.content);
  //   }

  const result = await TermsAndService.findByIdAndUpdate(
    id,
    { ...payload },
    { new: true, runValidators: true }
  );

  return result;
};

export const TermsAndServiceService = {
  getAllTermsFromDB,
  addTermsIntoDB,
  updateTermsFromDB,
};
