/**
 * #2019, real engine: sunrise and sunset come from `riseTransit` at the visible horizon (Swiss refraction, as decided on
 * #2012). The planetary day and hour computed from those times follow Lilly's rule, and the day's first hour is the planet
 * of the sunrise weekday. No mocks; the Swiss Ephemeris runs in the test.
 */
import { describe, expect, it } from 'vitest';
import { planetaryHourAt } from '../src/astrology/planetary-hours.js';
import { SE } from '../src/ephemeris/generated-constants.js';
import { getEngine } from './engine-harness.js';

// London, 21 June 2000, a Wednesday. Sunrise and sunset are the Sun's rise and set from the engine.
const LONDON = { latitude: 51.5074, longitude: -0.1278, altitude: 0 };
const WEDNESDAY = 3;
const DAY_RULER_WEDNESDAY = 'mercury';

describe('planetary day and hour from the real engine', () => {
  it('gives Mercury as the day ruler of a Wednesday sunrise, and a first hour that matches the rule', async () => {
    const engine = await getEngine();
    const midday = await engine.julianDayFromUtc(2000, 6, 21, 12, 0, 0);
    const sunrise = await engine.riseTransit(midday, SE.SE_SUN, LONDON, 'rise', 'visual');
    // Search the sunset from the sunrise forward: a search from midday can return the previous evening's sunset.
    const sunset = await engine.riseTransit(sunrise ?? midday, SE.SE_SUN, LONDON, 'set', 'visual');
    expect(sunrise).toBeDefined();
    expect(sunset).toBeDefined();
    if (sunrise === undefined || sunset === undefined) return;
    const nextSunrise = await engine.riseTransit(sunrise + 0.5, SE.SE_SUN, LONDON, 'rise', 'visual');
    // The three times must be in order for the day to be defined.
    expect(sunrise < sunset && sunset < (nextSunrise ?? 0)).toBe(true);
    expect(nextSunrise).toBeDefined();
    if (nextSunrise === undefined) return;

    // A moment a quarter of the way into the first day hour, after sunrise on the same day.
    const moment = sunrise + (sunset - sunrise) / 48;
    const hour = planetaryHourAt({ moment, sunrise, sunset, nextSunrise, sunriseWeekday: WEDNESDAY });
    expect(hour?.dayRuler).toBe(DAY_RULER_WEDNESDAY);
    expect(hour?.ruler).toBe(DAY_RULER_WEDNESDAY);
    expect(hour?.isDay).toBe(true);
    expect(hour?.hourOfPart).toBe(1);
  }, 60_000);

  it('uses sunrise, not midnight, to start the day: a moment before sunrise stays on the previous day', async () => {
    const engine = await getEngine();
    const midday = await engine.julianDayFromUtc(2000, 6, 21, 12, 0, 0);
    const sunrise = await engine.riseTransit(midday, SE.SE_SUN, LONDON, 'rise', 'visual');
    expect(sunrise).toBeDefined();
    if (sunrise === undefined) return;
    const beforeSunrise = sunrise - 0.01;
    const sunsetPrev = await engine.riseTransit(midday - 1, SE.SE_SUN, LONDON, 'set', 'visual');
    const nextSunrise = await engine.riseTransit(sunrise, SE.SE_SUN, LONDON, 'rise', 'visual');
    expect(sunsetPrev).toBeDefined();
    if (sunsetPrev === undefined || nextSunrise === undefined) return;
    // The moment is before this sunrise, so the planetary day is the previous one: this call must not place it here.
    expect(
      planetaryHourAt({
        moment: beforeSunrise,
        sunrise,
        sunset: sunrise + 0.5,
        nextSunrise,
        sunriseWeekday: WEDNESDAY,
      }),
    ).toBeUndefined();
  }, 60_000);
});
