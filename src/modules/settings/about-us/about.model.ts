import mongoose, { Schema, Document, Model } from 'mongoose';
import { ISettings } from './../common/settings.interface';
import { settingsSchema } from './../common/settings.model.schema';

export const About: Model<ISettings> =
  mongoose.models.About || mongoose.model<IAbout>('About', settingsSchema);
