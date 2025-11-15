 
import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcrypt';
import { config } from '../../config';
import { IService, IUser, UserStatus } from './user.interface';
import paginationPlugin from './../../common/plugins/pagination.plugin';

// Service schema
const serviceSchema = new Schema<IService>(
  {
    serviceType: { type: String, required: true },
    category: { type: [String], required: true },
  },
  { _id: false }
);

// User schema
const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    confirmPassword: { type: String, required: true, select: false },
    providerType: { type: String,  trim: true},
    phoneNumber: { type: String },
    profileUrl: { type: String },
    service: { type: serviceSchema },
    address: { type: String },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.Inactive,
      required: true,
    },
    role: {
      type: String,
      enum: ['User', 'Provider', 'Admin'],
      default: 'Provider',
    },
    isDeleted: { type: Boolean, default: false },
    isAgreedTermsConditions: { type: Boolean, default: false },
  },
  {
    timestamps: true,  
  }
);

// add pagination plugin
userSchema.plugin(paginationPlugin);

// Hash password before save
// userSchema.pre<IUser>('save', async function (next) {
//   if (!this.isModified('password')) return next();
 
//   if (this.password !== this.confirmPassword) {
//     return next(new Error('Password and confirm password do not match'));
//   }

//   try {
//     const salt = await bcrypt.genSalt(config.bcrypt.saltRounds);
//     this.password = await bcrypt.hash(this.password, salt);
 
//     this.confirmPassword = undefined as unknown as string;

//     next();
//   } catch (error) {
//     next(error as Error);
//   }
// });


userSchema.methods.comparePassword = async function (
  password: string
): Promise<boolean> {
  return bcrypt.compare(password, this.password);
};

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', userSchema);
