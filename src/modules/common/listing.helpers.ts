/**
 * Shared logic for the 5 listing modules (Ski Pass, Ski Hire, Transport,
 * Restaurant, Massage): sub-category lookup, browse filters, reviews,
 * safe delete. Each module keeps its own model/service and calls these.
 */
import { Model, Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errors/AppErro';
import { Category } from '../category/category.model';
import { Booking } from '../booking/booking.model';
import {
  buildMeta,
  getPagination,
  idOf,
  searchRegex,
  toPublicUser,
  toReview,
} from '../../shared/apiHelpers';

export type ListingCategory =
  | 'Ski_Pass'
  | 'Ski_Hire'
  | 'Transport'
  | 'Restaurant'
  | 'Massage';

export const OPEN_BOOKING_STATUSES = ['Active', 'Pending'];

/* ------------------------------------------------------------------ */
/* Sub-categories                                                      */
/* ------------------------------------------------------------------ */

export type SubCategory = { id: string; name: string; photo: string };

/** id -> sub-category for one primary category (one query, no N+1) */
export const loadSubCategories = async (
  primary: ListingCategory,
): Promise<Map<string, SubCategory>> => {
  const docs: any[] = await Category.find({ primaryCategoryName: primary })
    .select('subCategory')
    .lean();
  const map = new Map<string, SubCategory>();
  for (const d of docs)
    for (const s of d.subCategory || [])
      map.set(String(s._id), {
        id: String(s._id),
        name: s.name || '',
        photo: s.categoryPhoto || '',
      });
  return map;
};

/** Sub-category ids whose name matches the search (for ?category=) */
export const findSubCategoryIds = async (
  primary: ListingCategory,
  nameOrId: string,
): Promise<Types.ObjectId[]> => {
  const value = String(nameOrId || '').trim();
  if (!value) return [];
  if (Types.ObjectId.isValid(value) && value.length === 24)
    return [new Types.ObjectId(value)];
  const map = await loadSubCategories(primary);
  const needle = value.toLowerCase();
  return [...map.values()]
    .filter(s => s.name.toLowerCase().includes(needle))
    .map(s => new Types.ObjectId(s.id));
};

export const assertSubCategory = async (primary: ListingCategory, id: unknown) => {
  const value = String(id ?? '').trim();
  if (!value) throw new AppError(StatusCodes.BAD_REQUEST, 'category is required.');
  if (!Types.ObjectId.isValid(value))
    throw new AppError(StatusCodes.BAD_REQUEST, 'category must be a valid id.');
  const exists = await Category.exists({
    primaryCategoryName: primary,
    'subCategory._id': value,
  });
  if (!exists)
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `category is not a ${primary.replace('_', ' ')} sub-category.`,
    );
};

/* ------------------------------------------------------------------ */
/* Browse                                                              */
/* ------------------------------------------------------------------ */

/** Listings visible to customers: active and not deleted (old docs have neither flag) */
export const PUBLIC_LISTING_FILTER = {
  isDeleted: { $ne: true },
  isActive: { $ne: false },
};

/**
 * Common browse query: search, category, serviceArea, owner, price range.
 * `priceField` is the field used for min/max price (e.g. "amount").
 */
export const buildListingFilter = async (
  primary: ListingCategory,
  query: Record<string, any>,
  opts: { priceField?: string; publicOnly?: boolean; owner?: string } = {},
) => {
  const filter: Record<string, any> = opts.publicOnly
    ? { ...PUBLIC_LISTING_FILTER }
    : { isDeleted: { $ne: true } };

  if (opts.owner) filter.owner = new Types.ObjectId(opts.owner);

  const title = searchRegex(query.search);
  if (title) filter.title = title;

  const area = searchRegex(query.serviceArea);
  if (area) filter.serviceArea = area;

  if (query.category) {
    const ids = await findSubCategoryIds(primary, query.category);
    filter.category = { $in: ids }; // empty $in -> no results
  }

  if (opts.priceField) {
    const min = Number(query.minPrice);
    const max = Number(query.maxPrice);
    const range: Record<string, number> = {};
    if (Number.isFinite(min) && query.minPrice !== undefined && query.minPrice !== '') range.$gte = min;
    if (Number.isFinite(max) && query.maxPrice !== undefined && query.maxPrice !== '') range.$lte = max;
    if (Object.keys(range).length) filter[opts.priceField] = range;
  }

  // status filter only for the owner's own list, never for public browse
  if (!opts.publicOnly) {
    if (query.status === 'active') filter.isActive = { $ne: false };
    if (query.status === 'inactive') filter.isActive = false;
  }

  return filter;
};

/** Run a paginated find and map each doc with `serialize` */
export const paginateListings = async (
  model: Model<any>,
  filter: Record<string, any>,
  query: Record<string, any>,
  sort: Record<string, 1 | -1>,
  serialize: (doc: any) => any,
  select = '-reviews -refunds -__v',
) => {
  const { page, limit, skip } = getPagination(query);
  const [docs, total] = await Promise.all([
    model
      .find(filter)
      .select(select)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate({ path: 'owner', select: 'fullName profileUrl' })
      .lean(),
    model.countDocuments(filter),
  ]);
  return { data: docs.map(serialize), meta: buildMeta(page, limit, total) };
};

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Add a review: only customers with a COMPLETED booking of this listing,
 * one review per customer (atomic, no race), average recalculated.
 */
export const addListingReview = async (
  model: Model<any>,
  listingId: string,
  user: JwtPayload,
  payload: { rating: unknown; comment: unknown },
) => {
  if (user?.role !== 'User')
    throw new AppError(StatusCodes.FORBIDDEN, 'Only customers can write reviews.');

  const rating = Number(payload?.rating);
  const comment = String(payload?.comment ?? '').trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new AppError(StatusCodes.BAD_REQUEST, 'rating must be a whole number from 1 to 5.');
  if (comment.length < 2)
    throw new AppError(StatusCodes.BAD_REQUEST, 'comment is required.');
  if (!Types.ObjectId.isValid(listingId))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid listing id.');

  const listing: any = await model.findOne({ _id: listingId, isDeleted: { $ne: true } })
    .select('_id')
    .lean();
  if (!listing) throw new AppError(StatusCodes.NOT_FOUND, 'Listing not found.');

  const booked = await Booking.exists({
    product: listingId,
    user: user.userId,
    bookingStatus: 'Completed',
  });
  if (!booked)
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'You can review this only after a completed booking.',
    );

  const userId = new Types.ObjectId(String(user.userId));
  const review = { _id: new Types.ObjectId(), userId, rating, comment, createdAt: new Date() };

  // atomic: push only when this user has no review yet
  const updated: any = await model.findOneAndUpdate(
    { _id: listingId, 'reviews.userId': { $ne: userId } },
    { $push: { reviews: review } },
    { new: true, runValidators: false },
  )
    .select('reviews')
    .lean();
  if (!updated)
    throw new AppError(StatusCodes.CONFLICT, 'You have already reviewed this listing.');

  const ratings = (updated.reviews || []).map((r: any) => Number(r.rating) || 0);
  const average = ratings.length
    ? round1(ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length)
    : 0;
  await model.updateOne({ _id: listingId }, { $set: { averageRating: average, reviewCount: ratings.length } });

  return {
    review: { id: String(review._id), rating, comment, createdAt: review.createdAt },
    rating: { average, count: ratings.length },
  };
};

/** Paginated reviews of a listing, newest first */
export const getListingReviews = async (
  model: Model<any>,
  listingId: string,
  query: Record<string, any>,
) => {
  if (!Types.ObjectId.isValid(listingId))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid listing id.');
  const doc: any = await model.findOne({ _id: listingId, isDeleted: { $ne: true } })
    .select('reviews averageRating')
    .populate({ path: 'reviews.userId', select: 'fullName profileUrl' })
    .lean();
  if (!doc) throw new AppError(StatusCodes.NOT_FOUND, 'Listing not found.');

  const all = [...(doc.reviews || [])].sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const { page, limit, skip } = getPagination(query);
  return {
    data: all.slice(skip, skip + limit).map(toReview),
    meta: buildMeta(page, limit, all.length),
    rating: { average: round1(Number(doc.averageRating) || 0), count: all.length },
  };
};

/* ------------------------------------------------------------------ */
/* Delete / status                                                     */
/* ------------------------------------------------------------------ */

/** Soft delete; refused while the listing has open (upcoming/active) bookings */
export const softDeleteListing = async (model: Model<any>, listing: any) => {
  const open = await Booking.exists({
    product: listing._id,
    bookingStatus: { $in: OPEN_BOOKING_STATUSES },
  });
  if (open)
    throw new AppError(
      StatusCodes.CONFLICT,
      'This listing has upcoming or active bookings. Finish or cancel them first, or set it inactive.',
    );
  await model.updateOne(
    { _id: listing._id },
    { $set: { isDeleted: true, isActive: false } },
  );
  return { id: idOf(listing), deleted: true };
};

export const setListingActive = async (model: Model<any>, listing: any, isActive: unknown) => {
  if (typeof isActive !== 'boolean' && !['true', 'false'].includes(String(isActive)))
    throw new AppError(StatusCodes.BAD_REQUEST, 'isActive must be true or false.');
  const value = isActive === true || String(isActive) === 'true';
  await model.updateOne({ _id: listing._id }, { $set: { isActive: value } });
  return { id: idOf(listing), isActive: value };
};

/** Load a listing that is not deleted, or 404 */
export const findListingOr404 = async (model: Model<any>, id: string, label = 'Listing') => {
  if (!Types.ObjectId.isValid(String(id)))
    throw new AppError(StatusCodes.BAD_REQUEST, `Invalid ${label.toLowerCase()} id.`);
  const doc = await model.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!doc) throw new AppError(StatusCodes.NOT_FOUND, `${label} not found.`);
  return doc;
};

export const ownerCard = toPublicUser;

/* ------------------------------------------------------------------ */
/* Editor forms: accept the detail shape back                          */
/* ------------------------------------------------------------------ */

const OBJECT_ID = /^[a-f\d]{24}$/i;

/**
 * Middleware for listing create/update (before validation). A listing detail
 * returns `category: "<service>"` (e.g. "Massage") and `subCategory: { id, name }`.
 * An editor that sends the loaded object back must not get a 400:
 *  - `subCategory` ({ id } object, JSON string or id) or `subCategoryId` -> the sub-category
 *  - `category` equal to the service name (or any non-id text) is read-only -> ignored
 *  - `category: "<sub-category id>"` keeps working as before
 */
export const acceptListingDetailShape = (req: any, _res: any, next: any) => {
  const body = req.body;
  if (!body || typeof body !== 'object') return next();
  let sub: any = body.subCategoryId ?? body.subCategory;
  if (typeof sub === 'string' && sub.trim().startsWith('{')) {
    try {
      sub = JSON.parse(sub);
    } catch {
      /* leave it: validation reports it */
    }
  }
  const subId = sub && typeof sub === 'object' ? (sub.id ?? sub._id) : sub;
  const category = typeof body.category === 'string' ? body.category.trim() : body.category;
  if (category !== undefined && !(typeof category === 'string' && OBJECT_ID.test(category))) delete body.category;
  if (body.category === undefined && typeof subId === 'string' && OBJECT_ID.test(subId)) body.category = subId;
  delete body.subCategory;
  delete body.subCategoryId;
  next();
};
