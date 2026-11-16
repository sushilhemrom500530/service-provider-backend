import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errors/AppErro';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import { Booking } from './../booking/booking.model';
import {
  assertListingOwner,
  isAdmin,
  parseSort,
  pickDefined,
  toPublicUser,
  toRating,
} from '../../shared/apiHelpers';
import {
  OPEN_BOOKING_STATUSES,
  SubCategory,
  addListingReview,
  assertSubCategory,
  buildListingFilter,
  findListingOr404,
  getListingReviews,
  loadSubCategories,
  paginateListings,
  setListingActive,
  softDeleteListing,
} from '../common/listing.helpers';
import { SkiHire } from './skihire.model';
import { SkiHireItemInput } from './skihire.interface';
import { USER_UPLOADS_FOLDER } from './skihire.constant';

const CATEGORY = 'Ski_Hire' as const;
const LABEL = 'Ski hire';

type UploadedFiles = Record<string, any[]> | undefined;

/* ------------------------------------------------------------------ */
/* Serializers                                                         */
/* ------------------------------------------------------------------ */

const cheapestPrice = (items: any[] = []) => {
  const prices = items.map(i => Number(i?.price)).filter(n => Number.isFinite(n));
  return prices.length ? Math.min(...prices) : 0;
};

const toCard = (doc: any, subs: Map<string, SubCategory>) => ({
  id: String(doc._id),
  category: CATEGORY,
  subCategory: subs.get(String(doc.category)) || null,
  title: doc.title,
  thumbnail: doc.thumbnail || '',
  serviceArea: doc.serviceArea || '',
  price: { amount: cheapestPrice(doc.items), unit: doc.priceUnit || 'per_day' },
  rating: toRating({ averageRating: doc.averageRating, reviewCount: doc.reviewCount }),
  provider: toPublicUser(doc.owner),
  isActive: doc.isActive !== false,
});

const toItem = (i: any) => ({
  id: String(i._id),
  name: i.productName,
  photo: i.productPhoto || '',
  price: i.price,
  quantity: i.totalQty,
});

const toDetail = (doc: any, subs: Map<string, SubCategory>) => ({
  ...toCard(doc, subs),
  description: doc.description || '',
  priceUnit: doc.priceUnit || 'per_day',
  extraChargePerHour: Number(doc.extraChargePerHour) || 0,
  items: (doc.items || []).map(toItem),
  createdAt: doc.createdAt,
});

const loadDetail = async (id: string) => {
  const doc: any = await SkiHire.findOne({ _id: id, isDeleted: { $ne: true } })
    .select('-reviews -refunds -__v')
    .populate({ path: 'owner', select: 'fullName profileUrl' })
    .lean();
  if (!doc) throw new AppError(StatusCodes.NOT_FOUND, `${LABEL} not found.`);
  return toDetail(doc, await loadSubCategories(CATEGORY));
};

/* ------------------------------------------------------------------ */
/* Uploads                                                             */
/* ------------------------------------------------------------------ */

const upload = (file: any) => s3Services.uploadSingleFileToS3(file, USER_UPLOADS_FOLDER);

const uploadThumbnail = async (files: UploadedFiles) => {
  const file = files?.thumbnail?.[0] || files?.file?.[0];
  return file ? ((await upload(file)) as string) : undefined;
};

/**
 * Item photos by index of the sent items array. Supported field names:
 *   itemPhoto_<i>             (preferred)
 *   files[<i>] / images[<i>]  (explicit index)
 *   files / images            (repeated: i-th file = i-th item, what the app sends today)
 */
const itemPhotoFiles = (files: UploadedFiles) => {
  const byIndex = new Map<number, any>();
  if (!files) return byIndex;
  const all = Object.values(files).flat();
  // 1. explicit index: itemPhoto_<i>, files[<i>], images[<i>]
  for (const f of all) {
    const name = String(f?.fieldname || '');
    const m = /^itemPhoto_(\d+)$/.exec(name) || /^(?:files|images)\[(\d+)\]$/.exec(name);
    if (m && !byIndex.has(Number(m[1]))) byIndex.set(Number(m[1]), f);
  }
  // 2. repeated files / images (or files[]): fill the free positions in order
  let next = 0;
  for (const f of all) {
    if (!/^(?:files|images)(?:\[\])?$/.test(String(f?.fieldname || ''))) continue;
    while (byIndex.has(next)) next++;
    byIndex.set(next, f);
  }
  return byIndex;
};

/* ------------------------------------------------------------------ */
/* Item helpers                                                        */
/* ------------------------------------------------------------------ */

const itemName = (i: SkiHireItemInput) => (i.name ?? i.productName)?.trim();
const itemId = (i: SkiHireItemInput) => i.id ?? i._id;
const itemPhotoUrl = (i: SkiHireItemInput) => {
  const p = (i.photo ?? i.productPhoto ?? '').trim();
  return /^https?:\/\//i.test(p) ? p : undefined;
};
const sameName = (a: unknown, b: unknown) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

const sumPrices = (items: any[]) =>
  items.reduce((sum, i) => sum + (Number(i.price) || 0), 0);

const getItemsInput = (body: any): SkiHireItemInput[] | undefined =>
  Array.isArray(body?.items)
    ? body.items
    : Array.isArray(body?.productItems)
      ? body.productItems
      : undefined;

/* ------------------------------------------------------------------ */
/* Browse                                                              */
/* ------------------------------------------------------------------ */

const SORTS: Record<string, Record<string, 1 | -1>> = {
  price_asc: { 'items.price': 1, createdAt: -1 }, // ascending uses the cheapest item
  price_desc: { 'items.price': -1, createdAt: -1 },
  rating: { averageRating: -1, reviewCount: -1, createdAt: -1 },
  newest: { createdAt: -1 },
};

/** min/max price: at least one item priced inside the range */
const itemPriceRange = (filter: Record<string, any>) => {
  const range = filter['items.price'];
  if (range) {
    delete filter['items.price'];
    filter.items = { $elemMatch: { price: range } };
  }
  return filter;
};

const browse = async (query: Record<string, any>) => {
  const filter = itemPriceRange(
    await buildListingFilter(CATEGORY, query, { priceField: 'items.price', publicOnly: true }),
  );
  const subs = await loadSubCategories(CATEGORY);
  return paginateListings(SkiHire, filter, query, parseSort(query.sort, SORTS), d =>
    toCard(d, subs),
  );
};

/** Provider: own listings (active + inactive). Admin: all, optional ?owner= */
const myListings = async (user: JwtPayload, query: Record<string, any>) => {
  let owner: string | undefined = String(user.userId);
  if (isAdmin(user))
    owner = query.owner && Types.ObjectId.isValid(String(query.owner)) ? String(query.owner) : undefined;
  const filter = await buildListingFilter(
    CATEGORY,
    { search: query.search, status: query.status, category: query.category },
    { owner },
  );
  const subs = await loadSubCategories(CATEGORY);
  return paginateListings(SkiHire, filter, query, parseSort(query.sort, SORTS), d =>
    toCard(d, subs),
  );
};

const getDetail = async (id: string) => {
  if (!Types.ObjectId.isValid(id))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid ski hire id.');
  return loadDetail(id);
};

const getReviews = (id: string, query: Record<string, any>) =>
  getListingReviews(SkiHire, id, query);

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

const create = async (user: JwtPayload, body: any, files: UploadedFiles) => {
  const me: any = await User.findById(user?.userId).select('providerType role').lean();
  if (!me || me.role !== 'Provider' || me.providerType !== CATEGORY)
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only Ski Hire providers can create a ski hire listing.',
    );

  await assertSubCategory(CATEGORY, body.category);

  const input = getItemsInput(body);
  if (!input?.length)
    throw new AppError(StatusCodes.BAD_REQUEST, 'At least one item is required.');

  const thumbnail = (await uploadThumbnail(files)) || body.thumbnail;
  if (!thumbnail) throw new AppError(StatusCodes.BAD_REQUEST, 'thumbnail is required.');

  const photos = itemPhotoFiles(files);
  const items = await Promise.all(
    input.map(async (i, index) => {
      const file = photos.get(index);
      const quantity = Number(i.quantity);
      return {
        _id: new Types.ObjectId(),
        productName: itemName(i) as string,
        productPhoto: file ? ((await upload(file)) as string) : itemPhotoUrl(i) || '',
        price: Number(i.price),
        totalQty: quantity,
        availableQty: quantity,
      };
    }),
  );

  const doc = await SkiHire.create({
    category: body.category,
    title: body.title,
    description: body.description || '',
    thumbnail,
    owner: user.userId, // always the caller, never from the body
    extraChargePerHour: Number(body.extraChargePerHour) || 0,
    priceUnit: body.priceUnit || 'per_day',
    serviceArea: body.serviceArea,
    items,
    totalPrice: sumPrices(items),
  });
  return loadDetail(String(doc._id));
};

/* ------------------------------------------------------------------ */
/* Update                                                              */
/* ------------------------------------------------------------------ */

/**
 * Merge sent items into the stored ones.
 * - match by id/_id, then by the same name, then by position when the
 *   number of sent items equals the number of stored items
 * - the stored `_id` is kept (bookings reference it)
 * - booked stock is kept: available = oldAvailable + (newTotal - oldTotal), 0..total
 * - missing price/quantity/name/photo keep the old value
 * - items not sent are kept; removing one needs `removeItemIds`
 */
const mergeItems = async (
  listingId: Types.ObjectId,
  stored: any[],
  input: SkiHireItemInput[] | undefined,
  removeIds: string[] | undefined,
  files: UploadedFiles,
) => {
  const result = stored.map(i => ({
    _id: i._id,
    productName: i.productName,
    productPhoto: i.productPhoto || '',
    price: i.price,
    totalQty: i.totalQty,
    availableQty: i.availableQty ?? i.totalQty,
  }));
  const photos = itemPhotoFiles(files);
  const matched = new Set<number>();
  const anyIds = (input || []).some(i => Boolean(itemId(i)));

  for (const [index, sent] of (input || []).entries()) {
    const sentId = itemId(sent);
    let at = -1;
    if (sentId) {
      at = result.findIndex(r => String(r._id) === String(sentId));
      if (at < 0)
        throw new AppError(StatusCodes.BAD_REQUEST, `Item ${sentId} does not belong to this listing.`);
    } else {
      at = result.findIndex((r, k) => !matched.has(k) && sameName(r.productName, itemName(sent)));
      // legacy app: the full list without ids -> same position
      if (at < 0 && !anyIds && input!.length === stored.length && !matched.has(index)) at = index;
    }

    const file = photos.get(index);
    const photo = file ? ((await upload(file)) as string) : itemPhotoUrl(sent);

    if (at >= 0) {
      if (matched.has(at))
        throw new AppError(StatusCodes.BAD_REQUEST, 'The same item was sent twice.');
      matched.add(at);
      const old = result[at];
      const newTotal = sent.quantity !== undefined ? Number(sent.quantity) : old.totalQty;
      const available = Number(old.availableQty) + (newTotal - Number(old.totalQty));
      result[at] = {
        ...old,
        productName: itemName(sent) || old.productName,
        productPhoto: photo || old.productPhoto,
        price: sent.price !== undefined ? Number(sent.price) : old.price,
        totalQty: newTotal,
        availableQty: Math.min(Math.max(available, 0), newTotal),
      };
    } else {
      const name = itemName(sent);
      if (!name || sent.price === undefined || sent.quantity === undefined)
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          `New item #${index + 1} needs name, price and quantity.`,
        );
      matched.add(result.length);
      result.push({
        _id: new Types.ObjectId(),
        productName: name,
        productPhoto: photo || '',
        price: Number(sent.price),
        totalQty: Number(sent.quantity),
        availableQty: Number(sent.quantity),
      });
    }
  }

  for (const removeId of removeIds || []) {
    const at = result.findIndex(r => String(r._id) === String(removeId));
    if (at < 0)
      throw new AppError(StatusCodes.BAD_REQUEST, `Item ${removeId} does not belong to this listing.`);
    const booked = await Booking.exists({
      product: listingId,
      bookingStatus: { $in: OPEN_BOOKING_STATUSES },
      'bookingItems.itemId': result[at]._id,
    });
    if (booked)
      throw new AppError(
        StatusCodes.CONFLICT,
        `"${result[at].productName}" has upcoming or active bookings and cannot be removed.`,
      );
    result.splice(at, 1);
  }

  if (!result.length)
    throw new AppError(StatusCodes.BAD_REQUEST, 'A listing needs at least one item.');
  return result;
};

const UPDATABLE = [
  'category',
  'title',
  'description',
  'thumbnail',
  'extraChargePerHour',
  'priceUnit',
  'serviceArea',
];

const update = async (id: string, user: JwtPayload, body: any, files: UploadedFiles) => {
  const listing: any = await findListingOr404(SkiHire, id, LABEL);
  assertListingOwner(listing, user);

  const $set: Record<string, any> = pickDefined(body || {}, UPDATABLE);
  if ($set.category !== undefined) await assertSubCategory(CATEGORY, $set.category);
  if ($set.extraChargePerHour !== undefined)
    $set.extraChargePerHour = Number($set.extraChargePerHour) || 0;

  const thumbnail = await uploadThumbnail(files);
  if (thumbnail) $set.thumbnail = thumbnail;

  const input = getItemsInput(body);
  const removeIds: string[] | undefined = body?.removeItemIds;
  const hasItemPhotos = itemPhotoFiles(files).size > 0;
  if (input || removeIds?.length || hasItemPhotos) {
    const stored = (listing.toObject?.() ?? listing).items || [];
    // photos without an items array: index i = stored item i
    const effectiveInput =
      input ?? (hasItemPhotos ? stored.map((s: any) => ({ id: String(s._id) })) : undefined);
    $set.items = await mergeItems(listing._id, stored, effectiveInput, removeIds, files);
    $set.totalPrice = sumPrices($set.items);
  }

  if (Object.keys($set).length)
    await SkiHire.updateOne({ _id: listing._id }, { $set }, { runValidators: true });
  return loadDetail(String(listing._id));
};

/* ------------------------------------------------------------------ */
/* Status / delete / review                                            */
/* ------------------------------------------------------------------ */

const setStatus = async (id: string, user: JwtPayload, isActive: unknown) => {
  const listing = await findListingOr404(SkiHire, id, LABEL);
  assertListingOwner(listing, user);
  return setListingActive(SkiHire, listing, isActive);
};

const remove = async (id: string, user: JwtPayload) => {
  const listing = await findListingOr404(SkiHire, id, LABEL);
  assertListingOwner(listing, user);
  return softDeleteListing(SkiHire, listing);
};

const review = (id: string, user: JwtPayload, body: any) =>
  addListingReview(SkiHire, id, user, { rating: body?.rating, comment: body?.comment });

export const SkiHireService = {
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
