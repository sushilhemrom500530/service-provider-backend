 
export interface ISubCategory {
  _id?: string;
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
   _id?: string;     
  primaryCategoryName: PrimaryCategoryType;
  thumbnail?: string;
  subCategory: ISubCategory[];
  createdAt?: Date;
  updatedAt?: Date;
}
