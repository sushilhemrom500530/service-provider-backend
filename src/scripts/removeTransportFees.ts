/**
 * Transport has one all-inclusive trip price (decided 17 Nov 2026): the
 * insurance and maintenance fees no longer exist. They were saved on
 * listings but never charged. This removes the old values from stored
 * listings so they can't appear anywhere (admin panel, exports, old apps).
 *
 * Fields removed: insuranceFee, maintainCharge (API name maintenanceFee),
 * and maintenanceFee if a listing was written with that name.
 * Prices (`amount`) are not changed.
 *
 * Usage:
 *   npm run migrate:transport-fees              -> dry run, prints what would change
 *   npm run migrate:transport-fees -- --apply   -> writes the changes
 */
import mongoose from 'mongoose';
import { config } from '../config';
import { Transport } from '../modules/transport/transport.model';

const APPLY = process.argv.includes('--apply');
const FIELDS = ['insuranceFee', 'maintainCharge', 'maintenanceFee'] as const;
const HAS_ANY = { $or: FIELDS.map(f => ({ [f]: { $exists: true } })) };

const run = async () => {
  await mongoose.connect(config.database.mongoUrl as string);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN'}\n`);

  // raw collection: the fields are no longer in the schema
  const docs = await Transport.collection
    .find(HAS_ANY)
    .project({ _id: 1, title: 1, amount: 1, isDeleted: 1, ...Object.fromEntries(FIELDS.map(f => [f, 1])) })
    .toArray();

  for (const d of docs as any[]) {
    const old = FIELDS.filter(f => d[f] !== undefined).map(f => `${f}=${d[f]}`).join(', ');
    const nonZero = FIELDS.some(f => Number(d[f]) > 0);
    console.log(
      `${d._id} | "${d.title}" | price ${d.amount}${d.isDeleted ? ' | deleted' : ''} | ${old}${nonZero ? '  <- had a non-zero fee (never charged)' : ''}`,
    );
  }

  if (APPLY && docs.length) {
    const res = await Transport.collection.updateMany(HAS_ANY, {
      $unset: Object.fromEntries(FIELDS.map(f => [f, ''])),
    });
    console.log(`\n${res.modifiedCount} listing(s) cleaned.`);
  } else {
    console.log(
      `\n${docs.length} listing(s) ${APPLY ? 'to clean: none' : 'would be cleaned. Run with --apply to write'}.`,
    );
  }
  console.log(`Left with a fee field: ${await Transport.collection.countDocuments(HAS_ANY)}`);
};

run()
  .catch(error => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
