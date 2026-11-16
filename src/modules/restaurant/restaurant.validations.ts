import { z } from 'zod';
import moment from 'moment-timezone';

/* ------------------------------------------------------------------ */
/* Primitives (multipart sends everything as strings)                  */
/* ------------------------------------------------------------------ */

export const TIME_FORMATS = ['h:mm A', 'hh:mm A', 'h:mmA', 'hh:mmA', 'H:mm', 'HH:mm'];

export const isTimeString = (value: unknown) =>
  typeof value === 'string' && moment(value.trim(), TIME_FORMATS, true).isValid();

const blankToUndefined = (v: unknown) =>
  v === '' || v === null || v === 'null' || v === 'undefined' ? undefined : v;

const optNumber = (label: string, min: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ invalid_type_error: `${label} must be a number` })
      .finite(`${label} must be a number`)
      .min(min, `${label} must be at least ${min}`)
      .optional(),
  );

const optInt = (label: string, min: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ invalid_type_error: `${label} must be a number` })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be at least ${min}`)
      .optional(),
  );

const optText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

const timeField = (label: string) =>
  z
    .string({
      required_error: `${label} is required`,
      invalid_type_error: `${label} must be a string`,
    })
    .trim()
    .refine(isTimeString, `${label} must be a time like "10:00 AM" or "22:00"`);

const urlField = (label: string) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().url(`${label} must be a valid URL`).optional(),
  );

const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'must be a valid id');

/** "VIP" | "vip" | "Normal" | "normal" -> 'VIP' | 'Normal' */
const seatType = z.preprocess(
  v => {
    if (typeof v !== 'string') return v;
    const s = v.trim().toLowerCase();
    if (s === 'vip') return 'VIP';
    if (s === 'normal') return 'Normal';
    return v;
  },
  z.enum(['VIP', 'Normal'], {
    errorMap: () => ({ message: 'Seat type must be VIP or Normal' }),
  }),
);

/** ["a","b"] or "a,b" */
const idList = z.preprocess(
  v =>
    typeof v === 'string'
      ? v
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : v,
  z.array(objectId).max(50).optional(),
);

/* ------------------------------------------------------------------ */
/* Seats: new `seats[{id,type,photo,price,quantity,description}]`       */
/*        old `items[{_id,seat,photo,price,totalQty,description}]`     */
/* ------------------------------------------------------------------ */

const seatInput = z.object({
  id: objectId.optional(),
  _id: objectId.optional(),
  type: seatType.optional(),
  seat: seatType.optional(),
  price: optNumber('Seat price', 1),
  quantity: optInt('Seat quantity', 0),
  totalQty: optInt('Seat quantity', 0),
  description: optText(1000),
  photo: urlField('Seat photo'),
});

export type SeatInput = z.infer<typeof seatInput>;

const seatList = z
  .array(seatInput, { invalid_type_error: 'seats must be an array' })
  .max(2, 'At most 2 seat types (VIP, Normal)');

/** ignore empty rows the app may send (`{}` / `null`) */
const dropEmptyRows = (v: unknown) =>
  Array.isArray(v)
    ? v.filter(
        r =>
          r &&
          typeof r === 'object' &&
          Object.values(r).some(x => x !== '' && x !== null && x !== undefined),
      )
    : v;

const slotInput = z.object({
  id: objectId.optional(),
  _id: objectId.optional(),
  startTime: timeField('Slot start time').optional(),
  endTime: timeField('Slot end time').optional(),
});

export type SlotInput = z.infer<typeof slotInput>;

const slotList = z.preprocess(
  dropEmptyRows,
  z
    .array(slotInput, { invalid_type_error: 'slots must be an array' })
    .max(48, 'Too many slots')
    .optional(),
);

export type NormalizedSeat = {
  id?: string;
  type?: 'VIP' | 'Normal';
  price?: number;
  quantity?: number;
  description?: string;
  photo?: string;
};

/** Seats from either name (`seats` wins over `items`), mapped to one shape */
export const normalizeSeats = (body: any): NormalizedSeat[] | undefined => {
  const raw: SeatInput[] | undefined = body?.seats ?? body?.items;
  if (!Array.isArray(raw)) return undefined;
  return raw.map(s => ({
    id: s.id ?? s._id,
    type: s.type ?? s.seat,
    price: s.price,
    quantity: s.quantity ?? s.totalQty,
    description: s.description,
    photo: s.photo,
  }));
};

const uniqueTypes = (seats: NormalizedSeat[]) => {
  const types = seats.map(s => s.type).filter(Boolean);
  return new Set(types).size === types.length;
};

const commonBody = {
  title: optText(200),
  description: optText(5000),
  serviceArea: optText(300),
  foodType: optText(200),
  thumbnail: urlField('Thumbnail'),
  category: z.preprocess(blankToUndefined, objectId.optional()),
  openTime: z.preprocess(blankToUndefined, timeField('Open time').optional()),
  closeTime: z.preprocess(blankToUndefined, timeField('Close time').optional()),
  seats: z.preprocess(dropEmptyRows, seatList.optional()),
  items: z.preprocess(dropEmptyRows, seatList.optional()),
  slots: slotList,
};

const createRestaurant = z.object({
  body: z.object(commonBody).superRefine((b, ctx) => {
    const need = (key: keyof typeof b, label: string) => {
      if (b[key] === undefined)
        ctx.addIssue({ code: 'custom', path: [key], message: `${label} is required` });
    };
    need('title', 'Title');
    need('category', 'Category');
    need('serviceArea', 'Service area');
    need('openTime', 'Open time');
    need('closeTime', 'Close time');

    const seats = normalizeSeats(b);
    if (!seats || seats.length === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['seats'],
        message: 'Add 1 or 2 seat types (VIP, Normal)',
      });
    else {
      seats.forEach((s, i) => {
        if (!s.type)
          ctx.addIssue({
            code: 'custom',
            path: ['seats', i, 'type'],
            message: 'Seat type is required (VIP or Normal)',
          });
        if (s.price === undefined)
          ctx.addIssue({ code: 'custom', path: ['seats', i, 'price'], message: 'Seat price is required' });
        if (s.quantity === undefined)
          ctx.addIssue({
            code: 'custom',
            path: ['seats', i, 'quantity'],
            message: 'Seat quantity is required',
          });
      });
      if (!uniqueTypes(seats))
        ctx.addIssue({
          code: 'custom',
          path: ['seats'],
          message: 'Each seat type (VIP, Normal) can be added once',
        });
    }

    if (!b.slots || b.slots.length === 0)
      ctx.addIssue({ code: 'custom', path: ['slots'], message: 'At least one slot is required' });
    else
      b.slots.forEach((s, i) => {
        if (!s.startTime || !s.endTime)
          ctx.addIssue({
            code: 'custom',
            path: ['slots', i],
            message: 'Each slot needs startTime and endTime',
          });
      });
  }),
});

const updateRestaurant = z.object({
  body: z
    .object({
      ...commonBody,
      removeSeatIds: idList,
      removeItemIds: idList,
      removeSlotIds: idList,
    })
    .superRefine((b, ctx) => {
      const seats = normalizeSeats(b);
      if (seats && !uniqueTypes(seats))
        ctx.addIssue({
          code: 'custom',
          path: ['seats'],
          message: 'Each seat type (VIP, Normal) can be sent once',
        });
    }),
});

const updateStatus = z.object({
  body: z.object({
    isActive: z.preprocess(
      v => (v === 'true' ? true : v === 'false' ? false : v),
      z.boolean({
        required_error: 'isActive is required',
        invalid_type_error: 'isActive must be true or false',
      }),
    ),
  }),
});

const updateServiceFee = z.object({
  body: z.object({
    serviceFee: z.preprocess(
      blankToUndefined,
      z.coerce
        .number({
          required_error: 'Service fee is required',
          invalid_type_error: 'Service fee must be a number',
        })
        .finite('Service fee must be a number')
        .min(0, 'Service fee cannot be negative')
        .max(100000, 'Service fee is too high'),
    ),
  }),
});

export const RestaurantValidations = {
  createRestaurant,
  updateRestaurant,
  updateStatus,
  updateServiceFee,
};
