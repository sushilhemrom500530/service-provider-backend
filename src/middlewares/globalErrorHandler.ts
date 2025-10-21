// // src/middlewares/globalErrorHandler.ts
// import { ErrorRequestHandler } from 'express';
// import handleDuplicateError from '../errors/handleDuplicateError';
// import handleValidationError from '../errors/handleValidationError';
// import handleZodError from '../errors/handleZodError';
// import { errorLogger } from '../shared/logger';
// import { IErrorMessage } from '../types/errors.types';
// import { config } from '../config';
// import multer from 'multer';
// import AppError, {
//   AuthError,
//   ExternalServiceError,
//   RateLimitError,
// } from '../errors/AppErro';

// const globalErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
//   let code = 500;
//   let message = 'Something went wrong';
//   let errorMessages: IErrorMessage[] = [];

//   // Handle specific error types
//   if (error.name === 'ZodError') {
//     const simplifiedError = handleZodError(error);
//     code = simplifiedError.code;
//     errorMessages = simplifiedError.errorMessages;
//   } else if (error.name === 'ValidationError') {
//     const simplifiedError = handleValidationError(error);
//     code = simplifiedError.code;
//     errorMessages = simplifiedError.errorMessages;
//   } else if (
//     error.name === 'DuplicateError' ||
//     (error.name === 'MongoServerError' && error.code === 11000)
//   ) {
//     const simplifiedError = handleDuplicateError(error);
//     code = simplifiedError.code;
//     errorMessages = simplifiedError.errorMessages;
//   } else if (error.name === 'MongoServerError') {
//     if (error.code === 121) {
//       code = 400;
//       message = 'Document validation failed';
//       errorMessages = [{ path: '', message }];
//     } else {
//       code = 500;
//       message = 'Database error';
//       errorMessages = [{ path: '', message: error.message || message }];
//     }
//   } else if (error instanceof AuthError) {
//     code = error.code; // 401 or 403
//     message = error.message;
//     errorMessages = [{ path: '', message: error.message }];
//   } else if (error instanceof RateLimitError) {
//     code = error.code; // 429
//     message = error.message;
//     errorMessages = [{ path: '', message: error.message }];
//   } else if (error instanceof ExternalServiceError) {
//     code = error.code;
//     message = error.message;
//     errorMessages = [{ path: '', message: error.message }];
//   } else if (error instanceof multer.MulterError) {
//     code = 400;
//     message =
//       error.code === 'LIMIT_FILE_SIZE'
//         ? 'File size limit exceeded'
//         : 'File upload error';
//     errorMessages = [{ path: 'file', message }];
//   } else if (error instanceof SyntaxError && error.message.includes('JSON')) {
//     code = 400;
//     message = 'Invalid JSON format';
//     errorMessages = [{ path: 'body', message }];
//   } else if (
//     error.name === 'MongoNetworkError' ||
//     error.message.includes('ECONNREFUSED')
//   ) {
//     code = 503;
//     message = 'Database connection failed';
//     errorMessages = [{ path: '', message }];
//   } else if (
//     error.message.includes('timeout') ||
//     error.name === 'TimeoutError'
//   ) {
//     code = 504;
//     message = 'Request timed out';
//     errorMessages = [{ path: '', message }];
//   } else if (error instanceof AppError) {
//     code = error.code;
//     message = error.message || 'Something went wrong';
//     errorMessages = [
//       {
//         path: error.name === 'NotFoundError' ? 'userId' : '',
//         message: error.message,
//       },
//     ];
//   } else if (error instanceof Error) {
//     message = error.message || 'Internal Server Error';
//     errorMessages = [{ path: '', message: error.message }];
//   } else {
//     errorLogger.error('Unknown error type:', error);
//     message = 'Internal Server Error';
//     errorMessages = [{ path: '', message }];
//   }

//   // Format message
//   message =
//     errorMessages.length > 0
//       ? errorMessages.map(err => err.message).join(', ')
//       : message;

//   config.environment === 'development'
//     ? console.log('🚨 globalErrorHandler ~~', {
//         code,
//         message,
//       })
//     : errorLogger.error('🚨 globalErrorHandler ~~', {
//         code,
//         message,
//       });
//   // Send response
//   res.status(code).json({
//     code,
//     message,
//     error: errorMessages.length > 0 ? errorMessages : undefined,
//   });
// };

// export default globalErrorHandler;

import { NextFunction, Request, Response } from "express";
import status from "http-status";
import mongoose from "mongoose";

const globalErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  let statusCode = status.INTERNAL_SERVER_ERROR;
  let success = false;
  let message = err.message || "Something went wrong!";
  let error = err;

  // Handle Mongoose validation errors
  if (err instanceof mongoose.Error.ValidationError) {
    statusCode = status.BAD_REQUEST;
    message = "Validation Error";
    // Collect all validation errors into an array
    error = Object.values(err.errors).map((el: any) => ({
      path: el.path,
      message: el.message,
    }));
  }

  // Handle Mongoose duplicate key errors
  else if (err.code && err.code === 11000) {
    statusCode = status.BAD_REQUEST;
    message = "Duplicate Key Error";
    // err.keyValue contains the duplicate field(s)
    error = err.keyValue;
  }

  res.status(statusCode).json({
    success,
    message,
    error,
  });
};

export default globalErrorHandler;
