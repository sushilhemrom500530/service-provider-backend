import { NextFunction, Request, Response } from 'express';
import status from 'http-status';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import AppError from '../errors/AppErro';

const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode: number = status.INTERNAL_SERVER_ERROR;
  let success = false;
  let message: string = err.message || 'Something went wrong!';
  let error: any = err;

  // ===============================
  //   APP ERROR (thrown on purpose)
  // ===============================
  // AppError carries its HTTP status in `code` (400, 401, 404, 409...).
  // Without this branch every AppError was sent as 500.
  if (
    err instanceof AppError &&
    Number.isInteger(err.code) &&
    err.code >= 400 &&
    err.code <= 599
  ) {
    statusCode = err.code;
    message = err.message;
    error = { name: err.name, code: err.code, message: err.message };
  }

  // ===============================
  //      ZOD VALIDATION ERROR
  // ===============================
  else if (err instanceof ZodError) {
    statusCode = status.BAD_REQUEST;
    message = 'Validation Error';
    error = {
      name: err.name,
      issues: err.issues.map(issue => ({
        path: issue.path,
        message: issue.message,
      })),
    };
  }

  // ===============================
  //   MONGOOSE VALIDATION ERROR
  // ===============================
  else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = status.BAD_REQUEST;
    message = 'Validation Error';
    error = Object.values(err.errors).map((el: any) => ({
      path: el.path,
      message: el.message,
    }));
  }

  // ===============================
  //     CAST ERROR (Invalid ID)
  // ===============================
  else if (err instanceof mongoose.Error.CastError) {
    statusCode = status.BAD_REQUEST;
    message = `Invalid ${err.path}: ${err.value}`;
    error = {
      path: err.path,
      value: err.value,
      kind: err.kind,
    };
  }

  // ===============================
  //   DUPLICATE KEY ERROR (E11000)
  // ===============================
  else if (err.code === 11000) {
    statusCode = status.BAD_REQUEST;
    message = 'Duplicate Key Error';
    error = err.keyValue;
  }

  // ===============================
  //         JWT ERRORS
  // ===============================
  else if (err.name === 'JsonWebTokenError') {
    statusCode = status.UNAUTHORIZED;
    message = 'Invalid or expired token';
    error = err.message;
  } 
  else if (err.name === 'TokenExpiredError') {
    statusCode = status.UNAUTHORIZED;
    message = 'Token has expired';
    error = err.message;
  }
 
  res.status(statusCode).json({
    success,
    message,       // always string
    error,         // always object
  });
};

export default globalErrorHandler;


// import { NextFunction, Request, Response } from 'express';
// import status from 'http-status';
// import mongoose from 'mongoose';
// import { ZodError } from 'zod';

// const globalErrorHandler = (
//   err: any,
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   // Fix: Explicitly type statusCode as number to allow different status codes (400, 401, 500, etc.)
//   let statusCode: number = status.INTERNAL_SERVER_ERROR;
//   let success = false;
//   let message = err.message || 'Something went wrong!';
//   let error: any = err;

//   // ✅ Handle Zod Validation Errors
//   if (err instanceof ZodError) {
//     statusCode = status.BAD_REQUEST;
//     message = 'Validation Error';
//     error = {
//       name: err.name,
//       issues: err.issues.map(issue => ({
//         path: issue.path,
//         message: issue.message,
//       })),
//     };
//   }

//   // ✅ Handle Mongoose Validation Errors
//   else if (err instanceof mongoose.Error.ValidationError) {
//     statusCode = status.BAD_REQUEST;
//     message = 'Validation Error';
//     error = Object.values(err.errors).map((el: any) => ({
//       path: el.path,
//       message: el.message,
//     }));
//   }

//   // ✅ Handle Mongoose Cast Errors (invalid ObjectId, etc.)
//   else if (err instanceof mongoose.Error.CastError) {
//     statusCode = status.BAD_REQUEST;
//     message = `Invalid ${err.path}: ${err.value}`;
//     error = {
//       path: err.path,
//       value: err.value,
//       kind: err.kind,
//     };
//   }

//   // ✅ Handle Duplicate Key Errors (E11000)
//   else if (err.code === 11000) {
//     statusCode = status.BAD_REQUEST;
//     message = 'Duplicate Key Error';
//     error = err.keyValue;
//   }

//   // ✅ Handle JWT errors (optional)
//   else if (err.name === 'JsonWebTokenError') {
//     statusCode = status.UNAUTHORIZED;
//     message = 'Invalid or expired token';
//     error = err.message;
//   } else if (err.name === 'TokenExpiredError') {
//     statusCode = status.UNAUTHORIZED;
//     message = 'Token has expired';
//     error = err.message;
//   }

//   console.log('error message is :', error);
//   res.status(statusCode).json({
//     success, 
//     message: JSON.stringify(error.issues || message, null, 2), // Keep formatted message
//     error,
//     // stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
//   });
// };

// export default globalErrorHandler;
