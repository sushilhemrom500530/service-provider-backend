import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes'; 
import { About } from './about.model';
import { JwtPayload } from 'jsonwebtoken';
import { User } from './../../user/user.model';
import AppError from './../../../errors/AppErro';
// import { decode } from 'html-entities';
import { ISettings } from './../common/settings.interface';

const getAllAboutFromDB = async (user: JwtPayload) => {

  const existsUser = await User.findOne({
    email: user?.email,
    role: user?.role,
  });

  if (!existsUser) throw new AppError(StatusCodes.NOT_FOUND, "User not found.");

  const result =  await About.find({});

  return result;
};

 

const addAboutIntoDB = async (payload: ISettings, user: JwtPayload) => {

  if(!payload?.content) throw new AppError(StatusCodes.BAD_REQUEST, 'Missing required fields');

  const existsAbout = await About.findOne({});
  if (existsAbout) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'About already exists.');
  }

  // const rawContent = decode(payload.content);

  const isUserExists = await User.findOne({
    email: user?.email,
    role: user?.role,
  });

  if (!isUserExists) {
    throw new AppError(StatusCodes.NOT_FOUND, 'User not found.');
  }

  const result = await About.create({
    content: payload?.content,
    assignee: isUserExists.role || user?.role,
  });

  return result;
};

const updateAboutFromDB = async (
  id: string,
  payload: Partial<ISettings>,
  user: JwtPayload
) => {
  
  if(!payload?.content) throw new AppError(StatusCodes.BAD_REQUEST, 'Missing required fields');
  
  const isUserExists = await User.findOne({
    email: user?.email,
    role: user?.role,
  });

  if (!isUserExists) throw new AppError(StatusCodes.NOT_FOUND, "User not found.");

   
  const existsAbout = await About.findById(id);
  if (!existsAbout) throw new AppError(StatusCodes.NOT_FOUND, "About not found.");

  // Decode HTML if content is provided
//   if (payload.content) {
//     payload.content = decode(payload.content);
//   }
 
  const result = await About.findByIdAndUpdate(
    id,
    { ...payload },
    { new: true, runValidators: true }  
  );

  return result;
};

 
export const AboutUsService = {
  getAllAboutFromDB, 
  addAboutIntoDB,
  updateAboutFromDB, 
};
