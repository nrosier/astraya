/**
 * Tertiary and minor progressions (#48): two more day-for-X substitutions
 * built on the same idea as secondary progression, just with a different
 * life unit standing in for "one day of ephemeris motion" — see
 * `progressions.ts`'s doc comment for the secondary case this contrasts with.
 *
 * - Tertiary progresses one day for every lunar month of life: the offset
 *   added to the natal Julian day is the number of tropical months elapsed
 *   since birth (`ageInTropicalMonths`).
 * - Minor progresses one lunar month for every year of life: the offset
 *   added to the natal Julian day is the number of years elapsed since
 *   birth (secondary's own `ageInYears`), converted into tropical months.
 *
 * The lunar month is Solar Fire's mean tertiary month, 27.32158648 days
 * (`TROPICAL_MONTH_DAYS`), not the synodic month (29.530588 days): the
 * progressed Moon's rate must match its own tropical motion, about
 * 13.176394 degrees a day (#2032). Solar Fire's true tertiary, which uses the
 * actual lunar months, is not implemented.
 *
 * Both recompute bodies and houses directly at the progressed moment —
 * exactly what secondary progression's `'quotidian'` MC method does — since
 * neither technique has competing schools for how the angles should move
 * the way secondary's naibod/solarArc/quotidian split does.
 */

/**
 * @module MinorProgressions
 * @purpose Computes tertiary and minor progressions — day-for-lunar-month and lunar-month-for-year substitutions analogous to secondary progression.
 * @conventions The lunar month is the mean tropical month, TROPICAL_MONTH_DAYS = 27.32158648 days: Solar Fire Deluxe User Guide §30.3.2.2 (text lines 8581-8588, "Mean Tertiary Rate" and "Minor Rate"). It is the Moon's mean return to the same tropical longitude (360 degrees over about 13.176394 degrees a day), not the sidereal month (27.32166 days, about 6.4 seconds longer a month, Cicek 2019) and not the synodic month (SYNODIC_MONTH_DAYS, 29.530588 days, which Astraya used before #2032; it remains only as the safe search span in planetary-returns.ts). Tertiary progresses one day per tropical month of life; minor progresses one tropical month per year of life, built on progressions.ts's ageInYears. Both recompute bodies/houses directly at the progressed moment, matching secondary progression's 'quotidian' method since neither technique has competing schools for angle movement. Solar Fire's true tertiary (actual lunar months) is not implemented.
 * @exports TROPICAL_MONTH_DAYS, SYNODIC_MONTH_DAYS, ageInTropicalMonths, minorProgressedJulianDay
 */
import { ageInYears } from './progressions.js';
import type { JulianDayUT } from '../ephemeris/types.js';

/**
 * The mean tropical lunar month in days: the lunar cycle Solar Fire Deluxe
 * uses for its mean tertiary and minor rates (#2032).
 */
export const TROPICAL_MONTH_DAYS = 27.32158648;

/**
 * Average synodic (new-moon-to-new-moon) lunar month, in days. Not used for
 * progression: `planetary-returns.ts` uses it as a safe search span, because it
 * is longer than any interval between two lunar returns.
 */
export const SYNODIC_MONTH_DAYS = 29.530588;

export type MinorProgressionMethod = 'tertiary' | 'minor';

/** Real time elapsed since birth, expressed in tropical months rather than years. */
export function ageInTropicalMonths(natalJd: JulianDayUT, targetJd: JulianDayUT): number {
  return (targetJd - natalJd) / TROPICAL_MONTH_DAYS;
}

/**
 * The Julian day to compute bodies and houses at for a tertiary or minor
 * progression. Distinct formulas, not a shared one parameterized by a single
 * ratio: tertiary substitutes lunar months for secondary's years directly
 * (the offset itself is the age in lunar months), while minor keeps
 * secondary's own year-based age and re-expresses it in lunar months.
 */
export function minorProgressedJulianDay(
  method: MinorProgressionMethod,
  natalJd: JulianDayUT,
  targetJd: JulianDayUT,
): JulianDayUT {
  return method === 'tertiary'
    ? natalJd + ageInTropicalMonths(natalJd, targetJd)
    : natalJd + ageInYears(natalJd, targetJd) * TROPICAL_MONTH_DAYS;
}
