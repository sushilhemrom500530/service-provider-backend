
import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import { config } from '../../config';
import { IService, IUser, UserStatus, UserModel } from './user.interface';
import paginationPlugin from './../../common/plugins/pagination.plugin';
import { normalizePhoneNumber } from './../../utils/phoneNumber';

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
    fullName: {
      type: String,
      trim: true,
      default: ""
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true
    },
    password: {
      type: String,
      required: true,
      select: false
    },
    // confirmPassword: { type: String, required: true, select: false },
    providerType: {
      type: String,
      trim: true
    },
    phoneNumber: {
      type: String,
      // "N/A", "-", "null" -> '' ; "+33 6 12-34-56-78" -> "+33612345678"
      set: normalizePhoneNumber,
    },
    profileUrl: {
      type: String,
      default: "https://iter-bene.s3.eu-north-1.amazonaws.com/uploads/users/ea97d957-1bf9-4e4a-b84c-f00525e0cca3.webp"
    },
    service: { type: serviceSchema },
    address: { type: String, default: "" },
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
    isResetPassword: { type: Boolean, default: false },
    banExpiresAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// add pagination plugin
userSchema.plugin(paginationPlugin);

// Hash password before save
// userSchema.pre<IUser>('save', async function (next) {
//   // if (!this.isModified('password')) return next();

//   // if (this.password !== this.confirmPassword) {
//   //   return next(new Error('Password and confirm password do not match'));
//   // }

//   try {
//     const salt = await bcrypt.genSalt(config.bcrypt.saltRounds);
//     this.password = await bcrypt.hash(this.password, salt);

//     // this.confirmPassword = undefined as unknown as string;

//     next();
//   } catch (error) {
//     next(error as Error);
//   }
// });


userSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(config.bcrypt.saltRounds);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});



userSchema.methods.comparePassword = async function (
  password: string
): Promise<boolean> {
  return bcrypt.compare(password, this.password);
};

export const User =
  (mongoose.models.User as UserModel) ||
  mongoose.model<IUser, UserModel>('User', userSchema);
