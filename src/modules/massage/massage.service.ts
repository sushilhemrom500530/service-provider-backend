import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from './../../errors/AppErro';
import { User } from './../user/user.model';
import { s3Services } from './../../aws/s3Service';
import {
  assertListingOwner,
  isAdmin,
  parseSort,
  pickDefined,
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
import { Massage } from './massage.model';
import { MASSAGE_CATEGORY, USER_UPLOADS_FOLDER } from './massage.constant';
import { parseDurationMinutes } from './massage.utils';

/* ------------------------------------------------------------------ */
/* Serializers                                                         */
/* ------------------------------------------------------------------ */

type DurationInput = { id?: string; duration: string; minutes: number; amount: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** priceByDuration -> [{id, duration, minutes, price}], shortest first */
const toDurations = (doc: any) =>
  (doc?.priceByDuration || [])
    .map((p: any) => ({
      id: p?._id ? String(p._id) : undefined,
      duration: p?.duration ?? '',
      minutes: parseDurationMinutes(p?.duration),
      price: Number(p?.amount) || 0,
    }))
    .sort((a: any, b: any) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity));

/** Starting price: the cheapest duration, else the listing amount */
const startingPrice = (doc: any) => {
  const prices = (doc?.priceByDuration || [])
    .map((p: any) => Number(p?.amount))
    .filter((n: number) => Number.isFinite(n) && n > 0);
  const amount = prices.length ? Math.min(...prices) : Number(doc?.amount) || 0;
  return { amount: round2(amount), unit: 'per_session' };
};

const toCard = (doc: any, subCategories: Map<string, SubCategory>) => ({
  id: String(doc._id),
  category: MASSAGE_CATEGORY,
  subCategory: subCategories.get(String(doc.category)) || null,
  title: doc.title,
  thumbnail: doc.thumbnail,
  serviceArea: doc.serviceArea,
  price: startingPrice(doc),
  rating: toRating(doc),
  provider: toPublicUser(doc.owner),
  isActive: doc.isActive !== false,
});

const toDetail = (doc: any, subCategories: Map<string, SubCategory>) => ({
  ...toCard(doc, subCategories),
  description: doc.description || '',
  openTime: doc.openTime,
  closeTime: doc.closeTime,
  durations: toDurations(doc),
  benefits: doc.benefits,
  recommendations: doc.ourRecommendations,
  createdAt: doc.createdAt,
});

/** Lean detail of one listing (never reviews/refunds/__v) */
const loadDetail = async (id: string) => {
  const [doc, subCategories] = await Promise.all([
    Massage.findOne({ _id: id, isDeleted: { $ne: true } })
      .select('-reviews -refunds -__v')
      .populate({ path: 'owner', select: 'fullName profileUrl' })
      .lean(),
    loadSubCategories(MASSAGE_CATEGORY),
  ]);
  if (!doc) throw new AppError(StatusCodes.NOT_FOUND, 'Massage not found.');
  return toDetail(doc, subCategories);
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const SORTS: Record<string, Record<string, 1 | -1>> = {
  price_asc: { amount: 1, createdAt: -1 },
  price_desc: { amount: -1, createdAt: -1 },
  rating: { averageRating: -1, reviewCount: -1, createdAt: -1 },
  newest: { createdAt: -1 },
};

const cheapest = (list: DurationInput[]) => Math.min(...list.map(d => d.amount));

/** Keep the _id of an existing duration (matched by id, then by minutes) */
const mergeDurations = (existing: any[], incoming: DurationInput[]) =>
  incoming.map(item => {
    const match =
      existing.find(p => item.id && String(p._id) === String(item.id)) ||
      existing.find(p => parseDurationMinutes(p.duration) === item.minutes);
    return {
      ...(match?._id && { _id: match._id }),
      duration: item.duration,
      amount: item.amount,
    };
  });

const uploadThumbnail = async (file?: Express.Multer.File) =>
  file ? s3Services.uploadSingleFileToS3(file, USER_UPLOADS_FOLDER) : undefined;

/* ------------------------------------------------------------------ */
/* Browse / detail                                                     */
/* ------------------------------------------------------------------ */

const browse = async (query: Record<string, any>) => {
  const [filter, subCategories] = await Promise.all([
    buildListingFilter(MASSAGE_CATEGORY, query, { priceField: 'amount', publicOnly: true }),
    loadSubCategories(MASSAGE_CATEGORY),
  ]);
  return paginateListings(Massage, filter, query, parseSort(query.sort, SORTS), doc =>
    toCard(doc, subCategories),
  );
};

const myListings = async (user: JwtPayload, query: Record<string, any>) => {
  // Admin sees every listing (optionally ?owner=<id>), a provider only their own
  const owner = isAdmin(user)
    ? query.owner && /^[a-f\d]{24}$/i.test(String(query.owner))
      ? String(query.owner)
      : undefined
    : String(user.userId);
  const [filter, subCategories] = await Promise.all([
    buildListingFilter(MASSAGE_CATEGORY, query, { priceField: 'amount', owner }),
    loadSubCategories(MASSAGE_CATEGORY),
  ]);
  return paginateListings(Massage, filter, query, parseSort(query.sort, SORTS), doc =>
    toCard(doc, subCategories),
  );
};

const getDetail = async (id: string) => {
  await findListingOr404(Massage, id, 'Massage'); // 400 on a bad id
  return loadDetail(id);
};

const getReviews = (id: string, query: Record<string, any>) =>
  getListingReviews(Massage, id, query);

/* ------------------------------------------------------------------ */
/* Create / update                                                     */
/* ------------------------------------------------------------------ */

const create = async (user: JwtPayload, body: any, file?: Express.Multer.File) => {
  const dbUser: any = await User.findById(user?.userId).select('providerType role').lean();
  if (!dbUser || dbUser.role !== 'Provider' || dbUser.providerType !== MASSAGE_CATEGORY)
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only Massage providers can create a massage listing.',
    );

  await assertSubCategory(MASSAGE_CATEGORY, body.category);
  if (!file) throw new AppError(StatusCodes.BAD_REQUEST, 'thumbnail image (field "file") is required.');

  const durations: DurationInput[] = body.priceByDuration;
  const data = {
    ...pickDefined(body, [
      'category',
      'title',
      'description',
      'openTime',
      'closeTime',
      'serviceArea',
      'benefits',
      'ourRecommendations',
    ]),
    priceByDuration: mergeDurations([], durations),
    amount: body.amount ?? cheapest(durations),
    thumbnail: await uploadThumbnail(file),
    owner: dbUser._id,
  };

  const doc = await Massage.create(data);
  return loadDetail(String(doc._id));
};

const UPDATABLE = [
  'category',
  'title',
  'description',
  'openTime',
  'closeTime',
  'serviceArea',
  'amount',
  'benefits',
  'ourRecommendations',
];

const update = async (
  id: string,
  user: JwtPayload,
  body: any,
  file?: Express.Multer.File,
) => {
  const listing: any = await findListingOr404(Massage, id, 'Massage');
  assertListingOwner(listing, user);

  if (body.category !== undefined) await assertSubCategory(MASSAGE_CATEGORY, body.category);

  const set: Record<string, any> = pickDefined(body, UPDATABLE);

  if (body.priceByDuration !== undefined) {
    const durations: DurationInput[] = body.priceByDuration;
    // the full list replaces the old one; _ids are kept for matching durations
    set.priceByDuration = mergeDurations(listing.priceByDuration || [], durations);
    // keep the fallback price in line with the new list unless one is sent
    if (body.amount === undefined) set.amount = cheapest(durations);
  }

  const thumbnail = await uploadThumbnail(file);
  if (thumbnail) set.thumbnail = thumbnail;

  if (Object.keys(set).length)
    await Massage.updateOne({ _id: listing._id }, { $set: set }, { runValidators: true });

  return loadDetail(String(listing._id));
};

/* ------------------------------------------------------------------ */
/* Status / delete / review                                            */
/* ------------------------------------------------------------------ */

const setStatus = async (id: string, user: JwtPayload, isActive: unknown) => {
  const listing = await findListingOr404(Massage, id, 'Massage');
  assertListingOwner(listing, user);
  return setListingActive(Massage, listing, isActive);
};

const remove = async (id: string, user: JwtPayload) => {
  const listing = await findListingOr404(Massage, id, 'Massage');
  assertListingOwner(listing, user);
  return softDeleteListing(Massage, listing);
};

const review = (id: string, user: JwtPayload, body: any) =>
  addListingReview(Massage, id, user, body);

export const MassageService = {
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
