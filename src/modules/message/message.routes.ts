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

// unviewed message count
router.get(
  '/unviewed-count',
  auth('Common'),
  validateRequest(messageValidations.unviewedMessagesCount),
  MessageController.unviewedMessagesCount
);

// send message
router
  .route('/send-message')
  .post(
    auth('Common'),
    upload.array('files', 10),
    convertHeicToPngMiddleware(MESSAGE_UPLOADS_FOLDER),
    validateRequest(messageValidations.sendMessage),
    MessageController.sendMessage
  );

// get all messages by receiverId
router.get(
  '/get-all-messages/:receiverId',
  auth('Common'),
  validateRequest(messageValidations.getAllMessagesByReceiverId),
  MessageController.getAllMessagesByReceiverId
);

// get single message
router
  .route('/:messageId')
  .put(
    auth('Common'),
    validateRequest(messageValidations.updateMessage),
    MessageController.updateMessage
  )
  .patch(
    auth('Common'),
    validateRequest(messageValidations.markMessageSeen),
    MessageController.markMessageSeen
  )
  .delete(
    auth('Common'),
    validateRequest(messageValidations.deleteMessage),
    MessageController.deleteMessage
  );

// Additional routes for new features
router.patch(
  '/view-all-messages/:chatId',
  auth('Common'),
  validateRequest(messageValidations.viewAllMessages),
  MessageController.viewAllMessages
);
router.post(
  '/reaction/:messageId',
  auth('Common'),
  validateRequest(messageValidations.addReaction),
  MessageController.addReaction
);
router.delete(
  '/reaction/:messageId',
  auth('Common'),
  validateRequest(messageValidations.removeReaction),
  MessageController.removeReaction
);
router.post(
  '/reply',
  auth('Common'),
  upload.array('files', 10),
  convertHeicToPngMiddleware(MESSAGE_UPLOADS_FOLDER),
  validateRequest(messageValidations.replyToMessage),
  MessageController.replyToMessage
);

router.post(
  '/:messageId/forward',
  auth('Common'),
  validateRequest(messageValidations.forwardMessage),
  MessageController.forwardMessage
);
router.post(
  '/:messageId/pin/:chatId',
  auth('Common'),
  validateRequest(messageValidations.pinMessage),
  MessageController.pinMessage
);
router.post(
  '/:messageId/unpin/:chatId',
  auth('Common'),
  validateRequest(messageValidations.unpinMessage),
  MessageController.unpinMessage
);

router.get(
  '/:chatId/search',
  auth('Common'),
  validateRequest(messageValidations.searchMessages),
  MessageController.searchMessages
);

router.post(
  '/:chatId/typing',
  auth('Common'),
  validateRequest(messageValidations.sendTypingIndicator),
  MessageController.sendTypingIndicator
);
router.post(
  '/:chatId/stop-typing',
  auth('Common'),
  validateRequest(messageValidations.stopTypingIndicator),
  MessageController.stopTypingIndicator
);

export const MessageRoutes = router;
