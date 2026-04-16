export const CHAT_UPLOADS_FOLDER = 'uploads/chat';

export const SOCKET_EVENTS = {
  // Connection
  CONNECTION: "connection",
  DISCONNECT: "disconnect",

  // User Status
  USER_STATUS: "user-status",
  ONLINE_USERS_LIST: "online-users-list",

  // Chat Management
  JOIN_CHAT: "chat-join",
  LEAVE_CHAT: "chat-leave",
  CHAT_LIST: "chat-list", // Full chat list (for metadata changes)
  CHAT_MESSAGES: "chat-messages", // Initial batch of messages (on join)

  // Pagination
  LOAD_OLDER_MESSAGES: "chat-load-older",
  OLDER_MESSAGES_LOADED: "chat-older-messages",

  // Real-Time Message Delta (efficient!)
  MESSAGE_NEW: "message-new",
  MESSAGE_UPDATED: "message-updated",
  MESSAGE_DELETED: "message-deleted",

  // Message Actions (Client → Server)
  SEND_MESSAGE: "message-send",
  UPDATE_MESSAGE: "message-update",
  DELETE_MESSAGE: "message-delete",

  // Status
  MESSAGE_DELIVERED: "message-delivered",
  MESSAGES_READ: "messages-read",

  // Typing
  USER_TYPING: "user-typing",
  USER_STOPPED_TYPING: "user-stopped-typing",

  // Error
  ERROR: "error",
} as const;

 
export const FILE_SIZE_LIMITS = {
  IMAGE: 10 * 1024 * 1024,
  VIDEO: 100 * 1024 * 1024,
  AUDIO: 20 * 1024 * 1024,
};

export const ALLOWED_FILE_TYPES = {
  IMAGE: ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"],
  VIDEO: ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"],
  AUDIO: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm"],
};

export const MESSAGE_PAGINATION = {
  INITIAL_LIMIT: 30, // On join
  LOAD_MORE_LIMIT: 30, // On scroll up
  MAX_LIMIT: 100,
};

export const TYPING_TIMEOUT = 3000;
