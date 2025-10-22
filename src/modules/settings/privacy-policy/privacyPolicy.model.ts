import mongoose, { Schema, Document, Model } from 'mongoose';
import { settingsSchema } from './../common/settings.model.schema';
import { ISettings } from './../common/settings.interface';
 

export const PrivacyPolicy: Model<ISettings> =
  mongoose.models.PrivacyPolicy || mongoose.model<ISettings>('PrivacyPolicy', settingsSchema);
