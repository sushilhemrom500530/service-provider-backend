/**
 * One-off data migration for the booking platform rebuild.
 * DRY RUN by default (only counts); writes only with --apply.
 *
 *  1. bookings: add startAt / endAt (schedule used by tabs, jobs, timers)
 *  2. bookings: old status value "Cancel" -> "Cancelled"
 *  3. listings (5 types): isActive / isDeleted defaults, reviewCount = number of reviews
 *
 * Usage:
 *   npm run migrate:booking-platform              -> dry run
 *   npm run migrate:booking-platform -- --apply   -> writes
 */
import mongoose from 'mongoose';
import { config } from '../config';
import { Booking } from '../modules/booking/booking.model';
import { computeSchedule } from '../modules/booking/booking.rules';
import { LISTING_MODELS } from '../modules/booking/booking.availability';

const APPLY = process.argv.includes('--apply');

const run = async () => {
  await mongoose.connect(config.database.mongoUrl as string);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no changes)'}\n`);

  // 1. schedule
  const missing: any[] = await Booking.find({ startAt: { $exists: false } }).lean();
  let scheduled = 0;
  let unreadable = 0;
  for (const b of missing) {
    const { startAt, endAt } = computeSchedule(b);
    if (!startAt || !endAt) {
      unreadable++;
      continue;
    }
    scheduled++;
    if (APPLY) await Booking.updateOne({ _id: b._id }, { $set: { startAt, endAt } });
  }
  console.log(`bookings without schedule: ${missing.length} (${scheduled} fixable, ${unreadable} without a readable date)`);

  // 2. legacy status
  const legacy = await Booking.countDocuments({ bookingStatus: 'Cancel' as any });
  console.log(`bookings with status "Cancel": ${legacy}`);
  if (APPLY && legacy)
    await Booking.collection.updateMany({ bookingStatus: 'Cancel' }, { $set: { bookingStatus: 'Cancelled' } });

  // 3. listings
  for (const [category, { model }] of Object.entries(LISTING_MODELS)) {
    const noFlags = await model.countDocuments({ $or: [{ isActive: { $exists: false } }, { isDeleted: { $exists: false } }] });
    const noCount = await model.countDocuments({ reviewCount: { $exists: false } });
    console.log(`${category}: ${noFlags} without isActive/isDeleted, ${noCount} without reviewCount`);
    if (!APPLY) continue;
    await model.collection.updateMany({ isActive: { $exists: false } }, { $set: { isActive: true } });
    await model.collection.updateMany({ isDeleted: { $exists: false } }, { $set: { isDeleted: false } });
    await model.collection.updateMany({ reviewCount: { $exists: false } }, [
      { $set: { reviewCount: { $size: { $ifNull: ['$reviews', []] } } } },
    ]);
  }

  console.log(APPLY ? '\nDone.' : '\nNothing changed. Run with --apply to write.');
};

run()
  .catch(error => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
