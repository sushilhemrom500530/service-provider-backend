import { Router } from 'express';
import fileUploadHandler from '../../shared/fileUploadHandler';
import { MESSAGE_UPLOADS_FOLDER } from './message.constant';
import { MessageController } from './message.controller';
import convertHeicToPngMiddleware from '../../shared/convertHeicToPngMiddleware';
import auth from '../../middlewares/auth';
import validateRequest from '../../shared/validateRequest';
import { messageValidations } from './message.validations';
const upload = fileUploadHandler(MESSAGE_UPLOADS_FOLDER);

const router = Router();

// send message

router.post(
  '/send',
   auth('User'), 
   MessageController.sendMessage
  );

export const MessageRoutes = router;
