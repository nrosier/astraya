/**
 * @module astrology/planetary-hours
 * @purpose The planetary day and the planetary hour for a moment, from the day's sunrise, sunset and next sunrise (#2019).
 * @conventions Lilly, Christian Astrology (1659), printed p. 356 (held as the sources.json record lilly-christian-astrology-vol2-1659): the first hour of each day belongs to that day's planet, beginning at sunrise; each later hour goes to the next planet in the Chaldean order (Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon). Day hours run from sunrise to sunset and night hours from sunset to the next sunrise, each split into twelve equal parts, so their length varies with the season. The day ruler is the planet of the weekday of the sunrise. The function is pure: the caller supplies the sunrise, sunset and next sunrise (from the engine's riseTransit, with the visible horizon the owner chose on #2012). No ephemeris import here.
 * @exports PlanetaryHour, PlanetaryHourInput, planetaryHourAt
 */
import type { JulianDayUT } from '../ephemeris/types.js';

/** The seven traditional planets in the Chaldean order that the hours follow (Lilly, p. 356). */
export const CHALDEAN_HOUR_ORDER: readonly string[] = ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon'];

/** The planet of each weekday, Sunday first (Lilly, p. 356). */
const DAY_RULER: readonly string[] = ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'];

export interface PlanetaryHourInput {
  /** The moment to place, as a Julian day in UT. */
  readonly moment: JulianDayUT;
  /** Sunrise on the civil day the moment falls in, or on the day before it when the moment is before that sunrise. */
  readonly sunrise: JulianDayUT;
  /** The sunset that follows that sunrise. */
  readonly sunset: JulianDayUT;
  /** The sunrise that ends that day (the next sunrise). */
  readonly nextSunrise: JulianDayUT;
  /** The weekday of `sunrise`, 0 = Sunday to 6 = Saturday, from the UT day the sunrise falls on. */
  readonly sunriseWeekday: number;
}

export interface PlanetaryHour {
  /** The planet that rules the hour (lowercase traditional name, for example 'saturn'). */
  readonly ruler: string;
  /** 1 to 12 within the day or the night. */
  readonly hourOfPart: number;
  /** True for a day hour (sunrise to sunset), false for a night hour. */
  readonly isDay: boolean;
  /** Start and end of this hour, as Julian days in UT. */
  readonly start: JulianDayUT;
  readonly end: JulianDayUT;
  /** The planet that rules the whole planetary day (from the sunrise weekday). */
  readonly dayRuler: string;
}

/**
 * The planetary hour in force at a moment, with its planet, its start and end, and whether it is a day or night hour.
 * Returns undefined when the moment is outside the day the inputs describe, or when the inputs are not in order.
 */
export function planetaryHourAt(input: PlanetaryHourInput): PlanetaryHour | undefined {
  const { moment, sunrise, sunset, nextSunrise, sunriseWeekday } = input;
  if (!(sunrise < sunset && sunset < nextSunrise)) return undefined;
  if (moment < sunrise || moment >= nextSunrise) return undefined;
  if (!Number.isInteger(sunriseWeekday) || sunriseWeekday < 0 || sunriseWeekday > 6) return undefined;

  const isDay = moment < sunset;
  const partStart = isDay ? sunrise : sunset;
  const partEnd = isDay ? sunset : nextSunrise;
  const partLength = (partEnd - partStart) / 12;
  const indexInPart = Math.min(11, Math.floor((moment - partStart) / partLength));
  const hourNumber = (isDay ? 0 : 12) + indexInPart; // 0 to 23 across the civil day from sunrise.

  const dayRuler = DAY_RULER[sunriseWeekday];
  if (dayRuler === undefined) return undefined;
  const rulerIndex = CHALDEAN_HOUR_ORDER.indexOf(dayRuler);
  const hourRulerIndex = (rulerIndex + hourNumber) % 7;
  const ruler = CHALDEAN_HOUR_ORDER[hourRulerIndex];
  if (ruler === undefined) return undefined;

  return {
    ruler,
    hourOfPart: indexInPart + 1,
    isDay,
    start: partStart + indexInPart * partLength,
    end: partStart + (indexInPart + 1) * partLength,
    dayRuler,
  };
}
