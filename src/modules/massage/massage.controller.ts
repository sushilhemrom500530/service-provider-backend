import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import catchAsync from './../../shared/catchAsync';
import sendResponse from './../../shared/sendResponse';
import { MassageService } from './massage.service';

const idParam = (req: Request) => String(req.params.id);
const userOf = (req: Request) => req.user as JwtPayload;

/** Thumbnail: field "file" (current app) or "thumbnail" */
const thumbnailOf = (req: Request): Express.Multer.File | undefined => {
  if (req.file) return req.file;
  const files: any = req.files;
  if (Array.isArray(files))
    return files.find((f: any) => ['file', 'thumbnail'].includes(f.fieldname));
  return files?.file?.[0] || files?.thumbnail?.[0];
};

const browse = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await MassageService.browse(req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Massages fetched.', data, meta });
});

const myListings = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await MassageService.myListings(userOf(req), req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Your massages fetched.', data, meta });
});

const getDetail = catchAsync(async (req: Request, res: Response) => {
  const data = await MassageService.getDetail(idParam(req));
  sendResponse(res, { code: StatusCodes.OK, message: 'Massage fetched.', data });
});

const getReviews = catchAsync(async (req: Request, res: Response) => {
  const { data, meta, rating } = await MassageService.getReviews(idParam(req), req.query as any);
  // same shape as every other service: data = reviews, rating next to meta
  res.status(StatusCodes.OK).json({ success: true, message: 'Reviews fetched.', data, meta, rating });
});

const create = catchAsync(async (req: Request, res: Response) => {
  const data = await MassageService.create(userOf(req), req.body, thumbnailOf(req));
  sendResponse(res, { code: StatusCodes.CREATED, message: 'Massage created.', data });
});

const update = catchAsync(async (req: Request, res: Response) => {
  const data = await MassageService.update(idParam(req), userOf(req), req.body, thumbnailOf(req));
  sendResponse(res, { code: StatusCodes.OK, message: 'Massage updated.', data });
});

const setStatus = catchAsync(async (req: Request, res: Response) => {
  const data = await MassageService.setStatus(idParam(req), userOf(req), req.body?.isActive);
  sendResponse(res, { code: StatusCodes.OK, message: 'Massage status updated.', data });
});

const remove = catchAsync(async (req: Request, res: Response) => {
  const data = await MassageService.remove(idParam(req), userOf(req));
  sendResponse(res, { code: StatusCodes.OK, message: 'Massage deleted.', data });
});

const review = catchAsync(async (req: Request, res: Response) => {
  const data = await MassageService.review(idParam(req), userOf(req), req.body);
  sendResponse(res, { code: StatusCodes.CREATED, message: 'Review added.', data });
});

export const MassageController = {
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
