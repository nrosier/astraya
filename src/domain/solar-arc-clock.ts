/**
 * @module domain/solar-arc-clock
 * @purpose True Solar Arc clock (#1795): the Sun's right ascension travelled since birth, sampled from the ephemeris, so that one day after birth stands for one year of life (Makransky rev. ed. 1992, pp. 28-30, Placidus' method).
 * @conventions Samples the Sun's RA (`equatorial: true`, the RA is returned in the `longitude` field) at `birthJd + d` for whole days d = 0..SOLAR_ARC_CLOCK_MAX_DAYS, unwraps across 360 degrees, and interpolates linearly between samples. Days beyond the sampled span throw `RangeError`; nothing is extrapolated. All ephemeris access goes through `EphemerisProvider`. The sampling span is the default maximum age (100 years) plus a 10-year margin, the same span the primary-directions window uses.
 * The Natal Solar Rate clock (#2040) is the straight line at the Sun's speed in right ascension at birth (Solar Fire Deluxe guide §30.3.2.3).
 * @exports SOLAR_ARC_CLOCK_MAX_DAYS, createSolarArcClock, createNatalSolarRateClock
 */
import { bodyByKey } from '../astrology/bodies.js';
import type { SolarArcClock } from '../astrology/primary-directions.js';
import type { Degrees, EphemerisProvider, JulianDayUT } from '../ephemeris/types.js';

/** The last whole day sampled: 100 years of life plus a 10-year margin. */
export const SOLAR_ARC_CLOCK_MAX_DAYS = 110;

/**
 * Builds the True Solar Arc clock for a birth moment. The Sun's RA is sampled once per day for
 * `SOLAR_ARC_CLOCK_MAX_DAYS` days, unwrapped so it increases across 0° Aries, and interpolated
 * linearly between the samples. The returned functions are synchronous.
 */
export async function createSolarArcClock(provider: EphemerisProvider, birthJd: JulianDayUT): Promise<SolarArcClock> {
  const sun = bodyByKey('sun');
  if (sun === undefined) throw new Error('unreachable: the Sun is always in BODIES');

  const arcs: Degrees[] = [];
  let unwrapped = 0;
  let previous: Degrees | undefined;
  for (let day = 0; day <= SOLAR_ARC_CLOCK_MAX_DAYS; day++) {
    const [position] = await provider.positions(birthJd + day, [sun.id], { equatorial: true });
    if (position === undefined) throw new Error(`no Sun position for day ${String(day)} after birth`);
    const rightAscension = position.longitude;
    if (previous !== undefined) {
      // The Sun moves about one degree a day, so any step beyond half a circle is a wrap across 0° Aries.
      let step = rightAscension - previous;
      if (step < -180) step += 360;
      if (step > 180) step -= 360;
      unwrapped += step;
    }
    arcs.push(unwrapped);
    previous = rightAscension;
  }

  const last = arcs[SOLAR_ARC_CLOCK_MAX_DAYS] ?? 0;

  const arcAfterDays = (days: number): Degrees => {
    if (!(days >= 0 && days <= SOLAR_ARC_CLOCK_MAX_DAYS)) {
      throw new RangeError(`days after birth must be in [0, ${String(SOLAR_ARC_CLOCK_MAX_DAYS)}], got ${String(days)}`);
    }
    const whole = Math.min(Math.floor(days), SOLAR_ARC_CLOCK_MAX_DAYS - 1);
    const from = arcs[whole] ?? 0;
    const to = arcs[whole + 1] ?? from;
    return from + (days - whole) * (to - from);
  };

  const daysForArc = (arc: Degrees): number => {
    if (!(arc >= 0 && arc <= last)) {
      throw new RangeError(`arc must be in [0, ${String(last)}] for the sampled span, got ${String(arc)}`);
    }
    // Binary search for the last sample not above `arc`; the arcs increase, so this finds its day.
    let low = 0;
    let high = SOLAR_ARC_CLOCK_MAX_DAYS;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if ((arcs[mid] ?? 0) <= arc) low = mid;
      else high = mid;
    }
    const from = arcs[low] ?? 0;
    const to = arcs[low + 1] ?? from;
    const fraction = to === from ? 0 : (arc - from) / (to - from);
    return low + fraction;
  };

  return { arcAfterDays, daysForArc };
}

/**
 * The Natal Solar Rate clock (#2040; Solar Fire Deluxe guide §30.3.2.3: "the natal Sun's rate of
 * motion in R.A. for each year of life"): one year of life for each day's right-ascension motion
 * of the Sun at birth, a constant rate for the whole life. The rate is the ephemeris's own speed
 * in right ascension at the birth moment, in degrees per day. It runs over any span, since it is
 * a straight line; a negative arc or age is not asked of it (`arcToYears` takes the absolute arc).
 */
export async function createNatalSolarRateClock(
  provider: EphemerisProvider,
  birthJd: JulianDayUT,
): Promise<SolarArcClock> {
  const sun = bodyByKey('sun');
  if (sun === undefined) throw new Error('unreachable: the Sun is always in BODIES');
  const [position] = await provider.positions(birthJd, [sun.id], { equatorial: true });
  if (position === undefined) throw new Error('no Sun position at birth');
  // With `equatorial`, the longitude-speed field is the speed in right ascension.
  const rate = position.longitudeSpeed;
  if (!(rate > 0)) throw new RangeError(`the Sun's speed in right ascension must be positive, got ${String(rate)}`);
  return { arcAfterDays: (days) => days * rate, daysForArc: (arc) => arc / rate };
}
