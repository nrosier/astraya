/**
 * Integration test for findSignIngresses (#562) against the real Swiss Ephemeris, checked
 * against well-established calendar facts: the Sun crosses into Aquarius every year around
 * January 20, and into Pisces around February 18-19 (the modern tropical zodiac's own
 * definition of those sign boundaries — see e.g. any almanac's "Sun sign dates" table).
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { findSignIngresses } from '../src/astrology/sign-ingress.js';
import { getEngine } from './engine-harness.js';

describe('findSignIngresses (#562)', () => {
  it('finds the Sun entering Aquarius around January 20 and Pisces around February 18-19, 2024', async () => {
    const engine = await getEngine();
    const sun = bodyByKey('sun')?.id;
    expect(sun).toBeDefined();
    if (sun === undefined) return;

    const fromJd = await engine.julianDay(2024, 1, 15, 0);
    const toJd = await engine.julianDay(2024, 2, 25, 0);
    const events = await findSignIngresses(sun, fromJd, toJd, engine);

    expect(events).toHaveLength(2);
    const [aquarius, pisces] = events;
    expect(aquarius?.sign).toBe(10); // Aquarius, 0-indexed from Aries
    expect(pisces?.sign).toBe(11); // Pisces

    const aquariusStart = await engine.julianDay(2024, 1, 19, 0);
    const aquariusEnd = await engine.julianDay(2024, 1, 21, 0);
    expect(aquarius?.jd ?? 0).toBeGreaterThan(aquariusStart);
    expect(aquarius?.jd ?? 0).toBeLessThan(aquariusEnd);

    const piscesStart = await engine.julianDay(2024, 2, 18, 0);
    const piscesEnd = await engine.julianDay(2024, 2, 20, 0);
    expect(pisces?.jd ?? 0).toBeGreaterThan(piscesStart);
    expect(pisces?.jd ?? 0).toBeLessThan(piscesEnd);
  });

  it('returns events in chronological order', async () => {
    const engine = await getEngine();
    const sun = bodyByKey('sun')?.id;
    expect(sun).toBeDefined();
    if (sun === undefined) return;

    const fromJd = await engine.julianDay(2024, 1, 1, 0);
    const toJd = await engine.julianDay(2025, 1, 1, 0);
    const events = await findSignIngresses(sun, fromJd, toJd, engine);
    expect(events).toHaveLength(12); // the Sun crosses every sign exactly once per year
    for (let i = 1; i < events.length; i++) {
      expect(events[i]?.jd).toBeGreaterThan(events[i - 1]?.jd ?? 0);
      expect(events[i]?.retrograde).toBe(false); // the Sun never retrogrades
    }
  });
});
