import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errors/AppErro';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import { USER_UPLOADS_FOLDER, SKI_PASS_CATEGORY, SKI_PASS_PRICE_UNIT } from './skipass.constant';
import { SkiPass } from './skipass.model';
import { SKI_PASS_TYPES } from './skipass.interface';
import { POLICY } from '../booking/booking.rules';
import {
  assertListingOwner,
  idOf,
  isAdmin,
  parseSort,
  pickDefined,
  toPublicUser,
  toRating,
} from '../../shared/apiHelpers';
import {
  addListingReview,
  buildListingFilter,
  findListingOr404,
  getListingReviews,
  paginateListings,
  setListingActive,
  softDeleteListing,
} from '../common/listing.helpers';

const LABEL = 'Ski pass';

const SORTS: Record<string, Record<string, 1 | -1>> = {
  price_asc: { amount: 1, createdAt: -1 },
  price_desc: { amount: -1, createdAt: -1 },
  rating: { averageRating: -1, createdAt: -1 },
  newest: { createdAt: -1 },
};

const CREATE_FIELDS = ['title', 'skiPassType', 'services', 'serviceArea', 'amount', 'description'];
/** Stored fields an owner/admin may change (thumbnail only via an uploaded file) */
const UPDATE_FIELDS = [...CREATE_FIELDS, 'isActive'];

/* ------------------------------------------------------------------ */
/* Serializers                                                         */
/* ------------------------------------------------------------------ */

export const toSkiPassCard = (doc: any) => ({
  id: idOf(doc),
  category: SKI_PASS_CATEGORY,
  subCategory: null,
  title: doc.title,
  thumbnail: doc.thumbnail,
  serviceArea: doc.serviceArea,
  passType: doc.skiPassType,
  price: { amount: Number(doc.amount) || 0, unit: SKI_PASS_PRICE_UNIT },
  rating: toRating({ averageRating: doc.averageRating, reviewCount: doc.reviewCount }),
  provider: toPublicUser(doc.owner),
  isActive: doc.isActive !== false,
});

export const toSkiPassDetail = (doc: any) => ({
  ...toSkiPassCard(doc),
  description: doc.description,
  services: (doc.services || []).map((s: any) => ({
    title: s.title,
    description: s.description,
  })),
  // most people on one booking (the server refuses more)
  maxPeoplePerBooking: POLICY.SKI_PASS_MAX_PEOPLE,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const loadDetail = async (id: string) => {
  const doc = await SkiPass.findOne({ _id: id, isDeleted: { $ne: true } })
    .select('-reviews -refunds -__v')
    .populate({ path: 'owner', select: 'fullName profileUrl' })
    .lean();
  if (!doc) throw new AppError(StatusCodes.NOT_FOUND, `${LABEL} not found.`);
  return toSkiPassDetail(doc);
};

const uploadThumbnail = async (file?: Express.Multer.File) =>
  file ? s3Services.uploadSingleFileToS3(file, USER_UPLOADS_FOLDER) : undefined;

/* ------------------------------------------------------------------ */
/* Browse                                                              */
/* ------------------------------------------------------------------ */

const withPassTypeFilter = (filter: Record<string, any>, query: Record<string, any>) => {
  const raw = query.passType ?? query.skiPassType;
  if (raw !== undefined && raw !== '') {
    const match = SKI_PASS_TYPES.find(t => t.toLowerCase() === String(raw).trim().toLowerCase());
    filter.skiPassType = match ?? { $in: [] }; // unknown type -> no results
  }
  return filter;
};

/** Ski passes have no sub-categories: `?category=` is ignored */
const withoutCategory = (query: Record<string, any>) => {
  const { category: _ignored, ...rest } = query || {};
  return rest;
};

const browseSkiPasses = async (query: Record<string, any>) => {
  const filter = withPassTypeFilter(
    await buildListingFilter(SKI_PASS_CATEGORY, withoutCategory(query), {
      priceField: 'amount',
      publicOnly: true,
    }),
    query,
  );
  return paginateListings(SkiPass, filter, query, parseSort(query.sort, SORTS), toSkiPassCard);
};

const getMySkiPasses = async (user: JwtPayload, query: Record<string, any>) => {
  // Admin sees every provider's passes (optionally ?owner=<id>), a provider only theirs
  const owner = isAdmin(user)
    ? query.owner
      ? String(query.owner)
      : undefined
    : String(user.userId);
  if (owner && !/^[a-f\d]{24}$/i.test(owner))
    throw new AppError(StatusCodes.BAD_REQUEST, 'owner must be a valid id.');
  const filter = withPassTypeFilter(
    await buildListingFilter(SKI_PASS_CATEGORY, withoutCategory(query), {
      priceField: 'amount',
      owner,
    }),
    query,
  );
  return paginateListings(SkiPass, filter, query, parseSort(query.sort, SORTS), toSkiPassCard);
};

const getSkiPass = async (id: string) => {
  await findListingOr404(SkiPass, id, LABEL); // 400 bad id, 404 missing or deleted
  return loadDetail(id);
};

const getSkiPassReviews = (id: string, query: Record<string, any>) =>
  getListingReviews(SkiPass, id, query);

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

const createSkiPass = async (
  user: JwtPayload,
  body: Record<string, any>,
  file?: Express.Multer.File,
) => {
  const dbUser: any = await User.findById(user?.userId).select('providerType role').lean();
  if (!dbUser || dbUser.role !== 'Provider' || dbUser.providerType !== SKI_PASS_CATEGORY)
    throw new AppError(StatusCodes.FORBIDDEN, 'Only Ski Pass providers can create a ski pass.');

  if (!file)
    throw new AppError(StatusCodes.BAD_REQUEST, 'A thumbnail image (field "file") is required.');

  const data = pickDefined(body, CREATE_FIELDS);
  const thumbnail = await uploadThumbnail(file);

  const created = await SkiPass.create({
    ...data,
    thumbnail,
    owner: dbUser._id, // always the caller, never from the body
    isActive: true,
    isDeleted: false,
  });
  return loadDetail(String(created._id));
};

const updateSkiPass = async (
  id: string,
  user: JwtPayload,
  body: Record<string, any>,
  file?: Express.Multer.File,
) => {
  const listing = await findListingOr404(SkiPass, id, LABEL);
  assertListingOwner(listing, user);

  const update = pickDefined(body, UPDATE_FIELDS);
  const thumbnail = await uploadThumbnail(file);
  if (thumbnail) update.thumbnail = thumbnail;

  if (Object.keys(update).length)
    await SkiPass.updateOne({ _id: listing._id }, { $set: update }, { runValidators: true });
  return loadDetail(id);
};

const setSkiPassStatus = async (id: string, user: JwtPayload, isActive: unknown) => {
  const listing = await findListingOr404(SkiPass, id, LABEL);
  assertListingOwner(listing, user);
  return setListingActive(SkiPass, listing, isActive);
};

const deleteSkiPass = async (id: string, user: JwtPayload) => {
  const listing = await findListingOr404(SkiPass, id, LABEL);
  assertListingOwner(listing, user);
  return softDeleteListing(SkiPass, listing);
};

const reviewSkiPass = (id: string, user: JwtPayload, body: Record<string, any>) =>
  addListingReview(SkiPass, id, user, { rating: body?.rating, comment: body?.comment });

export const SkiPassService = {
  browseSkiPasses,
  getMySkiPasses,
  getSkiPass,
  getSkiPassReviews,
  createSkiPass,
  updateSkiPass,
  setSkiPassStatus,
  deleteSkiPass,
  reviewSkiPass,
};
