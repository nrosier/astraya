/**
 * The 12 tropical zodiac signs, as a pure partition of ecliptic longitude.
 *
 * Like `nakshatras.ts`, this is definitional rather than computed by Swiss
 * Ephemeris: each sign spans exactly 30 degrees starting from 0 Aries, with no
 * dependency on live ephemeris data. Sidereal placements use the same
 * partition — it is the longitude itself (already ayanamsa-shifted by the
 * engine) that differs, not the sign boundaries.
 */

/**
 * @module Signs
 * @purpose Defines the 12 tropical zodiac signs as a pure partition of ecliptic longitude, with element/modality classification.
 * @conventions Each sign spans exactly 30 degrees starting from 0 Aries, definitional rather than ephemeris-computed; sidereal placements use the same partition since only the longitude itself (already ayanamsa-shifted by the engine) differs, not the sign boundaries.
 * @exports SIGN_SPAN, SIGNS, signIndex, signOf, degreesInSign, oppositeSign, degreeSymbolNumber,
 *   signAndDegreeOf
 */
import type { Degrees } from '../ephemeris/types.js';

export type Element = 'fire' | 'earth' | 'air' | 'water';
export type Modality = 'cardinal' | 'fixed' | 'mutable';

export interface SignDefinition {
  /** 0..11, 0 = Aries. */
  readonly index: number;
  readonly name: string;
  readonly element: Element;
  readonly modality: Modality;
}

/** The width of one sign. */
export const SIGN_SPAN: Degrees = 30;

export const SIGNS: readonly SignDefinition[] = [
  { index: 0, name: 'Aries', element: 'fire', modality: 'cardinal' },
  { index: 1, name: 'Taurus', element: 'earth', modality: 'fixed' },
  { index: 2, name: 'Gemini', element: 'air', modality: 'mutable' },
  { index: 3, name: 'Cancer', element: 'water', modality: 'cardinal' },
  { index: 4, name: 'Leo', element: 'fire', modality: 'fixed' },
  { index: 5, name: 'Virgo', element: 'earth', modality: 'mutable' },
  { index: 6, name: 'Libra', element: 'air', modality: 'cardinal' },
  { index: 7, name: 'Scorpio', element: 'water', modality: 'fixed' },
  { index: 8, name: 'Sagittarius', element: 'fire', modality: 'mutable' },
  { index: 9, name: 'Capricorn', element: 'earth', modality: 'cardinal' },
  { index: 10, name: 'Aquarius', element: 'air', modality: 'fixed' },
  { index: 11, name: 'Pisces', element: 'water', modality: 'mutable' },
];

/** Normalise to the half-open interval [0, 360). */
function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/** The zero-based sign index (0 = Aries) for a longitude, wrapping first. */
export function signIndex(longitude: Degrees): number {
  return Math.floor(norm360(longitude) / SIGN_SPAN);
}

/** The sign for a longitude, wrapping first. */
export function signOf(longitude: Degrees): SignDefinition {
  const index = signIndex(longitude);
  const sign = SIGNS[index];
  if (!sign) throw new Error(`unreachable: sign index ${index} out of range`);
  return sign;
}

/** Degrees elapsed within the sign, in [0, 30). */
export function degreesInSign(longitude: Degrees): Degrees {
  return norm360(longitude) - signIndex(longitude) * SIGN_SPAN;
}

/** The sign 180 degrees opposite, wrapping around the zodiac. */
export function oppositeSign(index: number): number {
  return (index + 6) % 12;
}

/**
 * The global 1-360 "degree-symbol" number (#405) a longitude falls in — a traditional degree
 * symbol's own counting convention, not a rounding of the decimal longitude: a body at 29.9°
 * Aries is still "in the 30th degree of Aries" (`degree-symbol:30`), not Taurus' 1st, the same
 * way an ordinal "1st, 2nd, … 30th degree" counts a span it hasn't yet completed. `floor+1`,
 * never `round` — rounding would misattribute every longitude within half a degree of a sign
 * boundary to the wrong sign's first degree.
 */
export function degreeSymbolNumber(longitude: Degrees): number {
  return Math.floor(norm360(longitude)) + 1;
}

/** A longitude's sign and the ordinal (1-30) degree within it — the shape every "Nth degree of Sign" label needs (compose.ts, placement-label.ts, report-provenance.ts, degree-symbol lookups). */
export function signAndDegreeOf(longitude: Degrees): { readonly sign: SignDefinition; readonly degree: number } {
  const sign = signOf(longitude);
  const degree = Math.floor(degreesInSign(longitude)) + 1;
  return { sign, degree };
}

/** `signAndDegreeOf`'s inverse: a `degree-symbol` number's (1-360) own sign and ordinal degree within it, for labeling a `degree-symbol` placement that only carries the global number, not a longitude. */
export function signAndDegreeFromDegreeSymbol(degreeSymbol: number): {
  readonly sign: SignDefinition;
  readonly degree: number;
} {
  const index = Math.floor((degreeSymbol - 1) / SIGN_SPAN);
  const sign = SIGNS[index];
  if (!sign) throw new Error(`unreachable: degree-symbol ${String(degreeSymbol)} out of range 1-360`);
  return { sign, degree: ((degreeSymbol - 1) % SIGN_SPAN) + 1 };
}
