# Implementation Checklist & Quick Reference

## ✅ Files Updated

### 1. **app.ts** (Updated)
- Added health check endpoint with socket status
- Socket.IO and socketHelper now accessible via `req.app.get()`

### 2. **server.ts** (Updated)
- Improved Socket.IO initialization with better config
- Added `app.set('io', io)` to make io accessible in controllers
- Added `app.set('socketHelper', socketHelper)` for helper functions
- Enhanced graceful shutdown handling
- Better logging for socket initialization

### 3. **global.d.ts** (New - Create this file)
Location: `src/global.d.ts` or `src/types/global.d.ts`
- TypeScript type definitions for global variables
- Express Request and Application interface extensions

---

## 📁 File Structure

```
src/
├── app.ts                          ✅ Updated
├── server.ts                       ✅ Updated
├── global.d.ts                     ⭐ NEW - Create this
├── helpers/
│   ├── socket.ts                   ✅ Already exists (your socketHelper)
│   └── S3Service.ts                ✅ Already exists
├── middlewares/
│   ├── auth.ts                     ✅ Already exists
│   ├── fileUpload.ts               ⭐ NEW - Create this
│   └── globalErrorHandler.ts      ✅ Already exists
├── modules/
│   └── Chat/
│       ├── chat.controller.ts      ⭐ NEW - Create this
│       ├── chat.service.ts         ✅ Already exists
│       ├── chat.routes.ts          ⭐ NEW - Create this
│       ├── chat.model.ts           ✅ Already exists
│       ├── chat.interface.ts       ✅ Already exists
│       └── chat.constant.ts        ✅ Already exists
└── routes/
    └── index.ts                    ✅ Update to include chat routes
```

---

## 🔧 Required NPM Packages

Make sure you have these installed:

```bash
npm install multer @types/multer
npm install socket.io
npm install aws-sdk  # or @aws-sdk/client-s3 for v3
```

---

## 🚀 Quick Setup Guide

### Step 1: Create New Files

1. **Create `src/middlewares/fileUpload.ts`**
   - Copy from artifact: "File Upload Middleware Configuration"
   - Configure file size limits and allowed types

2. **Create `src/modules/Chat/chat.controller.ts`**
   - Copy from artifact: "Chat Controller - Media Upload Endpoint"
   - Handles HTTP media uploads

3. **Create `src/modules/Chat/chat.routes.ts`**
   - Copy from artifact: "Chat Routes Configuration"
   - Defines all chat endpoints

4. **Create `src/global.d.ts`**
   - Copy from artifact: "global.d.ts - Type Declarations"
   - Adds TypeScript types

### Step 2: Update Existing Files

1. **Update `src/app.ts`**
   - Replace with updated version from artifacts

2. **Update `src/server.ts`**
   - Replace with updated version from artifacts

3. **Update `src/routes/index.ts`**
   - Add chat routes to moduleRoutes array:
   ```typescript
   import chatRoutes from '../modules/Chat/chat.routes';
   
   const moduleRoutes = [
     {
       path: '/chat',
       route: chatRoutes,
     },
     // ... other routes
   ];
   ```

### Step 3: Environment Variables

Add to your `.env` file:

```env
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name

# Chat Configuration
CHAT_UPLOADS_FOLDER=chat-media
```

---

## 🎯 API Endpoints

### Media Upload (HTTP)
```
POST /api/v1/chat/messages/media
Content-Type: multipart/form-data
Authorization: Bearer {token}

Body (form-data):
- mediaFile: [File]
- receiverId: string
- messageType: "image" | "video" | "audio"
- content: string (optional - caption)
- replyTo: string (optional - message ID)
```

### Get Chat Messages (HTTP)
```
GET /api/v1/chat/chats/:chatId/messages?limit=50&offset=0
Authorization: Bearer {token}
```

### Get User Chats (HTTP)
```
GET /api/v1/chat/chats
Authorization: Bearer {token}
```

### Update Message (HTTP)
```
PATCH /api/v1/chat/messages/:messageId
Authorization: Bearer {token}

Body:
{
  "content": "Updated message text"
}
```

### Delete Message (HTTP)
```
DELETE /api/v1/chat/messages/:messageId
Authorization: Bearer {token}
```

---

## 🔌 Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `send:message` | `{receiverId, content, replyTo?, tempId?}` | Send text message |
| `user:typing` | `{chatId, receiverId}` | Start typing |
| `user:stop_typing` | `{chatId, receiverId}` | Stop typing |
| `message:read` | `{chatId, senderId}` | Mark as read |
| `message:updated` | `{messageId, content, receiverId}` | Edit message |
| `message:deleted` | `{messageId, receiverId}` | Delete message |
| `join:chat` | `{chatId}` | Join chat room |
| `leave:chat` | `{chatId}` | Leave chat room |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `message:received` | `{message}` | New message |
| `message:sent` | `{message, tempId?}` | Message sent confirmation |
| `message:delivered` | `{messageId, deliveredTo}` | Message delivered |
| `message:read` | `{chatId, readBy}` | Messages read |
| `message:updated` | `{message}` | Message updated |
| `message:deleted` | `{messageId}` | Message deleted |
| `user:online` | `{userId, timestamp}` | User online |
| `user:offline` | `{userId, timestamp}` | User offline |
| `user:typing` | `{chatId, userId}` | User typing |
| `user:stop_typing` | `{chatId, userId}` | User stopped typing |
| `error` | `{message, tempId?}` | Error occurred |

---

## 🧪 Testing with Postman/Thunder Client

### 1. Send Image Message

```
POST http://localhost:5000/api/v1/chat/messages/media

Headers:
  Authorization: Bearer {your_jwt_token}

Body (form-data):
  mediaFile: [Select image file]
  receiverId: 507f1f77bcf86cd799439011
  messageType: image
  content: Check out this photo!
```

### 2. Send Video Message

```
POST http://localhost:5000/api/v1/chat/messages/media

Headers:
  Authorization: Bearer {your_jwt_token}

Body (form-data):
  mediaFile: [Select video file]
  receiverId: 507f1f77bcf86cd799439011
  messageType: video
```

### 3. Get Chat History

```
GET http://localhost:5000/api/v1/chat/chats/507f1f77bcf86cd799439013/messages?limit=50&offset=0

Headers:
  Authorization: Bearer {your_jwt_token}
```

---

## 🐛 Troubleshooting

### Issue: "io is not defined" in controller

**Solution:** Make sure server.ts has:
```typescript
app.set('io', io);
app.set('socketHelper', socketHelper);
```

And controller accesses it via:
```typescript
const io = req.app.get('io');
const socketHelper = req.app.get('socketHelper');
```

### Issue: File upload fails

**Check:**
1. Multer middleware is properly configured
2. File size is within limits
3. File type is allowed
4. `mediaFile` field name matches in form-data

### Issue: Socket events not working

**Check:**
1. Socket.IO is initialized after server starts
2. Client is properly authenticated
3. Client has joined the chat room
4. User is online (check with `/health` endpoint)

### Issue: S3 upload fails

**Check:**
1. AWS credentials in .env
2. S3 bucket exists and is accessible
3. IAM permissions allow PutObject
4. Bucket region matches AWS_REGION

---

## 📊 Monitoring

### Health Check
```
GET http://localhost:5000/health

Response:
{
  "success": true,
  "message": "Server is running",
  "database": "connected",
  "socket": {
    "initialized": true,
    "onlineUsers": 5
  }
}
```

### Check Online Users
Access via controller:
```typescript
const socketHelper = req.app.get('socketHelper');
const onlineUsers = socketHelper.getOnlineUsers();
const isOnline = socketHelper.isUserOnline(userId);
```

---

## 🔐 Security Checklist

- ✅ File type validation (MIME type)
- ✅ File size limits enforced
- ✅ User authentication required
- ✅ Socket authentication with JWT
- ✅ Block check before sending messages
- ✅ S3 bucket permissions configured
- ✅ CORS properly configured
- ⚠️ Add rate limiting (recommended)
- ⚠️ Add virus scanning for uploads (recommended)

---

## 📈 Performance Tips

1. **Enable compression**
   ```typescript
   import compression from 'compression';
   app.use(compression());
   ```

2. **Use Redis for Socket.IO scaling**
   ```typescript
   import { createAdapter } from '@socket.io/redis-adapter';
   import { createClient } from 'redis';
   
   const pubClient = createClient({ url: 'redis://localhost:6379' });
   const subClient = pubClient.duplicate();
   
   io.adapter(createAdapter(pubClient, subClient));
   ```

3. **Implement pagination**
   - Already done in getChatMessages (limit & offset)

4. **Add indexes to MongoDB**
   ```typescript
   chatSchema.index({ participants: 1, lastMessageAt: -1 });
   messageSchema.index({ chatId: 1, createdAt: -1 });
   ```

---

## 🎉 You're All Set!

Your backend is now ready to handle:
- ✅ Text messages via Socket.IO
- ✅ Media uploads (images, videos, audio) via HTTP
- ✅ Real-time notifications
- ✅ Typing indicators
- ✅ Read receipts
- ✅ Message editing and deletion
- ✅ User blocking
- ✅ Online/offline status

Start your server and test it out! 🚀