import { Router } from "express";
import { ChatController } from "./chat.controller";
import { auth } from "../../middlewares/auth";
import { multiUploadHandler } from "../../middlewares/fileUploadHandler";

const router = Router();

// Media message route - MUST use HTTP for file uploads
router.post(
  "/send-message",
  auth("admin", "provider", "client"),
  multiUploadHandler([{ name: "files", maxCount: 10 }]),
  ChatController.sendMediaMessage,
);

router.post(
  "/send/:receiverId",
  auth("admin", "provider", "client"),
  multiUploadHandler([{ name: "files", maxCount: 10 }]),
  ChatController.sendMessageOnUser,
);

router.get(
  "/user-messages/:otherUserId",
  auth("admin", "provider", "client"),
  ChatController.getMessages,
);

// Message management
router.patch(
  "/messages/:messageId",
  auth("admin", "provider", "client"),
  ChatController.updateMessage,
);

router.delete(
  "/messages/:messageId",
  auth("admin", "provider", "client"),
  ChatController.deleteMessage,
);

router.get(
  "/messages/:chatId",
  auth("admin", "provider", "client"),
  ChatController.getChatMessages,
);

router.get(
  "/chat-users",
  auth("admin", "provider", "client"),
  ChatController.getChatUsers,
);

// Chat management
router.get(
  "/all",
  auth("admin", "provider", "client"),
  ChatController.getUserChats,
);

router.delete(
  "/chats/:chatId",
  auth("admin", "provider", "client"),
  ChatController.deleteConversation,
);

router.post(
  "/chats/:chatId/read",
  auth("admin", "provider", "client"),
  ChatController.markMessagesAsRead,
);

// User blocking
router.post(
  "/block",
  auth("admin", "provider", "client"),
  ChatController.blockUser,
);

router.delete(
  "/unblock/:blockedId",
  auth("admin", "provider", "client"),
  ChatController.unblockUser,
);
router.get(
  "/blocked",
  auth("admin", "provider", "client"),
  ChatController.getBlockedUsers,
);

export const ChatRoutes = router;
