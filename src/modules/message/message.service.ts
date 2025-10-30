import { StatusCodes } from 'http-status-codes';
import Chat from '../chat/chat.model';
import { IMessage } from './message.interface';
import Message from './message.model';
import { User } from '../user/user.model';
import { Types } from 'mongoose';
import { ChatService } from '../chat/chat.service';
import { IPaginationOptions, IPaginationResult } from '../../types/pagination';
import AppError from '../../errors/AppErro';


// Send a message
const sendMessage = async (payload: Partial<IMessage>) => {
  if (!payload?.senderId || !payload?.receiverId || !payload?.text) {
    throw new AppError(StatusCodes.BAD_REQUEST, 'Missing required fields');
  }
  let chatId: string = '';
   

  return payload;
};
 
export const MessageService = { 
  sendMessage, 
};
