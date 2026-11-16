import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import catchAsync from './../../shared/catchAsync';
import sendResponse from './../../shared/sendResponse';
import { RestaurantService } from './restaurant.service';

const idParam = (req: Request) => String(req.params.id);
const filesOf = (req: Request) => (req as any).files as Record<string, any[]> | undefined;

const browse = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await RestaurantService.browse(req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Restaurants fetched.', data, meta });
});

const mine = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await RestaurantService.mine(req.user as JwtPayload, req.query as any);
  sendResponse(res, { code: StatusCodes.OK, message: 'Your restaurants fetched.', data, meta });
});

const detail = catchAsync(async (req: Request, res: Response) => {
  const data = await RestaurantService.detail(idParam(req));
  sendResponse(res, { code: StatusCodes.OK, message: 'Restaurant fetched.', data });
});

const reviews = catchAsync(async (req: Request, res: Response) => {
  const { data, meta, rating } = await RestaurantService.reviews(idParam(req), req.query as any);
  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Reviews fetched.',
    data,
    meta,
    rating,
  });
});

const create = catchAsync(async (req: Request, res: Response) => {
  const data = await RestaurantService.create(req.user as JwtPayload, req.body, filesOf(req));
  sendResponse(res, { code: StatusCodes.CREATED, message: 'Restaurant created.', data });
});

const update = catchAsync(async (req: Request, res: Response) => {
  const data = await RestaurantService.update(
    idParam(req),
    req.user as JwtPayload,
    req.body,
    filesOf(req),
  );
  sendResponse(res, { code: StatusCodes.OK, message: 'Restaurant updated.', data });
});

const setStatus = catchAsync(async (req: Request, res: Response) => {
  const data = await RestaurantService.setStatus(
    idParam(req),
    req.user as JwtPayload,
    req.body?.isActive,
  );
  sendResponse(res, { code: StatusCodes.OK, message: 'Restaurant status updated.', data });
});

const remove = catchAsync(async (req: Request, res: Response) => {
  const data = await RestaurantService.remove(idParam(req), req.user as JwtPayload);
  sendResponse(res, { code: StatusCodes.OK, message: 'Restaurant deleted.', data });
});

const review = catchAsync(async (req: Request, res: Response) => {
  const data = await RestaurantService.review(idParam(req), req.user as JwtPayload, req.body);
  sendResponse(res, { code: StatusCodes.CREATED, message: 'Review added.', data });
});

const updateServiceFee = catchAsync(async (req: Request, res: Response) => {
  const data = await RestaurantService.updateServiceFee(Number(req.body.serviceFee));
  sendResponse(res, { code: StatusCodes.OK, message: 'Restaurant service fee updated.', data });
});

const getServiceFee = catchAsync(async (_req: Request, res: Response) => {
  const data = await RestaurantService.getServiceFee();
  sendResponse(res, { code: StatusCodes.OK, message: 'Restaurant service fee fetched.', data });
});

export const RestaurantController = {
  browse,
  mine,
  detail,
  reviews,
  create,
  update,
  setStatus,
  remove,
  review,
  updateServiceFee,
  getServiceFee,
};
