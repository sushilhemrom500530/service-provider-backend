/**
 * READ-ONLY report of listings that look like test data, so an admin can
 * review and delete them. This script never changes anything.
 *
 * Flags:
 *  - a price above --max-price (default 5000)
 *  - item / listing names without letters or shorter than 2 characters ("4")
 *  - Ski Hire listings that look like vehicles ("car", "van", "SUV"...)
 *  - listings whose owner is not a provider of that type
 *
 * Usage:
 *   npm run report:suspicious-listings
 *   npm run report:suspicious-listings -- --max-price=2000
 */
import mongoose from 'mongoose';
import { config } from '../config';
import { User } from '../modules/user/user.model';
import { SkiPass } from '../modules/skiPass/skipass.model';
import { SkiHire } from '../modules/skiHire/skihire.model';
import { Transport } from '../modules/transport/transport.model';
import { Restaurant } from '../modules/restaurant/restaurant.model';
import { Massage } from '../modules/massage/massage.model';

const maxArg = process.argv.find(a => a.startsWith('--max-price='));
const MAX_PRICE = maxArg ? Number(maxArg.replace('--max-price=', '')) : 5000;

const VEHICLE_WORDS =
  /\b(car|cars|van|suv|sedan|vehicle|truck|minibus|bus|taxi|voiture|auto)\b/i;

const badName = (name: unknown) => {
  const s = String(name ?? '').trim();
  return s.length < 2 || !/\p{L}/u.test(s);
};

const SOURCES = [
  { label: 'Ski Pass', type: 'Ski_Pass', model: SkiPass, price: 'amount', items: null, itemName: '' },
  { label: 'Ski Hire', type: 'Ski_Hire', model: SkiHire, price: null, items: 'items', itemName: 'productName' },
  { label: 'Transport', type: 'Transport', model: Transport, price: 'amount', items: null, itemName: '' },
  { label: 'Restaurant', type: 'Restaurant', model: Restaurant, price: null, items: 'items', itemName: 'seat' },
  { label: 'Massage', type: 'Massage', model: Massage, price: 'amount', items: null, itemName: '' },
] as const;

const run = async () => {
  await mongoose.connect(config.database.mongoUrl as string);
  console.log(`Connected. Read-only report, max price ${MAX_PRICE}\n`);

  let flagged = 0;

  for (const src of SOURCES) {
    const listings: any[] = await (src.model as any).find().lean();

    for (const l of listings) {
      const reasons: string[] = [];

      if (badName(l.title)) reasons.push(`title "${l.title}"`);

      if (src.price && Number(l[src.price]) > MAX_PRICE)
        reasons.push(`price ${l[src.price]}`);

      if (src.items) {
        for (const it of l[src.items] || []) {
          if (Number(it.price) > MAX_PRICE)
            reasons.push(`item "${it[src.itemName]}" price ${it.price}`);
          if (badName(it[src.itemName]))
            reasons.push(`item name "${it[src.itemName]}"`);
        }
      }

      if (src.type === 'Ski_Hire') {
        const names = [l.title, ...(l.items || []).map((i: any) => i.productName)];
        const vehicle = names.find(n => VEHICLE_WORDS.test(String(n ?? '')));
        if (vehicle) reasons.push(`looks like a vehicle: "${vehicle}"`);
      }

      const owner: any = l.owner
        ? await User.findById(l.owner).select('providerType fullName').lean()
        : null;
      if (!owner) reasons.push('owner not found');
      else if (owner.providerType && owner.providerType !== src.type)
        reasons.push(`owner is a ${owner.providerType} provider`);

      if (!reasons.length) continue;
      flagged++;
      console.log(
        `[${src.label}] ${l._id} | "${l.title}" | owner ${owner?.fullName ?? l.owner}\n    -> ${reasons.join('; ')}`,
      );
    }
  }

  console.log(`\n${flagged} listing(s) flagged. Review them and delete test data from the admin panel.`);
};

run()
  .catch(error => {
    console.error('Report failed:', error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
