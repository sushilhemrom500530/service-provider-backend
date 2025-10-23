import mongoose, { Schema, Document, Model } from 'mongoose';
import { ISettings } from './../common/settings.interface';
import { settingsSchema } from './../common/settings.model.schema';

export const TermsAndService: Model<ISettings> =
  mongoose.models.TermsAndService || mongoose.model<ISettings>('TermsAndService', settingsSchema);
