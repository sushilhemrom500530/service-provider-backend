import { Response } from 'express';

export type IMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type IData<T> = {
  code: number;
  message?: string;
  data?: T;
  meta?: IMeta;
};

/**
 * One response envelope for the whole API:
 *   { success: true, message, data, meta? }
 * Errors (globalErrorHandler): { success: false, message, errors? }
 */
const sendResponse = <T>(res: Response, data: IData<T>) => {
  const resData: Record<string, unknown> = {
    success: data.code < 400,
    message: data.message,
    data: data?.data ?? null,
  };
  if (data.meta) resData.meta = data.meta;
  res.status(data?.code).json(resData);
};

export default sendResponse;
