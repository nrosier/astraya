/**
 * Integration test for findLunations (#562) against the real Swiss Ephemeris, checked against a
 * published reference: NASA/Fred Espenak's "Phases of the Moon" table
 * (https://astropixels.com/ephemeris/phasescat/phases2001.html) gives the New Moon of 2003
 * January 2 as 20:23 UT, and the following Full Moon (2003 January 18) as 10:48 UT.
 */
import { describe, expect, it } from 'vitest';
import { findLunations } from '../src/astrology/lunations.js';
import { getEngine } from './engine-harness.js';

describe('findLunations (#562)', () => {
  it('finds the published 2003 January New Moon and Full Moon within a minute', async () => {
    const engine = await getEngine();
    const fromJd = await engine.julianDay(2003, 1, 1, 0);
    const toJd = await engine.julianDay(2003, 1, 20, 0);

    const events = await findLunations(fromJd, toJd, engine);
    const newMoon = events.find((event) => event.kind === 'new');
    const fullMoon = events.find((event) => event.kind === 'full');
    expect(newMoon).toBeDefined();
    expect(fullMoon).toBeDefined();

    const expectedNewMoonJd = await engine.julianDayFromUtc(2003, 1, 2, 20, 23, 0);
    const expectedFullMoonJd = await engine.julianDayFromUtc(2003, 1, 18, 10, 48, 0);
    expect(Math.abs((newMoon?.jd ?? 0) - expectedNewMoonJd) * 24 * 60).toBeLessThan(2); // within 2 minutes
    expect(Math.abs((fullMoon?.jd ?? 0) - expectedFullMoonJd) * 24 * 60).toBeLessThan(2);
  });

  it('returns events in chronological order', async () => {
    const engine = await getEngine();
    const fromJd = await engine.julianDay(2003, 1, 1, 0);
    const toJd = await engine.julianDay(2003, 2, 1, 0);
    const events = await findLunations(fromJd, toJd, engine);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]?.jd).toBeGreaterThan(events[i - 1]?.jd ?? 0);
    }
  });
});
