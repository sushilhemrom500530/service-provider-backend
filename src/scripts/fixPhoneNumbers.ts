/**
 * One-off clean-up of stored phone numbers.
 *
 *  - placeholders ("N/A", "-", "null", ...) -> '' (not set)
 *  - spaces / dashes / brackets removed, "00" prefix -> "+"
 *  - numbers without a country code get one, ONLY when --country is given
 *    (a leading national "0" is dropped first: 0612345678 -> +33612345678)
 *
 * Usage:
 *   npm run fix:phone-numbers                              -> dry run
 *   npm run fix:phone-numbers -- --country=+33             -> dry run, with country code
 *   npm run fix:phone-numbers -- --country=+33 --apply     -> write changes
 *
 * Numbers that still have no country code after the run are listed so they
 * can be fixed by hand (e.g. users from another country).
 */
import mongoose from 'mongoose';
import { config } from '../config';
import { User } from '../modules/user/user.model';
import { normalizePhoneNumber, hasCountryCode } from '../utils/phoneNumber';

const APPLY = process.argv.includes('--apply');
const countryArg = process.argv.find(a => a.startsWith('--country='));
const COUNTRY = countryArg ? countryArg.replace('--country=', '').trim() : '';

if (COUNTRY && !/^\+[1-9]\d{0,3}$/.test(COUNTRY)) {
  console.error('--country must look like +33 or +44');
  process.exit(1);
}

const run = async () => {
  await mongoose.connect(config.database.mongoUrl as string);
  console.log(
    `Connected. Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN'}${COUNTRY ? `, country ${COUNTRY}` : ''}\n`,
  );

  const users = await User.find({
    phoneNumber: { $exists: true, $ne: '' },
  })
    .select('_id fullName role phoneNumber')
    .lean();

  let changed = 0;
  const stillNoCode: string[] = [];

  for (const u of users as any[]) {
    const before: string = u.phoneNumber;
    let after = String(normalizePhoneNumber(before) ?? '');

    if (after && !hasCountryCode(after) && COUNTRY && /^\d+$/.test(after)) {
      after = `${COUNTRY}${after.replace(/^0+/, '')}`;
    }

    if (after && !hasCountryCode(after))
      stillNoCode.push(`${u._id} | ${u.role} | ${u.fullName} | ${after}`);

    if (after === before) continue;
    changed++;
    console.log(`${u._id} | ${u.role} | "${before}" -> "${after}"`);

    if (APPLY)
      await User.collection.updateOne(
        { _id: u._id },
        { $set: { phoneNumber: after } },
      );
  }

  console.log(
    `\n${changed} number(s) ${APPLY ? 'updated' : 'would change. Run with --apply to write'}.`,
  );
  if (stillNoCode.length) {
    console.log(`\n${stillNoCode.length} number(s) still without a valid country code:`);
    stillNoCode.forEach(line => console.log(`  ${line}`));
  }
};

run()
  .catch(error => {
    console.error('Fix failed:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
