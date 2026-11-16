/**
 * Test data builders. Every helper writes to the in-memory database only.
 */
import request from 'supertest';
import { Types } from 'mongoose';
import app from '../app';
import { User } from '../modules/user/user.model';
import { Wallet } from '../modules/wallet/wallet.model';
import { Category } from '../modules/category/category.model';
import { TokenService } from '../modules/token/token.services';

export const api = () => request(app);

export type TestUser = { id: string; token: string; doc: any; auth: [string, string] };

let seq = 0;

export const makeUser = async (
  role: 'User' | 'Provider' | 'Admin' = 'User',
  providerType?: string,
  extra: Record<string, any> = {},
): Promise<TestUser> => {
  seq += 1;
  const doc: any = await User.create({
    fullName: `${role} ${seq}`,
    email: `${role.toLowerCase()}${seq}@test.dev`,
    password: 'secret123',
    role,
    providerType,
    status: 'Active',
    phoneNumber: '+33 6 12 34 56 78',
    ...extra,
  });
  await Wallet.create({ user: doc._id, balance: 0, profitCharge: role === 'Admin' ? 20 : 0 });
  const tokens: any = await TokenService.accessAndRefreshToken(doc);
  const token = tokens?.accessToken ?? tokens?.access?.token ?? tokens?.tokens?.accessToken;
  return { id: String(doc._id), token, doc, auth: ['Authorization', `Bearer ${token}`] };
};

export const makeAdmin = () => makeUser('Admin');
export const makeCustomer = () => makeUser('User');
export const makeProvider = (type: string) => makeUser('Provider', type);

/** Creates a primary category with one sub-category; returns the sub-category id */
export const makeSubCategory = async (primary: string, name = `${primary} sub`) => {
  const doc: any = await Category.create({
    primaryCategoryName: primary,
    thumbnail: 'https://x/thumb.png',
    subCategory: [{ name, categoryPhoto: 'https://x/photo.png' }],
  });
  return String(doc.subCategory[0]._id);
};

export const oid = () => new Types.ObjectId().toString();

/** Date helpers (tests run in UTC) */
export const daysFromNow = (days: number, hour = 10, minute = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
};
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600 * 1000);

/** A tiny PNG buffer for multipart uploads */
export const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);
