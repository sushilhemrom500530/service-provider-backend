

// import { NextFunction, Request, Response } from "express";
// import status from "http-status";
// import mongoose from "mongoose";

// const globalErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
//   let statusCode = status.INTERNAL_SERVER_ERROR;
//   let success = false;
//   let message = err.message || "Something went wrong!";
//   let error = err;

//   // Handle Mongoose validation errors
//   if (err instanceof mongoose.Error.ValidationError) {
//     statusCode = status.BAD_REQUEST;
//     message = "Validation Error";
//     // Collect all validation errors into an array
//     error = Object.values(err.errors).map((el: any) => ({
//       path: el.path,
//       message: el.message,
//     }));
//   }

//   // Handle Mongoose duplicate key errors
//   else if (err.code && err.code === 11000) {
//     statusCode = status.BAD_REQUEST;
//     message = "Duplicate Key Error";
//     // err.keyValue contains the duplicate field(s)
//     error = err.keyValue;
//   }

//   res.status(statusCode).json({
//     success,
//     message,
//     error,
//   });
// };

// export default globalErrorHandler;


import { NextFunction, Request, Response } from 'express';
import status from 'http-status';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = status.INTERNAL_SERVER_ERROR;
  let success = false;
  let message = err.message || 'Something went wrong!';
  let error: any = err;

  // ✅ Handle Zod Validation Errors
  if (err instanceof ZodError) {
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

  // ✅ Handle Mongoose Validation Errors
  else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = status.BAD_REQUEST;
    message = 'Validation Error';
    error = Object.values(err.errors).map((el: any) => ({
      path: el.path,
      message: el.message,
    }));
  }

  // ✅ Handle Mongoose Cast Errors (invalid ObjectId, etc.)
  else if (err instanceof mongoose.Error.CastError) {
    statusCode = status.BAD_REQUEST;
    message = `Invalid ${err.path}: ${err.value}`;
    error = {
      path: err.path,
      value: err.value,
      kind: err.kind,
    };
  }

  // ✅ Handle Duplicate Key Errors (E11000)
  else if (err.code === 11000) {
    statusCode = status.BAD_REQUEST;
    message = 'Duplicate Key Error';
    error = err.keyValue;
  }

  // ✅ Handle JWT errors (optional)
  else if (err.name === 'JsonWebTokenError') {
    statusCode = status.UNAUTHORIZED;
    message = 'Invalid or expired token';
    error = err.message;
  } else if (err.name === 'TokenExpiredError') {
    statusCode = status.UNAUTHORIZED;
    message = 'Token has expired';
    error = err.message;
  }

  res.status(statusCode).json({
    success,
    message: JSON.stringify(error.issues || message, null, 2), // Keep formatted message
    error,
    // stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

export default globalErrorHandler;
