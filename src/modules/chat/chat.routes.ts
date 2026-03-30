import { Router } from 'express';
import { ChatController } from './chat.controller'; 
import auth from "./../../middlewares/auth";

const router = Router();

// Media message route - MUST use HTTP for file uploads
router.post(
  '/send-message',
  auth('Admin', 'Provider', 'User'),
  ChatController.sendMediaMessage,
);

router.post(
  '/send/:receiverId',
  auth('Admin', 'Provider', 'User'),
  ChatController.sendMessageOnUser,
);

router.get(
  '/user-messages/:otherUserId',
  auth('Admin', 'Provider', 'User'),
  ChatController.getMessages,
);

// Message management
router.patch(
  '/messages/:messageId',
  auth('Admin', 'Provider', 'User'),
  ChatController.updateMessage,
);

router.delete(
  '/messages/:messageId',
  auth('Admin', 'Provider', 'User'),
  ChatController.deleteMessage,
);

router.get(
  '/messages/:chatId',
  auth('Admin', 'Provider', 'User'),
  ChatController.getChatMessages,
);

router.get(
  '/chat-users',
  auth('Admin', 'Provider', 'User'),
  ChatController.getChatUsers,
);

// Chat management
router.get(
  '/all',
  auth('Admin', 'Provider', 'User'),
  ChatController.getUserChats,
);

router.delete(
  '/chats/:chatId',
  auth('Admin', 'Provider', 'User'),
  ChatController.deleteConversation,
);

router.post(
  '/chats/:chatId/read',
  auth('Admin', 'Provider', 'User'),
  ChatController.markMessagesAsRead,
);

// User blocking
router.post(
  '/block',
  auth('Admin', 'Provider', 'User'),
  ChatController.blockUser,
);

router.delete(
  '/unblock/:blockedId',
  auth('Admin', 'Provider', 'User'),
  ChatController.unblockUser,
);
router.get(
  '/blocked',
  auth('Admin', 'Provider', 'User'),
  ChatController.getBlockedUsers,
);

export const ChatRoutes = router;
