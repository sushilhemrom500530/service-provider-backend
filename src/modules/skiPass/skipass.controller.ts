import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import catchAsync from '../../shared/catchAsync';
import sendResponse from '../../shared/sendResponse';
import { SkiPassService } from './skipass.service';

const idParam = (req: Request) => String(req.params.id);
const userOf = (req: Request) => req.user as JwtPayload;

const browse = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await SkiPassService.browseSkiPasses(req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Ski passes fetched successfully.', data, meta });
});

const getMine = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await SkiPassService.getMySkiPasses(userOf(req), req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Ski passes fetched successfully.', data, meta });
});

const getOne = catchAsync(async (req: Request, res: Response) => {
  const data = await SkiPassService.getSkiPass(idParam(req));
  sendResponse(res, { code: StatusCodes.OK, message: 'Ski pass fetched successfully.', data });
});

const getReviews = catchAsync(async (req: Request, res: Response) => {
  const { data, meta, rating } = await SkiPassService.getSkiPassReviews(idParam(req), req.query as any);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Reviews fetched successfully.',
    data,
    meta,
    rating,
  });
});

const create = catchAsync(async (req: Request, res: Response) => {
  const data = await SkiPassService.createSkiPass(userOf(req), req.body, req.file);
  sendResponse(res, { code: StatusCodes.CREATED, message: 'Ski pass created successfully.', data });
});

const update = catchAsync(async (req: Request, res: Response) => {
  const data = await SkiPassService.updateSkiPass(idParam(req), userOf(req), req.body, req.file);
  sendResponse(res, { code: StatusCodes.OK, message: 'Ski pass updated successfully.', data });
});

const setStatus = catchAsync(async (req: Request, res: Response) => {
  const data = await SkiPassService.setSkiPassStatus(idParam(req), userOf(req), req.body?.isActive);
  sendResponse(res, { code: StatusCodes.OK, message: 'Ski pass status updated.', data });
});

const remove = catchAsync(async (req: Request, res: Response) => {
  const data = await SkiPassService.deleteSkiPass(idParam(req), userOf(req));
  sendResponse(res, { code: StatusCodes.OK, message: 'Ski pass deleted successfully.', data });
});

const review = catchAsync(async (req: Request, res: Response) => {
  const data = await SkiPassService.reviewSkiPass(idParam(req), userOf(req), req.body);
  sendResponse(res, { code: StatusCodes.CREATED, message: 'Review added successfully.', data });
});

export const SkiPassController = {
  browse,
  getMine,
  getOne,
  getReviews,
  create,
  update,
  setStatus,
  remove,
  review,
};
