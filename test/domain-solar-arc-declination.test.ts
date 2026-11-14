/**
 * Solar arc in declination (#1407; owner decisions 2026-11-14): the Sun's arc in declination added to every natal
 * declination, and the parallels and contraparallels to the natal bodies within the existing 1° declination orb.
 * Real Swiss Ephemeris through the engine harness; the passage check against Solar Fire §23.2 is pending on #1407.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { progressedJulianDay } from '../src/astrology/progressions.js';
import { DEFAULT_DECLINATION_ORB } from '../src/domain/chart-tables.js';
import { computeSolarArcDeclinations } from '../src/domain/solar-arc-declination.js';
import type { SwissEphemerisEngine } from '../src/ephemeris/engine.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

let engine: SwissEphemerisEngine;
let natalJd: number;
let targetJd: number;
let sunId: number;

beforeAll(async () => {
  engine = await getEngine();
  natalJd = await julianDayFor(engine, resolveMoment(NATAL));
  targetJd = await engine.julianDayFromUtc(2026, 11, 14, 12, 0, 0);
  sunId = bodyByKey('sun')?.id ?? -1;
}, 60_000);

describe('computeSolarArcDeclinations (#1407)', () => {
  it('takes the arc from the progressed and natal Suns, read independently from the engine', async () => {
    const data = await computeSolarArcDeclinations(NATAL, targetJd, engine);
    const natalSun = await engine.position(natalJd, sunId, { equatorial: true });
    const progressedSun = await engine.position(progressedJulianDay(natalJd, targetJd), sunId, { equatorial: true });
    expect(data.arc).toBeCloseTo(progressedSun.latitude - natalSun.latitude, 10);
    // The directed Sun is the progressed Sun, by construction of the arc.
    const sun = data.declinations.find((d) => d.body === sunId);
    expect(sun?.directed).toBeCloseTo(progressedSun.latitude, 10);
  });

  it('moves every natal declination by the same arc', async () => {
    const data = await computeSolarArcDeclinations(NATAL, targetJd, engine);
    expect(data.declinations.length).toBeGreaterThan(10);
    for (const d of data.declinations) expect(d.directed - d.natal).toBeCloseTo(data.arc, 10);
  });

  it('reports parallels and contraparallels to the natal bodies within the 1° declination orb only', async () => {
    const data = await computeSolarArcDeclinations(NATAL, targetJd, engine);
    const byBody = new Map(data.declinations.map((d) => [d.body, d]));
    expect(data.contacts.length).toBeGreaterThan(0);
    for (const contact of data.contacts) {
      const directed = byBody.get(contact.directed)?.directed ?? Number.NaN;
      const natal = byBody.get(contact.natal)?.natal ?? Number.NaN;
      const orb = contact.kind === 'parallel' ? Math.abs(directed - natal) : Math.abs(directed + natal);
      expect(orb).toBeCloseTo(contact.orb, 10);
      expect(contact.orb).toBeLessThanOrEqual(DEFAULT_DECLINATION_ORB);
    }
    // Nothing within the orb is missed.
    let expected = 0;
    for (const a of data.declinations) {
      for (const b of data.declinations) {
        if (Math.abs(a.directed - b.natal) <= DEFAULT_DECLINATION_ORB) expected++;
        if (Math.abs(a.directed + b.natal) <= DEFAULT_DECLINATION_ORB) expected++;
      }
    }
    expect(data.contacts).toHaveLength(expected);
  });
});
