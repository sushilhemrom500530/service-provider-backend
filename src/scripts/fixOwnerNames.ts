/**
 * One-off fix for users whose name is stored as "N/A" (or empty) while the
 * real name sits in a field called " fullName" (with a leading space).
 * Those records were written outside this API, so the app shows "N/A".
 *
 * For each such user: fullName = trimmed " fullName", then " fullName" is removed.
 *
 * Usage:
 *   npm run fix:owner-names              -> dry run, prints what would change
 *   npm run fix:owner-names -- --apply   -> writes the changes
 */
import mongoose from 'mongoose';
import { config } from '../config';
import { User } from '../modules/user/user.model';

const APPLY = process.argv.includes('--apply');
const PLACEHOLDERS = ['', 'n/a', 'na', 'none', 'null', 'undefined', '-'];

const run = async () => {
  await mongoose.connect(config.database.mongoUrl as string);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN'}\n`);

  // raw collection: " fullName" is not in the schema
  const users = await User.collection
    .find({ ' fullName': { $exists: true } })
    .project({ _id: 1, role: 1, fullName: 1, ' fullName': 1 })
    .toArray();

  let changed = 0;
  for (const u of users as any[]) {
    const current = String(u.fullName ?? '').trim();
    const spaced = String(u[' fullName'] ?? '').trim();

    const currentIsPlaceholder = PLACEHOLDERS.includes(current.toLowerCase());
    if (!spaced || !currentIsPlaceholder) {
      console.log(`SKIP ${u._id} | fullName "${current}" | " fullName" "${spaced}" (kept, check by hand)`);
      continue;
    }

    changed++;
    console.log(`${u._id} | ${u.role} | "${current}" -> "${spaced}"`);
    if (APPLY)
      await User.collection.updateOne(
        { _id: u._id },
        { $set: { fullName: spaced }, $unset: { ' fullName': '' } },
      );
  }

  console.log(
    `\n${changed} name(s) ${APPLY ? 'fixed' : 'would change. Run with --apply to write'}.`,
  );
};

run()
  .catch(error => {
    console.error('Fix failed:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
