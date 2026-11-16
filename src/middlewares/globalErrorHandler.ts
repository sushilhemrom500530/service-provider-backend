import { NextFunction, Request, Response } from 'express';
import status from 'http-status';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import AppError from '../errors/AppErro';
import { errorLogger } from '../shared/logger';

/**
 * Error envelope:
 *   { success: false, message, errors? }
 * `errors` is only sent for field problems: [{ field, message }]
 */
const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
) => {
  let statusCode: number = status.INTERNAL_SERVER_ERROR;
  let message: string = 'Something went wrong. Please try again.';
  let errors: { field: string; message: string }[] | undefined;

  if (
    err instanceof AppError &&
    Number.isInteger(err.code) &&
    err.code >= 400 &&
    err.code <= 599
  ) {
    statusCode = err.code;
    message = err.message;
  } else if (err instanceof ZodError) {
    statusCode = status.BAD_REQUEST;
    errors = err.issues.map(issue => ({
      // drop the "body" / "query" / "params" prefix
      field: issue.path
        .filter((p, i) => !(i === 0 && ['body', 'query', 'params', 'cookies'].includes(String(p))))
        .join('.'),
      message: issue.message,
    }));
    message = errors[0]
      ? `${errors[0].field ? errors[0].field + ': ' : ''}${errors[0].message}`
      : 'Validation error';
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = status.BAD_REQUEST;
    errors = Object.values(err.errors).map((el: any) => ({
      field: el.path,
      message: el.message,
    }));
    message = errors[0]?.message || 'Validation error';
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = status.BAD_REQUEST;
    message = `Invalid ${err.path}: ${String(err.value)}`;
  } else if (err?.code === 11000) {
    statusCode = status.CONFLICT;
    const field = Object.keys(err.keyValue || {})[0];
    message = field ? `${field} already exists.` : 'Duplicate value.';
  } else if (err?.name === 'JsonWebTokenError') {
    statusCode = status.UNAUTHORIZED;
    message = 'Invalid or expired token';
  } else if (err?.name === 'TokenExpiredError') {
    statusCode = status.UNAUTHORIZED;
    message = 'Token has expired';
  } else if (err?.type === 'entity.parse.failed') {
    statusCode = status.BAD_REQUEST;
    message = 'Request body is not valid JSON.';
  } else if (err?.name === 'MulterError') {
    statusCode = status.BAD_REQUEST;
    message = err.message;
  }

  // unexpected errors: log the details, never leak them to the client
  if (statusCode >= 500) {
    try {
      errorLogger.error(err?.stack || err?.message || String(err));
    } catch {
      /* logger must never break the response */
    }
  }

  const body: Record<string, unknown> = { success: false, message };
  if (errors?.length) body.errors = errors;
  res.status(statusCode).json(body);
};

export default globalErrorHandler;
