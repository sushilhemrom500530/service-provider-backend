import { StatusCodes } from 'http-status-codes';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { MessageService } from './message.service';
import pick from '../../shared/pick';
import { Request, Response } from 'express';
import {
  IContent,
  IFileMetadata,
  IMessage,
  MessageType,
} from './message.interface';
import { MESSAGE_UPLOADS_FOLDER } from './message.constant';
import { Types } from 'mongoose';

const sendMessage = catchAsync(async (req, res) => {
 
  const result = await MessageService.sendMessage(req as Request);

  sendResponse(res, {
    code: StatusCodes.OK,
    message: 'Message sent successfully',
    data: result,
  });
});

export const MessageController = {
  sendMessage,
};
