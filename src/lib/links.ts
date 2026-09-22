import { env } from '$env/dynamic/public';

export const BOOKING_URL = env.PUBLIC_BOOKING_URL?.trim() || null;

/**
 * Where an author writes to have their post taken off the public wall.
 *
 * A named constant rather than a string in a template because it appears on three pages and in the
 * structured data, and a takedown address that is wrong on one of them is worse than none at all.
 */
export const WALL_REMOVAL_EMAIL = 'hi@dazero.co';
