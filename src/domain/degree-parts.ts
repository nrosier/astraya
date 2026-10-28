/**
 * @module degree-parts
 * @purpose Splits an ecliptic longitude into sign name plus degree/minute/second within it (#44).
 * @conventions Pure and framework-free; kept out of `chart-tables.ts` so `ui/format.ts`, which the app shell loads eagerly, does not drag the whole table-shaping module into the main bundle; longitude is rounded to the nearest arcsecond before sign-splitting to avoid a seconds rounding bumping the sign; `chart-tables.ts` re-exports both names.
 * @exports DegreeParts, degreeParts
 */
import { degreesInSign, signOf } from '../astrology/signs.js';
import type { Degrees } from '../ephemeris/types.js';

export interface DegreeParts {
  readonly sign: string;
  readonly degree: number;
  readonly minute: number;
  readonly second: number;
}

/**
 * Splits a longitude into sign name plus degree/minute/second within it.
 *
 * Rounds the whole longitude to the nearest arcsecond *before* finding the
 * sign, rather than after splitting off the within-sign degrees. Rounding
 * after would let something like 29°59'59.6" round its seconds up to a
 * nonexistent 30°00'00" while the sign was already fixed at the *lower*
 * value — a real degree that would then print in the wrong sign. Snapping to
 * the arcsecond first means the sign lookup and the degree split always see
 * the same, already-rounded number.
 */
export function degreeParts(longitude: Degrees): DegreeParts {
  const rounded = Math.round(longitude * 3600) / 3600;
  const sign = signOf(rounded).name;
  const withinSign = degreesInSign(rounded);
  const totalSeconds = Math.round(withinSign * 3600);
  const degree = Math.floor(totalSeconds / 3600);
  const minute = Math.floor((totalSeconds % 3600) / 60);
  const second = totalSeconds % 60;
  return { sign, degree, minute, second };
}
