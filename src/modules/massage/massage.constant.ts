export const USER_UPLOADS_FOLDER = 'uploads/massages';

export const MASSAGE_CATEGORY = 'Massage' as const;

/** Shortest / longest bookable session, in minutes */
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 24 * 60;

/** Multipart fields that may arrive as JSON strings */
export const MASSAGE_JSON_FIELDS = ['priceByDuration', 'durations'];

/** Guests treated at the same time (therapists): default and limit */
export const DEFAULT_CAPACITY = 1;
export const MAX_CAPACITY = 50;
