import mongoose, { Schema, Document, Model } from 'mongoose';
import { ISupport } from './customer.support.interface';
 
const supportSchema: Schema = new Schema <ISupport>(
  {
    email: { type: String, required: true },
    phone: { type: String, required: true },
    description: { type: String, required: true },
  },
  { timestamps: true }
);

export const Support: Model<ISupport> =
  mongoose.models.Support || mongoose.model<ISupport>('Support', supportSchema);
