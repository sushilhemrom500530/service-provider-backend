import { StatusCodes } from 'http-status-codes';
import Chat from '../chat/chat.model';
import { IMessage } from './message.interface';
import Message from './message.model';
import { User } from '../user/user.model';
import { Types } from 'mongoose';
import { ChatService } from '../chat/chat.service';
import { IPaginationOptions, IPaginationResult } from '../../types/pagination';
import AppError from '../../errors/AppErro';
import { Request } from 'express';
import { s3Services } from './../../aws/s3Service';
import { MESSAGE_UPLOADS_FOLDER } from './message.constant';

// Send a message
const sendMessage = async (req: Request) => {
  const senderId = req.user?.userId;
  const { receiverId, text }: IMessage = req.body;

  if (!senderId || !receiverId) {
    throw new Error('Sender ID and Receiver ID are required');
  }

  let image: string | undefined;
 
  if (req.file) {
    image = await s3Services.uploadSingleFileToS3(
      req.file,
      MESSAGE_UPLOADS_FOLDER
    );
  }
 
  const messageData: Partial<IMessage> = {
    senderId,
    receiverId,
    text,
    image,
  };
 
  const newMessage = await Message.create(messageData);
 
  const io = (global as any).io as Server;
  const receiverSocketId = userSocketMap[receiverId];

  if (io && receiverSocketId) {
    io.to(receiverSocketId).emit('newMessage', newMessage);
  }
  return newMessage;
};

export const MessageService = {
  sendMessage,
};
