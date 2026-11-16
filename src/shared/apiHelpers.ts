import { StatusCodes } from 'http-status-codes';
import { JwtPayload } from 'jsonwebtoken';
import AppError from '../errors/AppErro';
import { IMeta } from './sendResponse';

/* ------------------------------------------------------------------ */
/* Query helpers                                                       */
/* ------------------------------------------------------------------ */

export const MAX_PAGE_SIZE = 50;

/** page/limit from the query string: page >= 1, 1 <= limit <= 50 */
export const getPagination = (query: Record<string, any> = {}, defaultLimit = 10) => {
  const page = Math.max(1, parseInt(String(query.page ?? 1), 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(String(query.limit ?? defaultLimit), 10) || defaultLimit),
  );
  return { page, limit, skip: (page - 1) * limit };
};

export const buildMeta = (page: number, limit: number, total: number): IMeta => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit) || 0,
});

/** Escape user input before using it in a $regex (no ReDoS / 500s) */
export const escapeRegex = (value: unknown) =>
  String(value ?? '')
    .trim()
    .slice(0, 100)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive "contains" regex, or undefined for an empty search */
export const searchRegex = (value: unknown) => {
  const s = escapeRegex(value);
  return s ? { $regex: s, $options: 'i' } : undefined;
};

/** Mongo sort from "price", "-price", "rating", "newest"… (whitelisted) */
export const parseSort = (
  sort: unknown,
  allowed: Record<string, Record<string, 1 | -1>>,
  fallback: Record<string, 1 | -1> = { createdAt: -1 },
) => {
  const key = String(sort ?? '').trim();
  return allowed[key] || fallback;
};

export const toNumberOrUndefined = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/** Only keep the listed keys that are defined (whitelist for $set) */
export const pickDefined = <T extends Record<string, any>>(obj: T, keys: string[]) => {
  const out: Record<string, any> = {};
  for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k];
  return out;
};

/* ------------------------------------------------------------------ */
/* Access helpers                                                      */
/* ------------------------------------------------------------------ */

export const idOf = (value: any): string =>
  value?._id ? String(value._id) : value ? String(value) : '';

export const isAdmin = (user?: JwtPayload) => user?.role === 'Admin';

/** Listing may be changed only by its owner (or an Admin) */
export const assertListingOwner = (listing: any, user: JwtPayload) => {
  if (isAdmin(user)) return;
  if (idOf(listing?.owner) !== String(user?.userId))
    throw new AppError(StatusCodes.FORBIDDEN, 'You can only manage your own listings.');
};

/* ------------------------------------------------------------------ */
/* Serializers                                                         */
/* ------------------------------------------------------------------ */

/** Public profile of a user: never email/phone/status/role internals */
export const toPublicUser = (u: any) =>
  u && typeof u === 'object' && u._id
    ? { id: String(u._id), name: u.fullName || '', photo: u.profileUrl || '' }
    : null;

/** Contact card: only shown to the other side of a booking */
export const toContactUser = (u: any) =>
  u && typeof u === 'object' && u._id
    ? {
        id: String(u._id),
        name: u.fullName || '',
        photo: u.profileUrl || '',
        email: u.email || '',
        phone: u.phoneNumber || '',
      }
    : null;

export const toCategory = (c: any) =>
  c && typeof c === 'object' && c._id
    ? { id: String(c._id), name: c.name ?? c.title ?? '' }
    : c
      ? { id: String(c), name: '' }
      : null;

export const toRating = (doc: any) => ({
  average: Math.round((Number(doc?.averageRating) || 0) * 10) / 10,
  count: Array.isArray(doc?.reviews) ? doc.reviews.length : Number(doc?.reviewCount) || 0,
});

export const toReview = (r: any) => ({
  id: r?._id ? String(r._id) : undefined,
  rating: r?.rating,
  comment: r?.comment,
  user: toPublicUser(r?.userId),
  createdAt: r?.createdAt,
});
