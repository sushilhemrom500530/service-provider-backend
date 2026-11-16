import { Document, Types } from 'mongoose';
import { IReview, IRefund } from './../common/common.interface';

export type SkiHirePriceUnit = 'per_rental' | 'per_day' | 'per_hour';

/** Stored item (the booking module reads these field names: do not rename) */
export interface IProductItems {
  _id?: Types.ObjectId;
  productName: string;
  productPhoto?: string;
  price: number;
  totalQty: number;
  availableQty?: number;
}

export interface ISkiHire extends Document {
  category: Types.ObjectId;
  owner: Types.ObjectId;
  title: string;
  description?: string;
  thumbnail: string;
  extraChargePerHour?: number;
  priceUnit?: SkiHirePriceUnit;
  /** legacy: sum of item prices, kept for old readers, never sent */
  totalPrice?: number;
  serviceArea: string;
  items: IProductItems[];
  averageRating?: number;
  reviewCount?: number;
  reviews?: IReview[];
  refunds?: IRefund[];
  isActive?: boolean;
  isDeleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Item as accepted by the API (clean names or the old app names) */
export type SkiHireItemInput = {
  id?: string;
  _id?: string;
  name?: string;
  productName?: string;
  photo?: string;
  productPhoto?: string;
  price?: number;
  quantity?: number;
};
