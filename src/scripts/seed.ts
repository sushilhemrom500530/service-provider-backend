/**
 * Demo data seed:  npm run seed
 *
 * Clears all app data EXCEPT user data, then creates linked demo data for
 * the users already in the database:
 *   categories -> listings (per provider and service type)
 *   -> bookings in every state, made through the real booking flow with
 *      Stripe TEST payments (payments, refunds, payouts, wallets and
 *      notifications are exactly what the app produces)
 *   -> reviews on completed bookings -> chats between customer and provider.
 *
 * Kept: users, auth tokens, OTPs, the content pages (about, privacy, terms,
 * support) and each wallet's bank accounts + platform fee setting (wallet
 * balances and transactions are reset, then rebuilt by the demo bookings).
 *
 * Safety
 *  - Every collection is backed up first to backups/seed-<time>/ (EJSON).
 *    Restore:  npm run seed -- --restore backups/seed-<time>
 *  - Refuses to run with a live Stripe key (sk_live_): demo payments must
 *    never charge real cards.
 *  - Shows the target database and waits 5 s (Ctrl+C to stop); --yes skips it.
 *  - If a service type has no active provider, or there are fewer than 3
 *    active customers, demo accounts are created (password: SEED_DEMO_PASSWORD
 *    or "12345678") and printed at the end.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose, { Types } from 'mongoose';
import moment from 'moment-timezone';
import { JwtPayload } from 'jsonwebtoken';
import { config } from '../config';
import stripe from '../utils/stripe';
import { User } from '../modules/user/user.model';
import { Wallet } from '../modules/wallet/wallet.model';
import { Category } from '../modules/category/category.model';
import { SkiPass } from '../modules/skiPass/skipass.model';
import { SkiHire } from '../modules/skiHire/skihire.model';
import { Transport } from '../modules/transport/transport.model';
import { Restaurant } from '../modules/restaurant/restaurant.model';
import { Massage } from '../modules/massage/massage.model';
import { Booking } from '../modules/booking/booking.model';
import { Payment } from '../modules/payment/payment.model';
import { Notification } from '../modules/notification/notification.model';
import { Chat, Message } from '../modules/chat/chat.model';
import { createBookingIntent, createBookingFromPayment } from '../modules/booking/booking.create';
import {
  approveBooking,
  cancelByCustomer,
  completeBooking,
  handOverBooking,
  rejectBooking,
  returnRental,
} from '../modules/booking/booking.lifecycle';
import { addListingReview } from '../modules/common/listing.helpers';

const { EJSON } = mongoose.mongo.BSON;

type Cat = 'Ski_Pass' | 'Ski_Hire' | 'Transport' | 'Restaurant' | 'Massage';
const CATEGORIES: Cat[] = ['Ski_Pass', 'Ski_Hire', 'Transport', 'Restaurant', 'Massage'];
const MODELS: Record<Cat, any> = {
  Ski_Pass: SkiPass,
  Ski_Hire: SkiHire,
  Transport,
  Restaurant,
  Massage,
};

/** Collections that hold user data: never cleared */
const KEEP = new Set([
  'users',
  'tokens',
  'otps',
  // content pages written in the admin panel (not demo data)
  'abouts',
  'privacypolicies',
  'termsandservices',
  'supports',
]);
/** Wallets are reset (balance, transactions), not deleted */
const RESET = new Set(['wallets']);

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const TZ = config.booking?.timezone || 'Europe/Paris';
const DAY = 24 * 3600 * 1000;
const PLACEHOLDER = 'https://placehold.co/800x600/png?text=Peak+Privee';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || '12345678';

const log = (...a: any[]) => console.log(...a);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const pick = <T>(list: T[], i: number) => list[((i % list.length) + list.length) % list.length];
const dayKey = (offsetDays: number) => moment().tz(TZ).add(offsetDays, 'days').format('YYYY-MM-DD');
/** a local date-time `offsetDays` from today at hh:mm, as ISO with Z */
const localAt = (offsetDays: number, hh: number, mm = 0) =>
  moment.tz(dayKey(offsetDays), 'YYYY-MM-DD', TZ).hour(hh).minute(mm).toDate().toISOString();
const asUser = (u: any): JwtPayload => ({ userId: String(u._id), role: u.role, email: u.email }) as JwtPayload;

/* ------------------------------------------------------------------ */
/* Backup / restore                                                    */
/* ------------------------------------------------------------------ */

const collectionNames = async () =>
  (await mongoose.connection.db!.listCollections().toArray())
    .map(c => c.name)
    .filter(n => !n.startsWith('system.'))
    .sort();

const backupAll = async () => {
  const dir = path.resolve('backups', `seed-${moment().format('YYYYMMDD-HHmmss')}`);
  fs.mkdirSync(dir, { recursive: true });
  const db = mongoose.connection.db!;
  const dump: Record<string, any[]> = {};
  for (const name of await collectionNames()) {
    const docs = await db.collection(name).find({}).toArray();
    dump[name] = docs;
    fs.writeFileSync(path.join(dir, `${name}.json`), EJSON.stringify(docs, undefined, 0, { relaxed: false }));
  }
  log(`Backup: ${dir}`);
  return { dir, dump };
};

const restore = async (dir: string) => {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) throw new Error(`Backup folder not found: ${abs}`);
  const db = mongoose.connection.db!;
  for (const file of fs.readdirSync(abs).filter(f => f.endsWith('.json'))) {
    const name = file.replace(/\.json$/, '');
    const docs = EJSON.parse(fs.readFileSync(path.join(abs, file), 'utf8'), { relaxed: false }) as any[];
    await db.collection(name).deleteMany({});
    if (docs.length) await db.collection(name).insertMany(docs, { ordered: false });
    log(`  ${name}: ${docs.length}`);
  }
  log('Restore finished.');
};

/* ------------------------------------------------------------------ */
/* Clear                                                               */
/* ------------------------------------------------------------------ */

const clearAppData = async () => {
  const db = mongoose.connection.db!;
  for (const name of await collectionNames()) {
    if (KEEP.has(name)) continue;
    if (RESET.has(name)) {
      const r = await db.collection(name).updateMany({}, { $set: { balance: 0, transactions: [] } });
      log(`  ${name}: ${r.modifiedCount} reset (bank accounts and fee setting kept)`);
      continue;
    }
    const r = await db.collection(name).deleteMany({});
    log(`  ${name}: ${r.deletedCount} deleted`);
  }
};

/* ------------------------------------------------------------------ */
/* Users (existing ones; demo accounts only when something is missing) */
/* ------------------------------------------------------------------ */

const createdAccounts: string[] = [];

const ensureUser = async (data: Record<string, any>, password = DEMO_PASSWORD) => {
  const existing = await User.findOne({ email: data.email });
  if (existing) return existing;
  const user = await User.create({ ...data, password, status: 'Active', isAgreedTermsConditions: true });
  createdAccounts.push(`${data.role.padEnd(8)} ${data.email}${password === DEMO_PASSWORD ? '' : ' (password: ADMIN_PASSWORD)'}`);
  return user;
};

const loadUsers = async () => {
  const active = { status: 'Active', isDeleted: { $ne: true } };
  let admin: any = await User.findOne({ role: 'Admin', ...active }).sort({ createdAt: 1 });
  if (!admin) {
    const email = process.env.ADMIN_EMAIL || 'admin@peakprivee.demo';
    admin = await ensureUser({ email, fullName: 'Platform Admin', role: 'Admin' }, process.env.ADMIN_PASSWORD || DEMO_PASSWORD);
  }

  const providers: Record<Cat, any[]> = {} as any;
  for (const cat of CATEGORIES) {
    providers[cat] = await User.find({ role: 'Provider', providerType: cat, ...active }).sort({ createdAt: 1 });
    if (!providers[cat].length)
      providers[cat] = [
        await ensureUser({
          email: `demo.${cat.toLowerCase().replace('_', '')}@peakprivee.demo`,
          fullName: `Demo ${cat.replace('_', ' ')} Provider`,
          role: 'Provider',
          providerType: cat,
          phoneNumber: '+33612345678',
          address: 'Méribel, France',
        }),
      ];
  }

  let customers: any[] = await User.find({ role: 'User', ...active }).sort({ createdAt: 1 });
  for (let i = customers.length; i < 3; i++)
    customers.push(
      await ensureUser({
        email: `demo.customer${i + 1}@peakprivee.demo`,
        fullName: `Demo Customer ${i + 1}`,
        role: 'User',
        phoneNumber: `+3361234567${i}`,
      }),
    );
  customers = customers.filter(Boolean);

  // every account that earns money needs a wallet; the platform fee lives on the admin's
  const feePercent = Number(process.env.ADMIN_PAYMENT_PROFIT) || 0;
  const adminWallet = await Wallet.findOne({ user: admin._id });
  if (!adminWallet) await Wallet.create({ user: admin._id, balance: 0, profitCharge: feePercent });
  for (const p of Object.values(providers).flat())
    await Wallet.updateOne({ user: p._id }, { $setOnInsert: { balance: 0, transactions: [] } }, { upsert: true });

  return { admin, providers, customers };
};

/* ------------------------------------------------------------------ */
/* Images: reuse the photos already uploaded to S3 (from the backup)   */
/* ------------------------------------------------------------------ */

const LISTING_COLLECTION: Record<Cat, string> = {
  Ski_Pass: 'skipasses',
  Ski_Hire: 'skihires',
  Transport: 'transports',
  Restaurant: 'restaurants',
  Massage: 'massages',
};

const imagePools = (dump: Record<string, any[]>) => {
  const isUrl = (s: any) => typeof s === 'string' && /^https?:\/\//.test(s);
  const pools = {} as Record<Cat, string[]>;
  for (const cat of CATEGORIES) {
    const set = new Set<string>();
    for (const l of dump[LISTING_COLLECTION[cat]] || []) {
      if (isUrl(l.thumbnail)) set.add(l.thumbnail);
      for (const it of l.items || []) for (const k of ['productPhoto', 'photo']) if (isUrl(it[k])) set.add(it[k]);
    }
    const category = (dump.categories || []).find((c: any) => c.primaryCategoryName === cat);
    if (isUrl(category?.thumbnail)) set.add(category.thumbnail);
    for (const s of category?.subCategory || []) if (isUrl(s.categoryPhoto)) set.add(s.categoryPhoto);
    pools[cat] = set.size ? [...set] : [PLACEHOLDER];
  }
  return pools;
};

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

const SUB_CATEGORIES: Record<Cat, string[]> = {
  Ski_Pass: [],
  Ski_Hire: ['Ski Essential', 'Snowboard', 'Kids Gear'],
  Transport: ['BMW', 'Audi', 'Hino'],
  Restaurant: ['Fine Dining', 'Fast Food', 'Chicken'],
  Massage: ['Swedish', 'Deep Tissue', 'Sports'],
};

const seedCategories = async (dump: Record<string, any[]>, images: Record<Cat, string[]>) => {
  const old = dump.categories || [];
  const subIds = {} as Record<Cat, Types.ObjectId[]>;
  for (const cat of CATEGORIES) {
    const before = old.find((c: any) => c.primaryCategoryName === cat);
    const photoOf = (name: string, i: number) =>
      before?.subCategory?.find((s: any) => s.name?.toLowerCase() === name.toLowerCase())?.categoryPhoto ||
      pick(images[cat], i);
    const subCategory = SUB_CATEGORIES[cat].map((name, i) => ({
      _id: new Types.ObjectId(),
      name,
      categoryPhoto: photoOf(name, i),
    }));
    await Category.create({
      _id: before?._id ?? new Types.ObjectId(), // same id as before: cached ids keep working
      primaryCategoryName: cat,
      thumbnail: before?.thumbnail || images[cat][0],
      subCategory,
    });
    subIds[cat] = subCategory.map(s => s._id);
  }
  return subIds;
};

/* ------------------------------------------------------------------ */
/* Listings                                                            */
/* ------------------------------------------------------------------ */

const AREAS = ['Méribel', 'Courchevel', 'Val Thorens', 'Les Menuires'];

const listingTemplates = {
  Ski_Pass: [
    { title: '3 Valleys Day Pass', skiPassType: 'Premium', amount: 79, services: ['All 3 Valleys lifts', 'Free piste map'] },
    { title: 'Méribel Valley Pass', skiPassType: 'Basic', amount: 62, services: ['Méribel lifts', 'Beginner areas'] },
    { title: '6-Day 3 Valleys Pass', skiPassType: 'Premium', amount: 385, services: ['All lifts for 6 days', 'Insurance option'] },
  ],
  Ski_Hire: [
    { title: 'Premium Ski Pack', priceUnit: 'per_day', items: [['Performance skis', 45, 6], ['Ski boots', 18, 10], ['Helmet', 8, 12]] },
    { title: 'Snowboard Rental', priceUnit: 'per_day', items: [['All-mountain snowboard', 38, 5], ['Snowboard boots', 15, 8]] },
    { title: 'Family Ski Kit', priceUnit: 'per_day', items: [['Kids skis', 20, 8], ['Kids boots', 10, 8], ['Adult skis', 35, 6]] },
  ],
  Transport: [
    { title: 'Airport Transfer – Geneva', amount: 420, personCount: 7, power: '190 hp', milage: '12 km/l' },
    { title: 'Private Chauffeur – Day', amount: 650, personCount: 4, power: '250 hp', milage: '10 km/l' },
    { title: 'Resort Shuttle Van', amount: 180, personCount: 8, power: '160 hp', milage: '11 km/l' },
  ],
  Restaurant: [
    { title: 'Le Chalet Gourmand', foodType: 'French', serviceFee: 5 },
    { title: 'Alpine Grill House', foodType: 'Grill', serviceFee: 4 },
    { title: 'La Fondue Savoyarde', foodType: 'Savoyard', serviceFee: 3 },
  ],
  Massage: [
    { title: 'Swedish Relaxation Massage', durations: [[60, 95], [90, 135]] },
    { title: 'Deep Tissue Recovery', durations: [[60, 110], [90, 150]] },
    { title: 'Après-Ski Sports Massage', durations: [[45, 80], [60, 100]] },
  ],
};

const makeListing = async (cat: Cat, owner: any, i: number, img: string[], subIds: Types.ObjectId[]) => {
  const base = {
    owner: owner._id,
    thumbnail: pick(img, i),
    serviceArea: pick(AREAS, i),
    isActive: true,
    isDeleted: false,
  };
  const sub = subIds.length ? pick(subIds, i) : undefined;
  switch (cat) {
    case 'Ski_Pass': {
      const t = pick(listingTemplates.Ski_Pass, i);
      return SkiPass.create({
        ...base,
        title: t.title,
        description: `${t.title}: skip the ticket queue, the pass is ready in the app.`,
        skiPassType: t.skiPassType as any,
        amount: t.amount,
        services: t.services.map(s => ({ title: s, description: `${s} included.` })),
      });
    }
    case 'Ski_Hire': {
      const t = pick(listingTemplates.Ski_Hire, i);
      return SkiHire.create({
        ...base,
        category: sub,
        title: t.title,
        description: 'Freshly serviced equipment, fitted by our team in the shop.',
        priceUnit: t.priceUnit as any,
        extraChargePerHour: 10,
        items: t.items.map(([name, price, qty], k) => ({
          productName: name,
          productPhoto: pick(img, i + k + 1),
          price,
          totalQty: qty,
          availableQty: qty,
        })),
      } as any);
    }
    case 'Transport': {
      const t = pick(listingTemplates.Transport, i);
      return Transport.create({
        ...base,
        category: sub,
        title: t.title,
        description: 'Professional driver, child seats on request, ski racks included.',
        amount: t.amount,
        personCount: t.personCount,
        power: t.power,
        milage: t.milage,
        extraChargePerHours: 45,
      } as any);
    }
    case 'Restaurant': {
      const t = pick(listingTemplates.Restaurant, i);
      return Restaurant.create({
        ...base,
        category: sub,
        title: t.title,
        description: 'Mountain cuisine with local produce and a view of the slopes.',
        foodType: t.foodType,
        serviceFee: t.serviceFee,
        openTime: '11:00 AM',
        closeTime: '11:00 PM',
        items: [
          { seat: 'VIP', photo: pick(img, i + 1), totalQty: 4, availableQty: 4, price: 60, description: 'Window table by the fireplace' },
          { seat: 'Normal', photo: pick(img, i + 2), totalQty: 20, availableQty: 20, price: 30, description: 'Main dining room' },
        ],
        slots: [
          { startTime: '12:00 PM', endTime: '2:00 PM' },
          { startTime: '7:00 PM', endTime: '9:00 PM' },
          { startTime: '9:00 PM', endTime: '11:00 PM' },
        ],
      } as any);
    }
    case 'Massage': {
      const t = pick(listingTemplates.Massage, i);
      return Massage.create({
        ...base,
        category: sub,
        title: t.title,
        description: 'In your chalet or at our spa, by a certified therapist.',
        openTime: '9:00 AM',
        closeTime: '9:00 PM',
        priceByDuration: t.durations.map(([min, amount]) => ({ duration: `${min} min`, amount })),
        amount: t.durations[0][1],
        benefits: 'Relieves muscle tension after skiing and improves sleep.',
        ourRecommendations: 'Drink plenty of water and avoid skiing hard right after.',
        capacity: 1 + (i % 2), // therapists: 1 or 2 guests at the same time
      } as any);
    }
  }
};

/** listings per provider so each service type has about 3 listings */
const seedListings = async (providers: Record<Cat, any[]>, images: Record<Cat, string[]>, subIds: Record<Cat, Types.ObjectId[]>) => {
  const listings: { cat: Cat; doc: any; owner: any }[] = [];
  for (const cat of CATEGORIES) {
    const owners = providers[cat];
    const perOwner = Math.min(3, Math.max(1, Math.ceil(3 / owners.length)));
    let i = 0;
    for (const owner of owners)
      for (let k = 0; k < perOwner; k++, i++)
        listings.push({ cat, doc: await makeListing(cat, owner, i, images[cat], subIds[cat]), owner });
  }
  return listings;
};

/* ------------------------------------------------------------------ */
/* Bookings: the real flow (intent -> Stripe test payment -> create)   */
/* ------------------------------------------------------------------ */

type Scenario = 'completed' | 'inProgress' | 'confirmed' | 'pending' | 'cancelled' | 'rejected';
const RENTAL = (cat: Cat) => cat === 'Ski_Hire' || cat === 'Transport';

/** Request body for a booking `day` days from today */
const bookingBody = (cat: Cat, listing: any, day: number, opts: { now?: boolean } = {}) => {
  const productId = String(listing._id);
  switch (cat) {
    case 'Ski_Pass':
      return { productId, date: dayKey(day), personCount: 2 };
    case 'Massage':
      return { productId, date: dayKey(day), time: pick(['10:00 AM', '2:30 PM', '5:00 PM'], day), duration: listing.priceByDuration[0].duration, personCount: 1 };
    case 'Restaurant':
      return {
        productId,
        date: dayKey(day),
        slotId: String(pick<any>(listing.slots, day)._id),
        bookingItems: [{ itemId: String(listing.items[day % 2]._id), quantity: 2 }],
      };
    case 'Ski_Hire': {
      const start = opts.now ? new Date(Date.now() + 2 * 60000).toISOString() : localAt(day, 9);
      const end = opts.now ? localAt(2, 17) : localAt(day + 2, 17);
      return { productId, startDateAndTime: start, endDateAndTime: end, bookingItems: [{ itemId: String(listing.items[0]._id), quantity: 1 }, { itemId: String(listing.items[1]._id), quantity: 1 }] };
    }
    case 'Transport': {
      const start = opts.now ? new Date(Date.now() + 2 * 60000).toISOString() : localAt(day, 10);
      const end = opts.now ? localAt(1, 18) : localAt(day, 18);
      return { productId, startDateAndTime: start, endDateAndTime: end, personCount: 3, destination: 'Geneva Airport (GVA)' };
    }
  }
};

/** Pay with Stripe's test card and create the booking as the app does */
const book = async (customer: any, body: any) => {
  const intent = await createBookingIntent(asUser(customer), body);
  await stripe.paymentIntents.confirm(intent.paymentIntentId, {
    payment_method: 'pm_card_visa',
    return_url: 'https://example.com/stripe-return',
  });
  const booking: any = await createBookingFromPayment(asUser(customer), { ...body, paymentIntentId: intent.paymentIntentId });
  return String(booking._id ?? booking.id);
};

const DATE_FIELDS = [
  'date', 'startDateAndTime', 'endDateAndTime', 'startAt', 'endAt', 'approvalDeadline', 'approvedAt',
  'handedOverAt', 'returnedAt', 'completedAt', 'cancelledAt', 'refundedAt', 'createdAt',
];

/** Move a booking (and its payment + notifications) `days` into the past */
const shiftBack = async (bookingId: string, days: number) => {
  const ms = days * DAY;
  const b: any = await Booking.findById(bookingId).lean();
  const set: Record<string, Date> = {};
  for (const f of DATE_FIELDS) if (b?.[f]) set[f] = new Date(new Date(b[f]).getTime() - ms);
  await Booking.collection.updateOne({ _id: b._id }, { $set: set });
  const back = (d: any) => new Date(new Date(d).getTime() - ms);
  for (const p of await Payment.find({ booking: b._id }).lean())
    await Payment.collection.updateOne({ _id: p._id }, { $set: { createdAt: back(p.createdAt) } });
  for (const n of await Notification.find({ booking: b._id }).lean())
    await Notification.collection.updateOne({ _id: (n as any)._id }, { $set: { createdAt: back((n as any).createdAt) } });
};

const REVIEWS = [
  [5, 'Perfect from start to finish, we will book again next season.'],
  [5, 'Excellent service and very friendly team.'],
  [4, 'Very good, everything was on time. Small wait at pick-up.'],
  [5, 'Exactly as described, great value for the resort.'],
  [4, 'Really nice experience, would recommend to friends.'],
] as const;

const runScenario = async (s: Scenario, cat: Cat, listing: any, owner: any, customer: any, n: number) => {
  const provider = asUser(owner);
  const approve = async (id: string) => {
    const b: any = await Booking.findById(id).lean();
    if (!b.isPermitted) await approveBooking(id, provider);
  };

  switch (s) {
    case 'completed': {
      const ago = 4 + (n % 20); // finished 4–23 days ago
      if (RENTAL(cat)) {
        const id = await book(customer, bookingBody(cat, listing, 3));
        await approve(id);
        await shiftBack(id, 3); // starts today, ends in the future
        await handOverBooking(id, provider);
        await returnRental(id, provider, new Date()); // returned on time
        await shiftBack(id, ago); // the whole rental moves into the past
        await addReview(cat, listing, customer, n);
        return id;
      }
      const id = await book(customer, bookingBody(cat, listing, 2));
      await approve(id);
      await shiftBack(id, 2 + ago);
      try {
        await completeBooking(id, provider);
      } catch (e) {
        // the server's automation job may have completed it a moment earlier
        const b: any = await Booking.findById(id).select('bookingStatus').lean();
        if (b?.bookingStatus !== 'Completed') throw e;
      }
      await addReview(cat, listing, customer, n);
      return id;
    }
    case 'inProgress': {
      const id = await book(customer, bookingBody(cat, listing, 0, { now: true }));
      await approve(id);
      await handOverBooking(id, provider);
      return id;
    }
    case 'confirmed': {
      const id = await book(customer, bookingBody(cat, listing, 6 + (n % 10)));
      await approve(id);
      return id;
    }
    case 'pending':
      return book(customer, bookingBody(cat, listing, 5 + (n % 10)));
    case 'cancelled': {
      const id = await book(customer, bookingBody(cat, listing, 17 + (n % 4)));
      await cancelByCustomer(id, asUser(customer), 'Change of travel plans');
      return id;
    }
    case 'rejected': {
      const id = await book(customer, bookingBody(cat, listing, 22 + (n % 4)));
      await rejectBooking(id, provider, 'Fully booked on that date, sorry!');
      return id;
    }
  }
};

const addReview = async (cat: Cat, listing: any, customer: any, n: number) => {
  const [rating, comment] = pick(REVIEWS as any, n) as [number, string];
  try {
    await addListingReview(MODELS[cat], String(listing._id), asUser(customer), { rating, comment });
  } catch {
    /* this customer already reviewed this listing */
  }
};

/** What each service type gets beyond one completed booking per listing */
const EXTRA: Record<Cat, Scenario[]> = {
  Ski_Pass: ['confirmed', 'confirmed', 'cancelled'],
  Massage: ['pending', 'confirmed', 'rejected'],
  Restaurant: ['pending', 'confirmed', 'cancelled'],
  Ski_Hire: ['pending', 'confirmed', 'inProgress', 'cancelled', 'rejected'],
  Transport: ['pending', 'confirmed', 'inProgress', 'cancelled'],
};

const seedBookings = async (listings: { cat: Cat; doc: any; owner: any }[], customers: any[]) => {
  const plan: { s: Scenario; l: (typeof listings)[number] }[] = [];
  for (const l of listings) plan.push({ s: 'completed', l });
  for (const cat of CATEGORIES) {
    const ofCat = listings.filter(l => l.cat === cat);
    EXTRA[cat].forEach((s, i) => plan.push({ s, l: pick(ofCat, i) }));
  }

  const results: { id: string; s: Scenario; cat: Cat; customer: any; owner: any }[] = [];
  const failed: string[] = [];
  let n = 0;
  for (const { s, l } of plan) {
    const customer = pick(customers, n);
    try {
      const id = await runScenario(s, l.cat, l.doc, l.owner, customer, n);
      results.push({ id, s, cat: l.cat, customer, owner: l.owner });
      process.stdout.write('.');
    } catch (e: any) {
      failed.push(`${l.cat} ${s} (${l.doc.title}): ${e?.message}`);
      process.stdout.write('x');
    }
    n++;
  }
  process.stdout.write('\n');
  return { results, failed };
};

/* ------------------------------------------------------------------ */
/* Chats between customer and provider (open bookings)                 */
/* ------------------------------------------------------------------ */

const CHAT_LINES = [
  ['customer', 'Hi! Looking forward to it. Is it possible to arrive 15 minutes early?'],
  ['provider', 'Hello, of course, no problem. See you then!'],
  ['customer', 'Great, thank you.'],
] as const;

const seedChats = async (results: { s: Scenario; customer: any; owner: any }[]) => {
  const seen = new Set<string>();
  let chats = 0;
  for (const r of results.filter(r => ['confirmed', 'inProgress', 'pending'].includes(r.s))) {
    const key = [String(r.customer._id), String(r.owner._id)].sort().join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    const chat: any = await Chat.create({ participants: [r.customer._id, r.owner._id], chatType: 'private' });
    let last: any = null;
    let t = Date.now() - 2 * 3600000;
    for (const [i, [from, content]] of CHAT_LINES.entries()) {
      const sender = from === 'customer' ? r.customer : r.owner;
      const receiver = from === 'customer' ? r.owner : r.customer;
      // the last message is still unread by the provider: readBy and the
      // chat's unreadCount below must agree (same badge on REST and socket)
      const unread = i === CHAT_LINES.length - 1;
      last = await Message.create({
        chatId: chat._id,
        sender: sender._id,
        receiver: receiver._id,
        content,
        messageType: 'text',
        status: unread ? 'delivered' : 'read',
        readBy: unread ? [sender._id] : [sender._id, receiver._id],
        deliveredTo: [receiver._id],
      } as any);
      await Message.collection.updateOne({ _id: last._id }, { $set: { createdAt: new Date(t), updatedAt: new Date(t) } });
      t += 20 * 60000;
    }
    await Chat.updateOne(
      { _id: chat._id },
      { $set: { lastMessage: last._id, lastMessageAt: new Date(t), unreadCount: { [String(r.owner._id)]: 1, [String(r.customer._id)]: 0 } } },
    );
    chats++;
  }
  return chats;
};

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

const main = async () => {
  const url = process.env.MONGODB_URL;
  if (!url) throw new Error('MONGODB_URL is not set.');
  await mongoose.connect(url);
  const host = (() => {
    try {
      return new URL(url.replace(/^mongodb(\+srv)?:/, 'http:')).host;
    } catch {
      return '(unknown host)';
    }
  })();
  log(`Database: ${mongoose.connection.db!.databaseName} @ ${host}`);

  const restoreAt = args.indexOf('--restore');
  if (restoreAt >= 0) {
    const dir = args[restoreAt + 1];
    if (!dir) throw new Error('Usage: npm run seed -- --restore backups/seed-<time>');
    if (!flag('--yes')) {
      log(`Restoring ${dir} REPLACES those collections in 5 s. Ctrl+C to stop.`);
      await sleep(5000);
    }
    await restore(dir);
    return;
  }

  if (String(config.stripe.secretKey || '').startsWith('sk_live'))
    throw new Error('Refusing to seed: the Stripe key is LIVE. Demo bookings need a test key (sk_test_…).');
  if (!String(config.stripe.secretKey || '').startsWith('sk_test'))
    throw new Error('Refusing to seed: STRIPE_SECRET_KEY (sk_test_…) is needed for the demo payments.');

  if (!flag('--yes')) {
    log('All data except users will be replaced with demo data in 5 s (a backup is taken first). Ctrl+C to stop.');
    await sleep(5000);
  }

  const { dir, dump } = await backupAll();
  log('Clearing app data:');
  await clearAppData();

  const { providers, customers } = await loadUsers();
  const images = imagePools(dump);
  const subIds = await seedCategories(dump, images);
  const listings = await seedListings(providers, images, subIds);
  log(`Categories: ${CATEGORIES.length} · listings: ${listings.length} · customers used: ${customers.length}`);

  log('Bookings (real flow, Stripe test payments):');
  const { results, failed } = await seedBookings(listings, customers);
  const chats = await seedChats(results);

  const count = (s: Scenario) => results.filter(r => r.s === s).length;
  log('\nDone.');
  log(`  bookings: ${results.length} (completed ${count('completed')}, in progress ${count('inProgress')}, confirmed ${count('confirmed')}, pending ${count('pending')}, cancelled ${count('cancelled')}, rejected ${count('rejected')})`);
  log(`  payments: ${await Payment.countDocuments()} · notifications: ${await Notification.countDocuments()} · chats: ${chats}`);
  log(`  backup: ${dir}`);
  if (createdAccounts.length) {
    log(`  demo accounts created (password "${DEMO_PASSWORD}"):`);
    createdAccounts.forEach(a => log(`    ${a}`));
  }
  if (failed.length) {
    log(`  ${failed.length} booking(s) could not be created:`);
    failed.forEach(f => log(`    - ${f}`));
    process.exitCode = 1;
  }
};

main()
  .catch(e => {
    console.error(`Seed failed: ${e?.message || e}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => null);
    process.exit();
  });
