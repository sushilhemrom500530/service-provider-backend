
// Service subdocument (for providers)
export interface IService {
  serviceType: string;
  category: string[];
}

// user status 
export enum UserStatus {
  Active = 'Active',
  Inactive = 'Inactive',
  Unverified = 'Unverified',
  Delete = 'Delete',
  Blocked = 'Blocked',
  Banned = 'Banned',
}
//  user role 
export enum UserRoles {
  User = 'User',
  Provider = 'Provider',
  Admin = 'Admin', 
}


// User interface
export interface IUser extends Document {
  fullName: string;
  email: string;
  password: string;
  providerType?: string;
  phoneNumber: string;
  profileUrl?: string;
  service?: IService;  
  status: UserStatus;
  address: string;
  role: 'User' | 'Provider' | 'Admin';
  isDeleted: boolean;
  createdAt?: Date;
  updatedAt?: Date;

  comparePassword(password: string): Promise<boolean>;
}


export interface IUpdateData {
  fullName?: string;
  phoneNumber?: string;
  dateOfBirth?: Date;
  profileUrl?: string;
  service?: {
    serviceType?: string;
    category?: string[];
  };
  address?: string;
}