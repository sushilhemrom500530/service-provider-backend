// import mongoose, { Schema, Document, Model } from 'mongoose';
// import bcrypt from 'bcrypt';
// import { config } from '../../config';
// import { IService,IUser ,UserStatus} from './user.interface';

// // Service schema
// const serviceSchema = new Schema<IService>(
//   {
//     serviceType: { type: String, required: true },
//     category: { type: [String], required: true },
//   },
//   { _id: false }
// );

// // User schema
// const userSchema = new Schema<IUser>(
//   {
//     fullName: { type: String, required: true, trim: true },
//     email: { type: String, required: true, unique: true, lowercase: true },
//     password: { type: String, required: true, select: false },
//     phoneNumber: { type: String, required: true },
//     profileUrl: { type: String },
//     service: { type: serviceSchema, required: false },
//     address: { type: String, required: true  },
//      status: { 
//       type: String, 
//       enum: Object.values(UserStatus),  
//       default: UserStatus.Inactive,     
//       required: true 
//     },
//     role: {
//       type: String,
//       enum: ['User', 'Provider', 'Admin'],
//       default: 'Provider',
//     },
//     isDeleted: { type: Boolean, default: false },
//   },
//   {
//     timestamps: true,
//     toJSON: { virtuals: true },
//   }
// );

// // Pre-save hook to hash password
// userSchema.pre<IUser>('save', async function (next) {
//   if (!this.isModified('password')) return next();

//   try {
//     const salt = await bcrypt.genSalt(config.bcrypt.saltRounds);
//     this.password = await bcrypt.hash(this.password, salt);
//     next();
//   } catch (error) {
//     next(error as Error);
//   }
// });

// // 6️ Compare password method
// userSchema.methods.comparePassword = async function (
//   password: string
// ): Promise<boolean> {
//   return bcrypt.compare(password, this.password);
// };

// // Model export
// export const User: Model<IUser> =
//   mongoose.models.User || mongoose.model<IUser>('User', userSchema);



import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcrypt';
import { config } from '../../config';
import { IService, IUser, UserStatus } from './user.interface';

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
    phoneNumber: { type: String },
    profileUrl: { type: String },
    service: { type: serviceSchema },
    address: { type: String },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.Active,
      required: true,
    },
    role: {
      type: String,
      enum: ['User', 'Provider', 'Admin'],
      default: 'Provider',
    },
    isDeleted: { type: Boolean, default: false },
    agreeTermsCondition: { type: Boolean, default: false },
  },
  {
    timestamps: true,  
  }
);

// Hash password before save
userSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();
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

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', userSchema);
