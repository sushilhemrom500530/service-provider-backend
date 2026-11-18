/**
 * Replaces the images of the current listings and categories with real,
 * professional photos (requested 18 Nov 2026). Only image fields change:
 *
 *   categories   thumbnail, subCategory[].categoryPhoto
 *   skipasses    thumbnail
 *   skihires     thumbnail, items[].productPhoto
 *   transports   thumbnail
 *   restaurants  thumbnail, items[].photo
 *   massages     thumbnail
 *
 * Users, bookings, prices and every other field are untouched. Deleted
 * listings are skipped. Old S3 files are NOT deleted, and every old URL is
 * written to backups/listing-images-<time>.json first, so it can be undone.
 *
 * Sources: Pexels photos (Pexels licence: free for commercial use, no
 * attribution needed, editing allowed) and the brand logos of the vehicle
 * subcategories from Wikimedia Commons. Every image is converted to WebP like
 * the app's own uploads and stored in the same S3 folders.
 *
 * Usage:
 *   npm run images:update             -> dry run, prints the plan
 *   npm run images:update -- --apply  -> uploads and writes
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import { s3Client } from '../aws/awsConfig';

const APPLY = process.argv.includes('--apply');

/* ------------------------------------------------------------------ */
/* Image sources                                                       */
/* ------------------------------------------------------------------ */

type Source = {
  key: string; // stable name, one upload per source
  url: string;
  crop?: [number, number, number, number]; // left, top, width, height in px of the 1200 px wide image
  rotate?: number;
  logo?: boolean; // keep transparency, white background, square
};

const px = (id: number, extra: Partial<Source> = {}): Source => ({
  key: `pexels-${id}${extra.crop ? `-${extra.crop.join('_')}` : ''}`,
  url: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${extra.crop ? 1200 : 1600}`,
  ...extra,
});
const logo = (file: string): Source => ({
  key: `logo-${file}`,
  url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=800`,
  logo: true,
});

// the ski equipment flat lay (1200 x 900): product crops of single items
const FLATLAY = 257961;
const IMG = {
  // categories
  catSkiPass: px(287228),
  catSkiHire: px(FLATLAY),
  catTransport: px(36377051),
  catRestaurant: px(38431749),
  catMassage: px(35884499),
  // subcategories
  skiEssential: px(3647134),
  snowboard: px(29779875),
  kidsGear: px(8627419),
  bmw: logo('BMW.svg'),
  audi: logo('Audi-Logo_2016.svg'),
  hino: logo('Hino_Motors_logo.svg'),
  fineDining: px(36694451),
  fastFood: px(3219547),
  chicken: px(6163330),
  swedish: px(208504),
  deepTissue: px(9146364),
  sports: px(275768),
  // ski passes
  valleysDay: px(21792611),
  meribel: px(19727171),
  sixDay: px(358046),
  // ski hire listings
  skiPack1: px(FLATLAY),
  skiPack2: px(7071086),
  skiPack3: px(13356970),
  board1: px(926687),
  board2: px(240160),
  board3: px(6815362),
  family1: px(9283159),
  family2: px(8627419),
  // ski hire items
  performanceSkis: px(FLATLAY, { crop: [480, 30, 250, 815], rotate: -90 }),
  adultSkis: px(FLATLAY, { crop: [100, 55, 185, 795], rotate: -90 }),
  skiBoots: px(FLATLAY, { crop: [250, 620, 280, 215] }),
  kidsBoots: px(FLATLAY, { crop: [700, 620, 222, 215] }),
  helmet: px(20419666),
  snowboardItem: px(29779875),
  snowboardBoots: px(848681),
  kidsSkis: px(8627419),
  // transport
  airport: px(17455633),
  chauffeur: px(8425035),
  shuttle: px(20512070),
  // restaurants
  chalet: px(30457533),
  chaletVip: px(17086327),
  chaletNormal: px(11794317),
  grill: px(3997609),
  grillVip: px(18756798),
  grillNormal: px(29219959),
  fondue: px(12664810),
  fondueVip: px(5531668),
  fondueNormal: px(15945660),
  // massages
  swedishListing: px(10894305),
  deepListing: px(4085450),
  sportsListing: px(5473182),
} satisfies Record<string, Source>;

/* ------------------------------------------------------------------ */
/* What goes where                                                     */
/* ------------------------------------------------------------------ */

const CATEGORY: Record<string, Source> = {
  Ski_Pass: IMG.catSkiPass,
  Ski_Hire: IMG.catSkiHire,
  Transport: IMG.catTransport,
  Restaurant: IMG.catRestaurant,
  Massage: IMG.catMassage,
};
const SUBCATEGORY: Record<string, Source> = {
  'Ski Essential': IMG.skiEssential,
  Snowboard: IMG.snowboard,
  'Kids Gear': IMG.kidsGear,
  BMW: IMG.bmw,
  Audi: IMG.audi,
  Hino: IMG.hino,
  'Fine Dining': IMG.fineDining,
  'Fast Food': IMG.fastFood,
  Chicken: IMG.chicken,
  Swedish: IMG.swedish,
  'Deep Tissue': IMG.deepTissue,
  Sports: IMG.sports,
};
const SKI_PASS: Record<string, Source> = {
  '3 Valleys Day Pass': IMG.valleysDay,
  'Méribel Valley Pass': IMG.meribel,
  '6-Day 3 Valleys Pass': IMG.sixDay,
};
// several listings share a title: they get different photos in turn
const SKI_HIRE: Record<string, Source[]> = {
  'Premium Ski Pack': [IMG.skiPack1, IMG.skiPack2, IMG.skiPack3],
  'Snowboard Rental': [IMG.board1, IMG.board2, IMG.board3],
  'Family Ski Kit': [IMG.family1, IMG.family2],
};
const SKI_HIRE_ITEM: Record<string, Source> = {
  'Performance skis': IMG.performanceSkis,
  'Ski boots': IMG.skiBoots,
  Helmet: IMG.helmet,
  'All-mountain snowboard': IMG.snowboardItem,
  'Snowboard boots': IMG.snowboardBoots,
  'Kids skis': IMG.kidsSkis,
  'Kids boots': IMG.kidsBoots,
  'Adult skis': IMG.adultSkis,
};
const TRANSPORT: Record<string, Source> = {
  'Airport Transfer – Geneva': IMG.airport,
  'Private Chauffeur – Day': IMG.chauffeur,
  'Resort Shuttle Van': IMG.shuttle,
};
const RESTAURANT: Record<string, { cover: Source; seats: Record<string, Source> }> = {
  'Le Chalet Gourmand': { cover: IMG.chalet, seats: { VIP: IMG.chaletVip, Normal: IMG.chaletNormal } },
  'Alpine Grill House': { cover: IMG.grill, seats: { VIP: IMG.grillVip, Normal: IMG.grillNormal } },
  'La Fondue Savoyarde': { cover: IMG.fondue, seats: { VIP: IMG.fondueVip, Normal: IMG.fondueNormal } },
};
const MASSAGE: Record<string, Source> = {
  'Swedish Relaxation Massage': IMG.swedishListing,
  'Deep Tissue Recovery': IMG.deepListing,
  'Après-Ski Sports Massage': IMG.sportsListing,
};

/* ------------------------------------------------------------------ */
/* Download, convert, upload (once per source)                         */
/* ------------------------------------------------------------------ */

const uploaded = new Map<string, string>();

const download = async (url: string) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'harry-servicer-image-update/1.0' } });
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
};

const toWebp = async (src: Source, input: Buffer) => {
  if (src.logo) {
    // centred on a white square, like a brand tile
    const inner = await sharp(input).resize(640, 640, { fit: 'inside' }).png().toBuffer();
    return sharp({ create: { width: 800, height: 800, channels: 3, background: '#ffffff' } })
      .composite([{ input: inner, gravity: 'center' }])
      .webp({ quality: 90 })
      .toBuffer();
  }
  let img = sharp(input);
  if (src.crop) {
    const [left, top, width, height] = src.crop;
    img = sharp(await img.extract({ left, top, width, height }).toBuffer());
  }
  if (src.rotate) img = sharp(await img.rotate(src.rotate).toBuffer());
  return img.resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
};

const upload = async (src: Source, folder: string) => {
  const cacheKey = `${folder}|${src.key}`;
  if (uploaded.has(cacheKey)) return uploaded.get(cacheKey)!;
  const body = await toWebp(src, await download(src.url));
  const key = `uploads/${folder}/${crypto.randomUUID()}.webp`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.aws.bucketName,
      Key: key,
      Body: body,
      ContentType: 'image/webp',
      Metadata: { source: src.url.slice(0, 200), uploadedAt: new Date().toISOString() },
    }),
  );
  const url = `https://${config.aws.bucketName}.s3.${config.aws.region}.amazonaws.com/${key}`;
  uploaded.set(cacheKey, url);
  console.log(`  uploaded ${src.key} -> ${key} (${Math.round(body.length / 1024)} KB)`);
  return url;
};

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

type Change = {
  collection: string;
  id: mongoose.Types.ObjectId;
  label: string;
  field: string; // e.g. "thumbnail" or "items.$[i].productPhoto"
  arrayFilter?: Record<string, unknown>;
  old: string;
  source: Source;
  folder: string;
};

const live = { isDeleted: { $ne: true } };

const plan = async (db: mongoose.mongo.Db) => {
  const changes: Change[] = [];
  const missing: string[] = [];
  const add = (c: Omit<Change, 'source'> & { source?: Source }) => {
    if (!c.source) missing.push(`${c.collection}: ${c.label}`);
    else changes.push(c as Change);
  };

  for (const c of await db.collection('categories').find({}).toArray()) {
    add({ collection: 'categories', id: c._id, label: `${c.primaryCategoryName}`, field: 'thumbnail', old: c.thumbnail, source: CATEGORY[c.primaryCategoryName], folder: 'category' });
    for (const s of c.subCategory || [])
      add({
        collection: 'categories', id: c._id, label: `${c.primaryCategoryName} / ${s.name}`,
        field: 'subCategory.$[s].categoryPhoto', arrayFilter: { 's._id': s._id },
        old: s.categoryPhoto, source: SUBCATEGORY[s.name], folder: 'category',
      });
  }
  for (const d of await db.collection('skipasses').find(live).sort({ _id: 1 }).toArray())
    add({ collection: 'skipasses', id: d._id, label: d.title, field: 'thumbnail', old: d.thumbnail, source: SKI_PASS[d.title], folder: 'ski-pass' });

  const turn: Record<string, number> = {};
  for (const d of await db.collection('skihires').find(live).sort({ _id: 1 }).toArray()) {
    const options = SKI_HIRE[d.title] || [];
    const n = (turn[d.title] = (turn[d.title] ?? -1) + 1);
    add({ collection: 'skihires', id: d._id, label: `${d.title} #${n + 1}`, field: 'thumbnail', old: d.thumbnail, source: options[n % Math.max(options.length, 1)], folder: 'ski-hire' });
    for (const it of d.items || [])
      add({
        collection: 'skihires', id: d._id, label: `${d.title} #${n + 1} / ${it.productName}`,
        field: 'items.$[i].productPhoto', arrayFilter: { 'i._id': it._id },
        old: it.productPhoto, source: SKI_HIRE_ITEM[it.productName], folder: 'ski-hire',
      });
  }
  for (const d of await db.collection('transports').find(live).toArray())
    add({ collection: 'transports', id: d._id, label: d.title, field: 'thumbnail', old: d.thumbnail, source: TRANSPORT[d.title], folder: 'transports' });

  for (const d of await db.collection('restaurants').find(live).toArray()) {
    const r = RESTAURANT[d.title];
    add({ collection: 'restaurants', id: d._id, label: d.title, field: 'thumbnail', old: d.thumbnail, source: r?.cover, folder: 'restaurants' });
    for (const it of d.items || [])
      add({
        collection: 'restaurants', id: d._id, label: `${d.title} / ${it.seat}`,
        field: 'items.$[i].photo', arrayFilter: { 'i._id': it._id },
        old: it.photo, source: r?.seats[it.seat], folder: 'restaurants',
      });
  }
  for (const d of await db.collection('massages').find(live).toArray())
    add({ collection: 'massages', id: d._id, label: d.title, field: 'thumbnail', old: d.thumbnail, source: MASSAGE[d.title], folder: 'massages' });

  return { changes, missing };
};

/* ------------------------------------------------------------------ */

const run = async () => {
  await mongoose.connect(config.database.mongoUrl as string);
  const db = mongoose.connection.db!;
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (uploading and writing)' : 'DRY RUN'}\n`);

  const { changes, missing } = await plan(db);
  for (const c of changes) console.log(`${c.collection.padEnd(12)} ${c.label.padEnd(48)} <- ${c.source.key}`);
  console.log(`\n${changes.length} images to replace, ${new Set(changes.map(c => `${c.folder}|${c.source.key}`)).size} uploads.`);
  if (missing.length) {
    console.log(`\nNo image chosen for (left unchanged):\n  ${missing.join('\n  ')}`);
  }
  if (!APPLY) {
    console.log('\nDry run only. Run with --apply to upload and write.');
    return mongoose.disconnect();
  }

  // backup of every old value before anything is written
  const dir = path.resolve(process.cwd(), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `listing-images-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(changes.map(c => ({ collection: c.collection, id: String(c.id), field: c.field, arrayFilter: c.arrayFilter, label: c.label, old: c.old })), null, 2),
  );
  console.log(`\nBackup of the old image URLs: ${file}\n`);

  let written = 0;
  for (const c of changes) {
    const url = await upload(c.source, c.folder);
    const res = await db.collection(c.collection).updateOne(
      { _id: c.id },
      { $set: { [c.field]: url } },
      c.arrayFilter ? { arrayFilters: [c.arrayFilter] } : {},
    );
    written += res.modifiedCount;
  }
  console.log(`\nDone: ${written} image fields updated, ${uploaded.size} files uploaded.`);
  await mongoose.disconnect();
};

run().catch(async e => {
  console.error('Failed:', e);
  await mongoose.disconnect();
  process.exit(1);
});
