/**
 * #2019: the planetary day and hour at a moment and place, on the real engine (no mocks). Sunrise and sunset are the
 * Sun's rise and set at the visible horizon; the weekday is the sunrise's local mean date at the place.
 */
import { describe, expect, it } from 'vitest';
import { weekdayAtPlace } from '../src/astrology/planetary-hours.js';
import { planetaryHourAtPlace } from '../src/domain/planetary-hour.js';
import { getEngine } from './engine-harness.js';

const LONDON = { latitude: 51.5074, longitude: -0.1278, altitude: 0 };
const TOKYO = { latitude: 35.6762, longitude: 139.6503, altitude: 0 };
const TROMSO = { latitude: 69.6492, longitude: 18.9553, altitude: 0 };

describe('weekdayAtPlace (#2019)', () => {
  it('gives the weekday of the civil date at Greenwich: 1 January 2000 was a Saturday', async () => {
    const engine = await getEngine();
    expect(weekdayAtPlace(await engine.julianDayFromUtc(2000, 1, 1, 12, 0, 0), 0)).toBe(6);
  });

  it('uses the local date, not the UT date: 21:00 UT on Sunday is Monday morning in Tokyo', async () => {
    const engine = await getEngine();
    const jd = await engine.julianDayFromUtc(2024, 1, 7, 21, 0, 0); // Sunday 7 January 2024 in UT
    expect(weekdayAtPlace(jd, 0)).toBe(0);
    expect(weekdayAtPlace(jd, TOKYO.longitude)).toBe(1);
  });
});

describe('planetaryHourAtPlace (#2019)', () => {
  it('London, Wednesday 21 June 2000 at noon UT: a day hour of Mercury’s day, inside the sunrise-to-sunset span', async () => {
    const engine = await getEngine();
    const jd = await engine.julianDayFromUtc(2000, 6, 21, 12, 0, 0);
    const result = await planetaryHourAtPlace(engine, jd, LONDON);
    expect(result.kind).toBe('hour');
    if (result.kind !== 'hour') return;
    expect(result.hour.dayRuler).toBe('mercury');
    expect(result.hour.isDay).toBe(true);
    expect(result.sunrise).toBeLessThanOrEqual(jd);
    expect(jd).toBeLessThan(result.sunset);
    expect(result.hour.start).toBeLessThanOrEqual(jd);
    expect(jd).toBeLessThan(result.hour.end);
    // The day is about 16.6 hours long at midsummer in London, so a day hour is about 83 minutes.
    expect((result.hour.end - result.hour.start) * 24 * 60).toBeGreaterThan(80);
  });

  it('a moment just before sunrise belongs to the previous planetary day, in its last night hour', async () => {
    const engine = await getEngine();
    const noon = await engine.julianDayFromUtc(2000, 6, 21, 12, 0, 0);
    const today = await planetaryHourAtPlace(engine, noon, LONDON);
    if (today.kind !== 'hour') throw new Error('no sunrise in London in June');
    const result = await planetaryHourAtPlace(engine, today.sunrise - 1 / 1440, LONDON);
    expect(result.kind).toBe('hour');
    if (result.kind !== 'hour') return;
    expect(result.hour.dayRuler).toBe('mars'); // Tuesday 20 June 2000
    expect(result.hour.isDay).toBe(false);
    expect(result.hour.hourOfPart).toBe(12);
    // The night's twelfth hour is followed by the day's first, which belongs to Mercury on a Wednesday.
    expect(result.nextSunrise).toBeCloseTo(today.sunrise, 6);
  });

  it('Tokyo, a Monday morning: the day ruler is the Moon, though the sunrise falls on Sunday in UT', async () => {
    const engine = await getEngine();
    const jd = await engine.julianDayFromUtc(2024, 1, 8, 0, 0, 0); // 09:00 on Monday 8 January in Tokyo
    const result = await planetaryHourAtPlace(engine, jd, TOKYO);
    expect(result.kind).toBe('hour');
    if (result.kind !== 'hour') return;
    expect(weekdayAtPlace(result.sunrise, 0)).toBe(0); // the sunrise is on Sunday in UT
    expect(result.hour.dayRuler).toBe('moon');
  });

  it('Tromsø at midsummer, where the Sun does not set: no planetary hours, not a guessed one', async () => {
    const engine = await getEngine();
    const jd = await engine.julianDayFromUtc(2000, 6, 21, 12, 0, 0);
    expect(await planetaryHourAtPlace(engine, jd, TROMSO)).toEqual({ kind: 'no-sunrise' });
  });
});
