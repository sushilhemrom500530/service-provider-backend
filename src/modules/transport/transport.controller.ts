import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import catchAsync from './../../shared/catchAsync';
import sendResponse from './../../shared/sendResponse';
import { TransportService } from './transport.service';

const browse = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await TransportService.browse(req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Transport listings fetched.', data, meta });
});

const myListings = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await TransportService.myListings(req.user as JwtPayload, req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Your transport listings fetched.', data, meta });
});

const getById = catchAsync(async (req: Request, res: Response) => {
  const data = await TransportService.getById(String(req.params.id));
  sendResponse(res, { code: StatusCodes.OK, message: 'Transport fetched.', data });
});

const getReviews = catchAsync(async (req: Request, res: Response) => {
  const { data, meta, rating } = await TransportService.getReviews(String(req.params.id), req.query as any);
  res.status(StatusCodes.OK).json({ success: true, message: 'Reviews fetched.', data, meta, rating });
});

const create = catchAsync(async (req: Request, res: Response) => {
  const data = await TransportService.create(req);
  sendResponse(res, { code: StatusCodes.CREATED, message: 'Transport created.', data });
});

const update = catchAsync(async (req: Request, res: Response) => {
  const data = await TransportService.update(req);
  sendResponse(res, { code: StatusCodes.OK, message: 'Transport updated.', data });
});

const setStatus = catchAsync(async (req: Request, res: Response) => {
  const data = await TransportService.setStatus(req);
  sendResponse(res, { code: StatusCodes.OK, message: 'Transport status updated.', data });
});

const remove = catchAsync(async (req: Request, res: Response) => {
  const data = await TransportService.remove(String(req.params.id), req.user as JwtPayload);
  sendResponse(res, { code: StatusCodes.OK, message: 'Transport deleted.', data });
});

const review = catchAsync(async (req: Request, res: Response) => {
  const data = await TransportService.review(String(req.params.id), req.user as JwtPayload, req.body);
  sendResponse(res, { code: StatusCodes.CREATED, message: 'Review added.', data });
});

export const TransportController = {
  browse,
  myListings,
  getById,
  getReviews,
  create,
  update,
  setStatus,
  remove,
  review,
};
