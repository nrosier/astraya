/**
 * @module domain/planetary-hour
 * @purpose The planetary day and hour at a moment and place (#2019): finds the day's sunrise, sunset and next sunrise with the engine and hands them to `astrology/planetary-hours`.
 * @conventions Lilly, Christian Astrology (1659), printed p. 356, via `planetaryHourAt`. The planetary day runs from sunrise to the next sunrise, so the sunrise used is the latest one at or before the moment. Sunrise and sunset are the Sun's rise and set from `riseTransit` at the visible horizon (upper limb with refraction, "Swiss refraction", owner decision on #2012 and #2019). The weekday is that of the sunrise's local mean date at the place (`weekdayAtPlace`). Where the Sun does not both rise and set (polar day or night), the result is `no-sunrise`, never a guessed hour. `provider` must already be initialized.
 * @exports PlanetaryHourAtPlace, planetaryHourAtPlace
 */
import { bodyByKey } from '../astrology/bodies.js';
import { planetaryHourAt, weekdayAtPlace, type PlanetaryHour } from '../astrology/planetary-hours.js';
import type { EphemerisProvider, GeoPosition, JulianDayUT } from '../ephemeris/types.js';

export type PlanetaryHourAtPlace =
  | {
      readonly kind: 'hour';
      readonly hour: PlanetaryHour;
      readonly sunrise: JulianDayUT;
      readonly sunset: JulianDayUT;
      readonly nextSunrise: JulianDayUT;
    }
  | { readonly kind: 'no-sunrise' };

const NO_SUNRISE = { kind: 'no-sunrise' } as const;

/** The planetary day and hour at `jd` at `place`. */
export async function planetaryHourAtPlace(
  provider: EphemerisProvider,
  jd: JulianDayUT,
  place: GeoPosition,
): Promise<PlanetaryHourAtPlace> {
  const sun = bodyByKey('sun');
  if (sun === undefined) throw new Error('unreachable: the Sun is always in BODIES');
  const nextRise = (from: JulianDayUT): Promise<JulianDayUT | undefined> =>
    provider.riseTransit(from, sun.id, place, 'rise', 'visual');

  // The latest sunrise at or before the moment. Sunrises are about a day apart, so the first one after `jd - 1` is at or
  // before `jd`; a later one can still fall in that day when days are lengthening, so step forward while one does.
  let sunrise = await nextRise(jd - 1);
  if (sunrise === undefined || sunrise > jd) return NO_SUNRISE;
  let nextSunrise = await nextRise(sunrise + 0.5);
  while (nextSunrise !== undefined && nextSunrise <= jd) {
    sunrise = nextSunrise;
    nextSunrise = await nextRise(sunrise + 0.5);
  }
  if (nextSunrise === undefined) return NO_SUNRISE;
  const sunset = await provider.riseTransit(sunrise, sun.id, place, 'set', 'visual');
  if (sunset === undefined || !(sunrise < sunset && sunset < nextSunrise)) return NO_SUNRISE;

  const hour = planetaryHourAt({
    moment: jd,
    sunrise,
    sunset,
    nextSunrise,
    sunriseWeekday: weekdayAtPlace(sunrise, place.longitude),
  });
  return hour === undefined ? NO_SUNRISE : { kind: 'hour', hour, sunrise, sunset, nextSunrise };
}
