import mongoose, { Schema, Document, Model } from 'mongoose';
import { IAbout } from './about.model';

const aboutSchema = new Schema<IAbout>(
  {
    content: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (value: string) {
          // Returns true if value contains only plain text (no HTML tags)
          return /^[^<>]+$/.test(value.trim());
        },
        message: 'Content must be plain text without HTML tags.',

        // validator: function (value: string) {
        //   return /<[^>]+>.*<\/[^>]+>/s.test(value.trim());
        // },
        // message: "Content must contain valid HTML.",
      },
    },
    assignee: {
      type: String,
      default: 'Admin',
    },
  },
  { timestamps: true }
);

export const About: Model<IAbout> =
  mongoose.models.About || mongoose.model<IAbout>('About', aboutSchema);
