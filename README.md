# 🌨️ Harry By Graves (Servicer) Backend

This is the backend for a comprehensive Harry By Graves (Servicer) application, built with a modern, scalable, and robust technology stack. It provides a full suite of APIs for managing users, properties,Ski, bookings, and more.

## 🚀 Features

*   **User Management:** Secure user registration, login, and profile management.
*   **Authentication:** JWT-based authentication with access and refresh tokens.
*   **Social Authentication:** Login with Google, Twitter, and other social providers (mobile-first).
*   **Property/Service Management:** CRUD operations for properties or services.
*   **Booking System:** End-to-end booking and reservation management.
*   **Real-time Notifications:** Instant notifications using Socket.io.
*   **Email Service:** Transactional emails for events like registration, booking confirmation, etc.
*   **File Uploads:** Secure file and image uploads to AWS S3.
*   **Dynamic Settings:** Manage "About Us", "Privacy Policy", and "Terms & Conditions" via APIs.
*   **Robust Error Handling:** Centralized error handling for consistent API responses.
*   **Activity Logging:** Middleware to log user activities for auditing and analytics.
*   **Pagination:** Efficiently handle large datasets with pagination.
*   **Internationalization (i18n):** Support for multiple languages.

## 🛠️ Technology Stack

*   **Runtime:** Node.js
*   **Framework:** Express.js
*   **Language:** TypeScript
*   **Database:** MongoDB with Mongoose ODM
*   **Authentication:** JWT (JSON Web Tokens), Passport.js
*   **Validation:** Zod
*   **Real-time Communication:** Socket.io
*   **File Storage:** AWS S3
*   **Email:** Nodemailer
*   **Logging:** Winston
*   **Testing:** Jest
*   **Code Quality:** ESLint, Prettier

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

*   **Node.js** (v16 or higher)
*   **npm** or **yarn**
*   **MongoDB** (v5.0 or higher)
*   **AWS S3 Bucket** and credentials
*   **SMTP Credentials** for email service

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd argento-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root directory by copying the `.env.example` file:

```bash
cp .env.example .env
```

Now, fill in the required environment variables in the `.env` file:

```env
# Server Configuration
NODE_ENV=development
PORT=8083
SOCKET_PORT=8084

# Database
MONGODB_URL=mongodb://localhost:27017/argento

# JWT Configuration
JWT_ACCESS_SECRET=your-super-secret-jwt-access-key-here
JWT_REFRESH_SECRET=your-super-secret-jwt-refresh-key-here
JWT_ACCESS_EXPIRATION_TIME=5d
JWT_REFRESH_EXPIRATION_TIME=365d

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket-name

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com

# Security Configuration
BCRYPT_SALT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCK_TIME=2

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### 4. Start the Development Server

```bash
# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

The server will start on `http://localhost:8083`.

## 🏗️ Project Structure

```
src/
├── app.ts                 # Express app configuration
├── server.ts              # Server entry point
├── aws/                   # AWS S3 services
├── common/                # Common plugins and utilities
├── config/                # Configuration files (passport, env)
├── errors/                # Custom error classes and handlers
├── i18n/                  # Internationalization and locales
├── middlewares/           # Express middlewares (auth, error handling, logging)
├── modules/               # Core application modules (user, auth, services, etc.)
│   ├── auth/              # Authentication and social auth
│   ├── user/              # User management
│   ├── services/          # Property/Service management
│   ├── notification/      # Notification logic
│   └── settings/          # Dynamic content (about, privacy, terms)
├── routes/                # API route definitions
├── shared/                # Shared utilities and handlers
├── socket/                # Socket.io setup and event handlers
├── types/                 # TypeScript type definitions
└── utils/                 # Utility functions
```

## 🤝 Contributing

1.  Fork the repository
2.  Create a feature branch (`git checkout -b feature/amazing-feature`)
3.  Commit your changes (`git commit -m 'Add amazing feature'`)
4.  Push to the branch (`git push origin feature/amazing-feature`)
5.  Open a Pull Request

---

**Happy Coding! 🚀**
