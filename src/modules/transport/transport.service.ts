import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';
import AppError from './../../errors/AppErro';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import {
  assertListingOwner,
  idOf,
  isAdmin,
  parseSort,
  toNumberOrUndefined,
  toPublicUser,
  toRating,
} from './../../shared/apiHelpers';
import {
  addListingReview,
  assertSubCategory,
  buildListingFilter,
  findListingOr404,
  getListingReviews,
  loadSubCategories,
  paginateListings,
  setListingActive,
  softDeleteListing,
  SubCategory,
} from './../common/listing.helpers';
import { Transport } from './transport.model';
import { USER_UPLOADS_FOLDER } from './transport.constant';
import { parseCreateBody, parseUpdateBody } from './transport.validations';

const CATEGORY = 'Transport' as const;
const LABEL = 'Transport';

const SORTS: Record<string, Record<string, 1 | -1>> = {
  price_asc: { amount: 1, _id: 1 },
  price_desc: { amount: -1, _id: 1 },
  rating: { averageRating: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
};

/* ------------------------------------------------------------------ */
/* Serializers                                                         */
/* ------------------------------------------------------------------ */

/** Number from a stored value (old docs may hold strings), else null */
const num = (v: unknown) => toNumberOrUndefined(v) ?? null;

const toCard = (doc: any, subs: Map<string, SubCategory>) => ({
  id: idOf(doc),
  category: CATEGORY,
  subCategory: subs.get(String(doc.category)) || null,
  title: doc.title || '',
  thumbnail: doc.thumbnail || '',
  serviceArea: doc.serviceArea || '',
  price: { amount: num(doc.amount) ?? 0, unit: 'per_trip' },
  rating: toRating(doc),
  provider: toPublicUser(doc.owner),
  isActive: doc.isActive !== false,
});

const toDetail = (doc: any, subs: Map<string, SubCategory>) => ({
  ...toCard(doc, subs),
  description: doc.description || '',
  seats: num(doc.personCount),
  mileage: doc.milage === undefined || doc.milage === null ? '' : String(doc.milage),
  power: doc.power === undefined || doc.power === null ? '' : String(doc.power),
  extraChargePerHour: num(doc.extraChargePerHours),
  insuranceFee: num(doc.insuranceFee),
  maintenanceFee: num(doc.maintainCharge),
  createdAt: doc.createdAt,
});

/** Load one listing (not deleted) as a lean detail object */
const loadDetail = async (id: string) => {
  const doc: any = await Transport.findOne({ _id: id, isDeleted: { $ne: true } })
    .select('-refunds -__v')
    .populate({ path: 'owner', select: 'fullName profileUrl' })
    .lean();
  if (!doc) throw new AppError(StatusCodes.NOT_FOUND, `${LABEL} not found.`);
  // reviews are loaded only so the rating count is right on old docs
  // (no reviewCount); they are never sent (toDetail whitelists)
  const subs = await loadSubCategories(CATEGORY);
  return toDetail(doc, subs);
};

/** API field -> stored field */
const toStored = (input: Record<string, any>) => {
  const map: Record<string, string> = {
    category: 'category',
    title: 'title',
    serviceArea: 'serviceArea',
    amount: 'amount',
    seats: 'personCount',
    mileage: 'milage',
    power: 'power',
    extraChargePerHour: 'extraChargePerHours',
    insuranceFee: 'insuranceFee',
    maintenanceFee: 'maintainCharge',
    description: 'description',
  };
  const out: Record<string, any> = {};
  for (const [api, stored] of Object.entries(map))
    if (input[api] !== undefined) out[stored] = input[api];
  return out;
};

/** Thumbnail: the app sends it as "file"; "thumbnail" is accepted too */
const pickThumbnail = (req: Request): Express.Multer.File | undefined => {
  if (req.file) return req.file;
  const files: any = req.files;
  if (!files) return undefined;
  if (Array.isArray(files))
    return files.find(f => ['file', 'thumbnail'].includes(f.fieldname));
  return files.file?.[0] || files.thumbnail?.[0];
};

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

const browse = async (query: Record<string, any>) => {
  const filter = await buildListingFilter(CATEGORY, query, {
    priceField: 'amount',
    publicOnly: true,
  });
  const subs = await loadSubCategories(CATEGORY);
  return paginateListings(Transport, filter, query, parseSort(query.sort, SORTS, SORTS.newest), doc =>
    toCard(doc, subs),
  );
};

/** Provider: own listings (incl. inactive). Admin: all listings, optional ?owner= */
const myListings = async (user: JwtPayload, query: Record<string, any>) => {
  let owner: string | undefined = String(user.userId);
  if (isAdmin(user)) owner = /^[a-f\d]{24}$/i.test(String(query.owner || '')) ? String(query.owner) : undefined;
  const filter = await buildListingFilter(CATEGORY, query, { priceField: 'amount', owner });
  const subs = await loadSubCategories(CATEGORY);
  return paginateListings(Transport, filter, query, parseSort(query.sort, SORTS, SORTS.newest), doc =>
    toCard(doc, subs),
  );
};

const getById = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid transport id.');
  return loadDetail(id);
};

const getReviews = (id: string, query: Record<string, any>) =>
  getListingReviews(Transport, id, query);

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

const create = async (req: Request) => {
  const user = req.user as JwtPayload;
  const account: any = await User.findById(user?.userId).select('providerType role').lean();
  if (!account || account.role !== 'Provider' || account.providerType !== CATEGORY)
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only Transport providers can create a transport listing.',
    );

  const input = parseCreateBody(req.body);
  await assertSubCategory(CATEGORY, input.category);

  const file = pickThumbnail(req);
  if (!file) throw new AppError(StatusCodes.BAD_REQUEST, 'A thumbnail image is required (field "file").');
  const thumbnail = await s3Services.uploadSingleFileToS3(file, USER_UPLOADS_FOLDER);

  const doc = await Transport.create({
    ...toStored(input),
    thumbnail,
    owner: account._id,
    isActive: true,
    isDeleted: false,
    averageRating: 0,
    reviewCount: 0,
  });
  return loadDetail(String(doc._id));
};

const update = async (req: Request) => {
  const user = req.user as JwtPayload;
  const id = String(req.params.id);
  const listing = await findListingOr404(Transport, id, LABEL);
  assertListingOwner(listing, user);

  const input = parseUpdateBody(req.body);
  if (input.category !== undefined) await assertSubCategory(CATEGORY, input.category);

  const set: Record<string, any> = toStored(input);
  const file = pickThumbnail(req);
  if (file) set.thumbnail = await s3Services.uploadSingleFileToS3(file, USER_UPLOADS_FOLDER);

  if (Object.keys(set).length)
    await Transport.updateOne({ _id: listing._id }, { $set: set }, { runValidators: true });
  return loadDetail(id);
};

const setStatus = async (req: Request) => {
  const user = req.user as JwtPayload;
  const listing = await findListingOr404(Transport, String(req.params.id), LABEL);
  assertListingOwner(listing, user);
  return setListingActive(Transport, listing, req.body?.isActive);
};

const remove = async (id: string, user: JwtPayload) => {
  const listing = await findListingOr404(Transport, id, LABEL);
  assertListingOwner(listing, user);
  return softDeleteListing(Transport, listing);
};

const review = (id: string, user: JwtPayload, body: any) =>
  addListingReview(Transport, id, user, { rating: body?.rating, comment: body?.comment });

export const TransportService = {
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
