import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import catchAsync from './../../shared/catchAsync';
import sendResponse from './../../shared/sendResponse';
import { SkiHireService } from './skihire.service';

const idParam = (req: Request) => String(req.params.id);
const files = (req: Request) => (req as any).files as Record<string, any[]> | undefined;

const browse = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await SkiHireService.browse(req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Ski hire listings fetched.', data, meta });
});

const myListings = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await SkiHireService.myListings(req.user as JwtPayload, req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Your ski hire listings fetched.', data, meta });
});

const getDetail = catchAsync(async (req: Request, res: Response) => {
  const data = await SkiHireService.getDetail(idParam(req));
  sendResponse(res, { code: StatusCodes.OK, message: 'Ski hire fetched.', data });
});

const getReviews = catchAsync(async (req: Request, res: Response) => {
  const { data, meta, rating } = await SkiHireService.getReviews(idParam(req), req.query as any);
  // same envelope as sendResponse, plus the listing's rating summary
  res.status(StatusCodes.OK).json({ success: true, message: 'Reviews fetched.', data, meta, rating });
});

const create = catchAsync(async (req: Request, res: Response) => {
  const data = await SkiHireService.create(req.user as JwtPayload, req.body, files(req));
  sendResponse(res, { code: StatusCodes.CREATED, message: 'Ski hire created.', data });
});

const update = catchAsync(async (req: Request, res: Response) => {
  const data = await SkiHireService.update(idParam(req), req.user as JwtPayload, req.body, files(req));
  sendResponse(res, { code: StatusCodes.OK, message: 'Ski hire updated.', data });
});

const setStatus = catchAsync(async (req: Request, res: Response) => {
  const data = await SkiHireService.setStatus(idParam(req), req.user as JwtPayload, req.body?.isActive);
  sendResponse(res, { code: StatusCodes.OK, message: 'Ski hire status updated.', data });
});

const remove = catchAsync(async (req: Request, res: Response) => {
  const data = await SkiHireService.remove(idParam(req), req.user as JwtPayload);
  sendResponse(res, { code: StatusCodes.OK, message: 'Ski hire deleted.', data });
});

const review = catchAsync(async (req: Request, res: Response) => {
  const data = await SkiHireService.review(idParam(req), req.user as JwtPayload, req.body);
  sendResponse(res, { code: StatusCodes.CREATED, message: 'Review added.', data });
});

export const SkiHireController = {
  browse,
  myListings,
  getDetail,
  getReviews,
  create,
  update,
  setStatus,
  remove,
  review,
};
