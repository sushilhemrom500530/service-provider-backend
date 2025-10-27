 
export interface ISubCategory {
  name: string;
  categoryPhoto: string;
}

export type PrimaryCategoryType =
  | 'Ski_Pass'
  | 'Ski_Hire'
  | 'Transport'
  | 'Restaurant'
  | 'Massage';

export interface ICategory {
  primaryCategoryName: PrimaryCategoryType;
  thumbnail?: string;
  subCategory: ISubCategory[];
  createdAt?: Date;
  updatedAt?: Date;
}
