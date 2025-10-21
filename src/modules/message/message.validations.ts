import { z } from 'zod';

const sendMessage = z.object({
  body: z.object({
    message: z.string({
      required_error: 'Message content is required',
      invalid_type_error: 'Message must be a string',
    }).min(1, 'Message cannot be empty'),
    receiverId: z.string({
      required_error: 'Receiver ID is required',
      invalid_type_error: 'Receiver ID must be a string',
    }).min(1, 'Receiver ID cannot be empty'),
  }),
});

const getAllMessagesByReceiverId = z.object({
  params: z.object({
    receiverId: z.string({
      required_error: 'Receiver ID is required',
      invalid_type_error: 'Receiver ID must be a string',
    }).min(1, 'Receiver ID cannot be empty'),
  }),
});

const updateMessage = z.object({
  params: z.object({
    messageId: z.string({
      required_error: 'Message ID is required',
      invalid_type_error: 'Message ID must be a string',
    }).min(1, 'Message ID cannot be empty'),
  }),
  body: z.object({
    message: z.string({
      required_error: 'Message content is required',
      invalid_type_error: 'Message must be a string',
    }).min(1, 'Message cannot be empty'),
  }),
});

const deleteMessage = z.object({
  params: z.object({
    messageId: z.string({
      required_error: 'Message ID is required',
      invalid_type_error: 'Message ID must be a string',
    }).min(1, 'Message ID cannot be empty'),
  }),
});

const markMessageSeen = z.object({
  params: z.object({
    messageId: z.string({
      required_error: 'Message ID is required',
      invalid_type_error: 'Message ID must be a string',
    }).min(1, 'Message ID cannot be empty'),
  }),
});

const viewAllMessages = z.object({
  params: z.object({
    chatId: z.string({
      required_error: 'Chat ID is required',
      invalid_type_error: 'Chat ID must be a string',
    }).min(1, 'Chat ID cannot be empty'),
  }),
});

const unviewedMessagesCount = z.object({
  query: z.object({
    chatId: z.string({
      required_error: 'Chat ID is required',
      invalid_type_error: 'Chat ID must be a string',
    }).min(1, 'Chat ID cannot be empty'),
  }),
});

const addReaction = z.object({
  params: z.object({
    messageId: z.string({
      required_error: 'Message ID is required',
      invalid_type_error: 'Message ID must be a string',
    }).min(1, 'Message ID cannot be empty'),
  }),
  body: z.object({
    emoji: z.string({
      required_error: 'Emoji is required',
      invalid_type_error: 'Emoji must be a string',
    }).min(1, 'Emoji cannot be empty').max(10, 'Emoji cannot exceed 10 characters'),
  }),
});

const removeReaction = z.object({
  params: z.object({
    messageId: z.string({
      required_error: 'Message ID is required',
      invalid_type_error: 'Message ID must be a string',
    }).min(1, 'Message ID cannot be empty'),
  }),
});

const replyToMessage = z.object({
  body: z.object({
    replyToId: z.string({
      required_error: 'Reply To ID is required',
      invalid_type_error: 'Reply To ID must be a string',
    }).min(1, 'Reply To ID cannot be empty'),
    chatId: z.string({
      required_error: 'Chat ID is required',
      invalid_type_error: 'Chat ID must be a string',
    }).min(1, 'Chat ID cannot be empty'),
    receiverId: z.string({
      required_error: 'Receiver ID is required',
      invalid_type_error: 'Receiver ID must be a string',
    }).min(1, 'Receiver ID cannot be empty'),
    content: z.object({
      messageType: z.enum(['text', 'image', 'audio', 'video', 'document', 'mixed', 'storyMessage'], {
        required_error: 'Message type is required',
        invalid_type_error: 'Message type must be one of: text, image, audio, video, document, mixed, storyMessage',
      }),
      text: z.string().optional(),
      fileUrls: z.array(z.string()).optional(),
      thumbnails: z.array(z.string()).optional(),
      fileMetadata: z.array(z.object({
        originalName: z.string().optional(),
        size: z.number().optional(),
        mimeType: z.string().optional(),
        duration: z.number().optional(),
      })).optional(),
    }, {
      required_error: 'Content is required',
      invalid_type_error: 'Content must be an object',
    }),
  }),
});

const forwardMessage = z.object({
  params: z.object({
    messageId: z.string({
      required_error: 'Message ID is required',
      invalid_type_error: 'Message ID must be a string',
    }).min(1, 'Message ID cannot be empty'),
  }),
  body: z.object({
    chatIds: z.array(z.string({
      required_error: 'Chat ID is required',
      invalid_type_error: 'Chat ID must be a string',
    }).min(1, 'Chat ID cannot be empty')).min(1, 'At least one chat ID is required'),
  }),
});

const pinMessage = z.object({
  params: z.object({
    messageId: z.string({
      required_error: 'Message ID is required',
      invalid_type_error: 'Message ID must be a string',
    }).min(1, 'Message ID cannot be empty'),
    chatId: z.string({
      required_error: 'Chat ID is required',
      invalid_type_error: 'Chat ID must be a string',
    }).min(1, 'Chat ID cannot be empty'),
  }),
});

const unpinMessage = z.object({
  params: z.object({
    messageId: z.string({
      required_error: 'Message ID is required',
      invalid_type_error: 'Message ID must be a string',
    }).min(1, 'Message ID cannot be empty'),
    chatId: z.string({
      required_error: 'Chat ID is required',
      invalid_type_error: 'Chat ID must be a string',
    }).min(1, 'Chat ID cannot be empty'),
  }),
});

const searchMessages = z.object({
  params: z.object({
    chatId: z.string({
      required_error: 'Chat ID is required',
      invalid_type_error: 'Chat ID must be a string',
    }).min(1, 'Chat ID cannot be empty'),
  }),
  query: z.object({
    searchTerm: z.string({
      required_error: 'Search term is required',
      invalid_type_error: 'Search term must be a string',
    }).min(1, 'Search term cannot be empty'),
  }),
});

const sendTypingIndicator = z.object({
  params: z.object({
    chatId: z.string({
      required_error: 'Chat ID is required',
      invalid_type_error: 'Chat ID must be a string',
    }).min(1, 'Chat ID cannot be empty'),
  }),
});

const stopTypingIndicator = z.object({
  params: z.object({
    chatId: z.string({
      required_error: 'Chat ID is required',
      invalid_type_error: 'Chat ID must be a string',
    }).min(1, 'Chat ID cannot be empty'),
  }),
});

export const messageValidations = {
  sendMessage,
  getAllMessagesByReceiverId,
  updateMessage,
  deleteMessage,
  markMessageSeen,
  viewAllMessages,
  unviewedMessagesCount,
  addReaction,
  removeReaction,
  replyToMessage,
  forwardMessage,
  pinMessage,
  unpinMessage,
  searchMessages,
  sendTypingIndicator,
  stopTypingIndicator,
};