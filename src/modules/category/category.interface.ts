 
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
  subCategory: ISubCategory[];
  createdAt?: Date;
  updatedAt?: Date;
}
