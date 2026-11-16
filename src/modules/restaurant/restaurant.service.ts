import { Types } from 'mongoose';
import moment from 'moment-timezone';
import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../../errors/AppErro';
import { s3Services } from './../../aws/s3Service';
import { User } from './../user/user.model';
import { Booking } from './../booking/booking.model';
import { Restaurant } from './restaurant.model';
import { RestaurantSetting, RESTAURANT_SETTING_KEY } from './restaurantSetting.model';
import { USER_UPLOADS_FOLDER } from './restaurant.constant';
import { assertValidSlots, assertSlotsWithinOpeningHours } from './../../utils/slotTime';
import {
  assertListingOwner,
  idOf,
  isAdmin,
  parseSort,
  pickDefined,
  toPublicUser,
  toRating,
} from './../../shared/apiHelpers';
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
} from './../common/listing.helpers';
import { NormalizedSeat, SlotInput, TIME_FORMATS, normalizeSeats } from './restaurant.validations';

const PRIMARY = 'Restaurant' as const;
const LIST_SELECT = '-reviews -refunds -__v -availableSlots -slots';
const DETAIL_SELECT = '-reviews -refunds -__v -availableSlots';

const SORTS: Record<string, Record<string, 1 | -1>> = {
  price_asc: { 'items.price': 1, createdAt: -1 },
  price_desc: { 'items.price': -1, createdAt: -1 },
  rating: { averageRating: -1, createdAt: -1 },
  newest: { createdAt: -1 },
};

type UploadedFiles = Record<string, any[]> | undefined;

/* ------------------------------------------------------------------ */
/* Opening hours                                                       */
/* ------------------------------------------------------------------ */

/** Time zone of the restaurants' opening hours (env override) */
export const RESTAURANT_TIMEZONE =
  process.env.RESTAURANT_TIMEZONE || process.env.BUSINESS_TIMEZONE || 'Europe/Paris';

const toMinutes = (time: unknown): number | null => {
  const m = moment(String(time ?? '').trim(), TIME_FORMATS, true);
  return m.isValid() ? m.hours() * 60 + m.minutes() : null;
};

/** Open right now? (hours may cross midnight; open == close means 24 h) */
export const isOpenAt = (
  openTime: unknown,
  closeTime: unknown,
  now: Date = new Date(),
  tz: string = RESTAURANT_TIMEZONE,
) => {
  const o = toMinutes(openTime);
  const c = toMinutes(closeTime);
  if (o === null || c === null) return false;
  if (o === c) return true;
  const local = moment.tz(now, tz);
  const n = local.hours() * 60 + local.minutes();
  return o < c ? n >= o && n < c : n >= o || n < c;
};

/* ------------------------------------------------------------------ */
/* Serializers                                                         */
/* ------------------------------------------------------------------ */

const seatPrices = (doc: any) =>
  (doc?.items || [])
    .map((i: any) => Number(i?.price))
    .filter((n: number) => Number.isFinite(n));

export const toCard = (doc: any, subs: Map<string, SubCategory>) => {
  const prices = seatPrices(doc);
  return {
    id: idOf(doc),
    category: PRIMARY,
    subCategory: subs.get(String(doc?.category)) || null,
    title: doc?.title || '',
    thumbnail: doc?.thumbnail || '',
    serviceArea: doc?.serviceArea || '',
    price: { amount: prices.length ? Math.min(...prices) : 0, unit: 'per_seat' },
    rating: toRating(doc),
    provider: toPublicUser(doc?.owner),
    isActive: doc?.isActive !== false,
  };
};

export const toSeat = (i: any) => ({
  id: idOf(i),
  type: i?.seat,
  photo: i?.photo || '',
  price: Number(i?.price) || 0,
  quantity: Number(i?.totalQty) || 0,
  description: i?.description || '',
});

export const toDetail = (doc: any, subs: Map<string, SubCategory>) => ({
  ...toCard(doc, subs),
  description: doc?.description || '',
  openTime: doc?.openTime || '',
  closeTime: doc?.closeTime || '',
  isOpenNow: isOpenAt(doc?.openTime, doc?.closeTime),
  foodType: doc?.foodType || '',
  serviceFee: Number(doc?.serviceFee) || 0,
  seats: (doc?.items || []).map(toSeat),
  slots: (doc?.slots || []).map((s: any) => ({
    id: idOf(s),
    startTime: s?.startTime,
    endTime: s?.endTime,
  })),
  createdAt: doc?.createdAt,
});

const loadDetail = async (id: string) => {
  const doc: any = await Restaurant.findOne({ _id: id, isDeleted: { $ne: true } })
    .select(DETAIL_SELECT)
    .populate({ path: 'owner', select: 'fullName profileUrl' })
    .lean();
  if (!doc) throw new AppError(StatusCodes.NOT_FOUND, 'Restaurant not found.');
  return toDetail(doc, await loadSubCategories(PRIMARY));
};

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

const thumbnailFile = (files: UploadedFiles) => files?.thumbnail?.[0] || files?.file?.[0];

/**
 * Seat photo per seat index (index in the `seats`/`items` array of the request):
 *   files[0], files[1] | files (in order) | seatPhoto_<i> | itemPhoto_<i>
 */
const seatPhotoFiles = (files: UploadedFiles) => {
  const map = new Map<number, any>();
  const plain: any[] = [];
  for (const f of files?.files || []) {
    const m = /^files\[(\d+)\]$/.exec(String(f?.fieldname || ''));
    if (m) map.set(Number(m[1]), f);
    else plain.push(f);
  }
  let pos = 0;
  for (const f of plain) {
    while (map.has(pos)) pos += 1;
    map.set(pos, f);
    pos += 1;
  }
  for (const [name, list] of Object.entries(files || {})) {
    const m = /^(?:seatPhoto|itemPhoto)_(\d+)$/.exec(name);
    if (m && list?.[0]) map.set(Number(m[1]), list[0]);
  }
  return map;
};

const upload = (file: any) => s3Services.uploadSingleFileToS3(file, USER_UPLOADS_FOLDER);

/* ------------------------------------------------------------------ */
/* Service fee (one platform-wide setting)                             */
/* ------------------------------------------------------------------ */

/**
 * Current restaurant service fee: the setting document, else the highest
 * fee among existing restaurants (before the setting existed), else 0.
 */
export async function getRestaurantServiceFee(): Promise<number> {
  const setting: any = await RestaurantSetting.findOne({ key: RESTAURANT_SETTING_KEY }).lean();
  const fromSetting = Number(setting?.serviceFee);
  if (setting && Number.isFinite(fromSetting)) return fromSetting;
  const top: any = await Restaurant.findOne({ serviceFee: { $gt: 0 } })
    .sort({ serviceFee: -1 })
    .select('serviceFee')
    .lean();
  const fromListings = Number(top?.serviceFee);
  return Number.isFinite(fromListings) ? fromListings : 0;
}

const updateServiceFee = async (serviceFee: number) => {
  await RestaurantSetting.findOneAndUpdate(
    { key: RESTAURANT_SETTING_KEY },
    { $set: { serviceFee } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  // the booking module reads restaurant.serviceFee: keep every listing in sync
  const result = await Restaurant.updateMany({}, { $set: { serviceFee } });
  return { serviceFee, updatedRestaurants: result.modifiedCount };
};

const getServiceFee = async () => ({ serviceFee: await getRestaurantServiceFee() });

/* ------------------------------------------------------------------ */
/* Browse / mine / detail / reviews                                    */
/* ------------------------------------------------------------------ */

/** Price range on the SAME seat (`items.price` alone would mix seats) */
const priceOnOneSeat = (filter: Record<string, any>) => {
  const range = filter['items.price'];
  if (range) {
    delete filter['items.price'];
    filter.items = { $elemMatch: { price: range } };
  }
  return filter;
};

const browse = async (query: Record<string, any>) => {
  // `status` is a provider filter: never let it widen the public list
  const { status: _ignored, ...q } = query || {};
  const filter = priceOnOneSeat(
    await buildListingFilter(PRIMARY, q, { priceField: 'items.price', publicOnly: true }),
  );
  const subs = await loadSubCategories(PRIMARY);
  return paginateListings(
    Restaurant,
    filter,
    q,
    parseSort(q.sort, SORTS),
    d => toCard(d, subs),
    LIST_SELECT,
  );
};

const mine = async (user: JwtPayload, query: Record<string, any>) => {
  let owner: string | undefined = String(user.userId);
  if (isAdmin(user))
    owner = Types.ObjectId.isValid(String(query?.owner || '')) ? String(query.owner) : undefined;
  const filter = priceOnOneSeat(
    await buildListingFilter(PRIMARY, query, { priceField: 'items.price', owner }),
  );
  const subs = await loadSubCategories(PRIMARY);
  return paginateListings(
    Restaurant,
    filter,
    query,
    parseSort(query?.sort, SORTS),
    d => toCard(d, subs),
    LIST_SELECT,
  );
};

const detail = async (id: string) => {
  if (!Types.ObjectId.isValid(String(id)))
    throw new AppError(StatusCodes.BAD_REQUEST, 'Invalid restaurant id.');
  return loadDetail(id);
};

const reviews = (id: string, query: Record<string, any>) =>
  getListingReviews(Restaurant, id, query);

const review = (id: string, user: JwtPayload, body: any) =>
  addListingReview(Restaurant, id, user, body);

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

const assertRestaurantProvider = async (user: JwtPayload) => {
  const u: any = await User.findById(user?.userId).select('providerType role').lean();
  if (!u || u.role !== 'Provider' || u.providerType !== PRIMARY)
    throw new AppError(
      StatusCodes.FORBIDDEN,
      'Only Restaurant providers can create a restaurant.',
    );
  return u;
};

const create = async (user: JwtPayload, body: any, files: UploadedFiles) => {
  const provider = await assertRestaurantProvider(user);
  await assertSubCategory(PRIMARY, body.category);

  const seats = normalizeSeats(body) || [];
  const slots: SlotInput[] = body.slots || [];
  assertValidSlots(slots as any);
  assertSlotsWithinOpeningHours(slots as any, body.openTime, body.closeTime);

  // check every photo exists before uploading anything
  const thumb = thumbnailFile(files);
  if (!thumb && !body.thumbnail)
    throw new AppError(StatusCodes.BAD_REQUEST, 'Thumbnail is required (file field "thumbnail").');
  const photoFiles = seatPhotoFiles(files);
  seats.forEach((s, i) => {
    if (!photoFiles.get(i) && !s.photo)
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        `Photo is required for the ${s.type} seat (file field "files[${i}]" or a "photo" URL).`,
      );
  });

  const thumbnail = thumb ? await upload(thumb) : body.thumbnail;
  const items = await Promise.all(
    seats.map(async (s, i) => {
      const file = photoFiles.get(i);
      return {
        seat: s.type,
        photo: file ? await upload(file) : s.photo,
        price: s.price,
        totalQty: s.quantity,
        availableQty: s.quantity,
        description: s.description ?? '',
      };
    }),
  );

  const doc = await Restaurant.create({
    title: body.title,
    description: body.description ?? '',
    thumbnail,
    category: body.category,
    owner: provider._id,
    openTime: body.openTime,
    closeTime: body.closeTime,
    serviceArea: body.serviceArea,
    foodType: body.foodType ?? '',
    serviceFee: await getRestaurantServiceFee(),
    // legacy field, set once; the API answers with the computed isOpenNow
    status: isOpenAt(body.openTime, body.closeTime) ? 'Open' : 'Closed',
    items,
    slots: slots.map(s => ({ startTime: s.startTime, endTime: s.endTime })),
    isActive: true,
    isDeleted: false,
  });
  return loadDetail(String(doc._id));
};

/* ------------------------------------------------------------------ */
/* Update                                                              */
/* ------------------------------------------------------------------ */

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const assertNoOpenBookings = async (listingId: unknown, extra: Record<string, any>, what: string) => {
  const open = await Booking.exists({
    product: listingId,
    bookingStatus: { $in: OPEN_BOOKING_STATUSES },
    ...extra,
  });
  if (open)
    throw new AppError(
      StatusCodes.CONFLICT,
      `This ${what} has upcoming or active bookings and cannot be removed.`,
    );
};

/** Merge the seats of the request into the stored `items` (keeps _id and booked stock) */
const mergeSeats = async (
  listing: any,
  incoming: NormalizedSeat[] | undefined,
  removeIds: string[],
  files: UploadedFiles,
) => {
  const existing: any[] = (listing.items || []).map((i: any) =>
    typeof i?.toObject === 'function' ? i.toObject() : { ...i },
  );
  const byId = new Map(existing.map(i => [String(i._id), i]));

  for (const id of removeIds)
    if (!byId.has(id)) throw new AppError(StatusCodes.BAD_REQUEST, `Unknown seat id: ${id}`);
  if (removeIds.length)
    await assertNoOpenBookings(listing._id, { 'bookingItems.itemId': { $in: removeIds } }, 'seat');

  const removed = new Set(removeIds);
  const kept = existing.filter(i => !removed.has(String(i._id)));
  const added: any[] = [];
  const photoFiles = seatPhotoFiles(files);
  const pendingUploads: { target: any; file: any }[] = [];

  (incoming || []).forEach((s, index) => {
    let target: any;
    if (s.id) {
      if (removed.has(s.id))
        throw new AppError(StatusCodes.BAD_REQUEST, `Seat ${s.id} is both updated and removed.`);
      target = kept.find(i => String(i._id) === s.id);
      if (!target) throw new AppError(StatusCodes.BAD_REQUEST, `Unknown seat id: ${s.id}`);
    } else if (s.type) {
      target = kept.find(i => i.seat === s.type);
    }
    const file = photoFiles.get(index);

    if (target) {
      const oldTotal = Number(target.totalQty) || 0;
      const oldAvailable = Number.isFinite(Number(target.availableQty))
        ? Number(target.availableQty)
        : oldTotal;
      const newTotal = s.quantity ?? oldTotal;
      if (s.type) target.seat = s.type;
      if (s.price !== undefined) target.price = s.price;
      if (s.description !== undefined) target.description = s.description;
      if (s.photo) target.photo = s.photo;
      target.totalQty = newTotal;
      // keep booked seats booked
      target.availableQty = clamp(oldAvailable + (newTotal - oldTotal), 0, newTotal);
    } else {
      if (!s.type || s.price === undefined || s.quantity === undefined)
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          'A new seat needs type (VIP or Normal), price and quantity.',
        );
      target = {
        _id: new Types.ObjectId(),
        seat: s.type,
        price: s.price,
        totalQty: s.quantity,
        availableQty: s.quantity,
        description: s.description ?? '',
        photo: s.photo,
      };
      added.push(target);
    }
    if (file) pendingUploads.push({ target, file });
  });

  const final = [...kept, ...added];
  if (final.length < 1)
    throw new AppError(StatusCodes.BAD_REQUEST, 'A restaurant needs at least one seat type.');
  const types = final.map(i => i.seat);
  if (new Set(types).size !== types.length || final.length > 2)
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      'A restaurant has at most one VIP and one Normal seat type.',
    );
  const uploading = new Set(pendingUploads.map(p => p.target));
  for (const i of final)
    if (!i.photo && !uploading.has(i))
      throw new AppError(StatusCodes.BAD_REQUEST, `Photo is required for the ${i.seat} seat.`);

  return {
    final,
    upload: async () => {
      await Promise.all(
        pendingUploads.map(async p => {
          p.target.photo = await upload(p.file);
        }),
      );
      return final.map(i => ({
        _id: i._id,
        seat: i.seat,
        photo: i.photo,
        price: Number(i.price),
        totalQty: Number(i.totalQty),
        availableQty: Number(i.availableQty),
        description: i.description ?? '',
      }));
    },
  };
};

/** Merge slots (patch: update by id, add new, remove only via removeSlotIds) */
const mergeSlots = async (
  listing: any,
  incoming: SlotInput[] | undefined,
  removeIds: string[],
  openTime: string,
  closeTime: string,
  hoursChanged: boolean,
) => {
  const plain = (s: any) => ({ _id: s._id, startTime: s.startTime, endTime: s.endTime });
  const existing: any[] = (listing.slots || []).map(plain);
  const available: any[] = (listing.availableSlots || []).map(plain);
  const ids = new Set(existing.map(s => String(s._id)));

  for (const id of removeIds)
    if (!ids.has(id)) throw new AppError(StatusCodes.BAD_REQUEST, `Unknown slot id: ${id}`);
  if (removeIds.length)
    await assertNoOpenBookings(listing._id, { slots: { $in: removeIds } }, 'slot');

  const removed = new Set(removeIds);
  const slots = existing.filter(s => !removed.has(String(s._id)));
  let availableSlots = available.filter(s => !removed.has(String(s._id)));
  const changed: any[] = [];

  for (const s of incoming || []) {
    const id = s.id ?? s._id;
    if (id) {
      if (removed.has(id))
        throw new AppError(StatusCodes.BAD_REQUEST, `Slot ${id} is both updated and removed.`);
      const target = slots.find(x => String(x._id) === id);
      if (!target) throw new AppError(StatusCodes.BAD_REQUEST, `Unknown slot id: ${id}`);
      if (s.startTime) target.startTime = s.startTime;
      if (s.endTime) target.endTime = s.endTime;
      changed.push(target);
      // keep the bookable copy in sync (same as before)
      availableSlots = availableSlots.map(a =>
        String(a._id) === id ? { ...a, startTime: target.startTime, endTime: target.endTime } : a,
      );
    } else {
      if (!s.startTime || !s.endTime)
        throw new AppError(StatusCodes.BAD_REQUEST, 'A new slot needs startTime and endTime.');
      const slot = { _id: new Types.ObjectId(), startTime: s.startTime, endTime: s.endTime };
      slots.push(slot);
      availableSlots.push({ ...slot });
      changed.push(slot);
    }
  }

  if (!slots.length)
    throw new AppError(StatusCodes.BAD_REQUEST, 'A restaurant needs at least one slot.');

  assertValidSlots(changed);
  assertSlotsWithinOpeningHours(hoursChanged ? slots : changed, openTime, closeTime);
  return { slots, availableSlots };
};

const update = async (id: string, user: JwtPayload, body: any, files: UploadedFiles) => {
  const listing: any = await findListingOr404(Restaurant, id, 'Restaurant');
  assertListingOwner(listing, user);

  const $set: Record<string, any> = pickDefined(body, [
    'title',
    'description',
    'serviceArea',
    'foodType',
    'openTime',
    'closeTime',
  ]);

  if (body.category !== undefined) {
    await assertSubCategory(PRIMARY, body.category);
    $set.category = new Types.ObjectId(String(body.category));
  }

  const openTime = body.openTime ?? listing.openTime;
  const closeTime = body.closeTime ?? listing.closeTime;
  const hoursChanged = body.openTime !== undefined || body.closeTime !== undefined;

  // seats (validated before any upload)
  const seats = normalizeSeats(body);
  const removeSeatIds: string[] = [...(body.removeSeatIds || []), ...(body.removeItemIds || [])];
  const seatMerge =
    seats || removeSeatIds.length
      ? await mergeSeats(listing, seats, removeSeatIds, files)
      : undefined;

  // slots
  const removeSlotIds: string[] = body.removeSlotIds || [];
  if (body.slots !== undefined || removeSlotIds.length || hoursChanged) {
    const merged = await mergeSlots(
      listing,
      body.slots,
      removeSlotIds,
      openTime,
      closeTime,
      hoursChanged,
    );
    if (body.slots !== undefined || removeSlotIds.length) {
      $set.slots = merged.slots;
      $set.availableSlots = merged.availableSlots;
    }
  }

  // uploads last: nothing is uploaded for a request that fails validation
  const thumb = thumbnailFile(files);
  if (thumb) $set.thumbnail = await upload(thumb);
  else if (body.thumbnail) $set.thumbnail = body.thumbnail;
  if (seatMerge) $set.items = await seatMerge.upload();

  if (!Object.keys($set).length) return loadDetail(id);

  // stock / slot lists are rewritten: refuse if a booking changed them meanwhile
  const filter: Record<string, any> = { _id: listing._id, isDeleted: { $ne: true } };
  if (($set.items || $set.availableSlots) && listing.updatedAt)
    filter.updatedAt = listing.updatedAt;

  const updated = await Restaurant.findOneAndUpdate(
    filter,
    { $set },
    { new: true, runValidators: true },
  )
    .select('_id')
    .lean();
  if (!updated)
    throw new AppError(
      StatusCodes.CONFLICT,
      'This restaurant was changed at the same time (for example by a booking). Please try again.',
    );
  return loadDetail(id);
};

/* ------------------------------------------------------------------ */
/* Status / delete                                                     */
/* ------------------------------------------------------------------ */

const setStatus = async (id: string, user: JwtPayload, isActive: unknown) => {
  const listing = await findListingOr404(Restaurant, id, 'Restaurant');
  assertListingOwner(listing, user);
  return setListingActive(Restaurant, listing, isActive);
};

const remove = async (id: string, user: JwtPayload) => {
  const listing = await findListingOr404(Restaurant, id, 'Restaurant');
  assertListingOwner(listing, user);
  return softDeleteListing(Restaurant, listing);
};

export const RestaurantService = {
  browse,
  mine,
  detail,
  reviews,
  review,
  create,
  update,
  setStatus,
  remove,
  updateServiceFee,
  getServiceFee,
  getRestaurantServiceFee,
};
