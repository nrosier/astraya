/**
 * Integration tests for prenatalSyzygy (#1798) against the real Swiss Ephemeris (no mocks). The
 * expected instants come from `findLunations` (checked against a published table in
 * astrology-lunations.test.ts), not from a hand-typed table. The 1879 golden table is a separate
 * test that waits for the owner's source.
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { findLunations, type LunationEvent } from '../src/astrology/lunations.js';
import { prenatalSyzygy } from '../src/domain/prenatal-syzygy.js';
import type { GeoPosition } from '../src/ephemeris/types.js';
import { getEngine } from './engine-harness.js';

type Engine = Awaited<ReturnType<typeof getEngine>>;

/** Ulm (the Einstein fixture's place). */
const ULM: GeoPosition = { latitude: 48.4, longitude: 9.99, altitude: 0 };
const ONE_MINUTE_DAYS = 1 / (24 * 60);
const ONE_SECOND_DAYS = 1 / (24 * 60 * 60);

function bodyId(key: string): number {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`unknown body ${key}`);
  return body.id;
}

/** Lunations in March 1879, the window used by every case below. */
async function marchLunations(engine: Engine): Promise<readonly LunationEvent[]> {
  const fromJd = await engine.julianDayFromUtc(1879, 2, 1, 0, 0, 0);
  const toJd = await engine.julianDayFromUtc(1879, 4, 1, 0, 0, 0);
  return findLunations(fromJd, toJd, engine);
}

describe('prenatalSyzygy (#1798)', () => {
  it('a birth one minute after a Full Moon returns that Full Moon (preventional)', async () => {
    const engine = await getEngine();
    const full = (await marchLunations(engine)).find((event) => event.kind === 'full');
    expect(full).toBeDefined();
    const result = await prenatalSyzygy(engine, (full?.jd ?? 0) + ONE_MINUTE_DAYS, ULM);
    expect(result.kind).toBe('prevention');
    expect(Math.abs(result.jd - (full?.jd ?? 0))).toBeLessThan(ONE_SECOND_DAYS);
  });

  it('a birth one minute after a New Moon returns that New Moon (conjunctional)', async () => {
    const engine = await getEngine();
    const newMoon = (await marchLunations(engine)).find((event) => event.kind === 'new');
    expect(newMoon).toBeDefined();
    const result = await prenatalSyzygy(engine, (newMoon?.jd ?? 0) + ONE_MINUTE_DAYS, ULM);
    expect(result.kind).toBe('conjunction');
    expect(Math.abs(result.jd - (newMoon?.jd ?? 0))).toBeLessThan(ONE_SECOND_DAYS);
  });

  it('a birth one minute before a Full Moon returns the New Moon before it, not that Full Moon', async () => {
    const engine = await getEngine();
    const events = await marchLunations(engine);
    const full = events.filter((event) => event.kind === 'full').at(-1);
    const newBeforeFull = events.filter((event) => event.kind === 'new' && event.jd < (full?.jd ?? 0)).at(-1);
    expect(newBeforeFull).toBeDefined();
    const result = await prenatalSyzygy(engine, (full?.jd ?? 0) - ONE_MINUTE_DAYS, ULM);
    expect(result.kind).toBe('conjunction');
    expect(Math.abs(result.jd - (newBeforeFull?.jd ?? 0))).toBeLessThan(ONE_SECOND_DAYS);
  });

  it('is the latest syzygy strictly before birth: no other New or Full Moon lies between it and birth', async () => {
    const engine = await getEngine();
    const events = await marchLunations(engine);
    const birthJd = (events.find((event) => event.kind === 'full')?.jd ?? 0) + 3;
    const result = await prenatalSyzygy(engine, birthJd, ULM);
    expect(result.jd).toBeLessThan(birthJd);
    expect(events.filter((event) => event.jd > result.jd && event.jd < birthJd)).toHaveLength(0);
  });

  it('a conjunction: the Sun and Moon share the degree, and the degree is the Moon longitude', async () => {
    const engine = await getEngine();
    const newMoon = (await marchLunations(engine)).find((event) => event.kind === 'new');
    const result = await prenatalSyzygy(engine, (newMoon?.jd ?? 0) + ONE_MINUTE_DAYS, ULM);
    expect(result.kind).toBe('conjunction');
    const sun = await engine.position(result.jd, bodyId('sun'));
    const moon = await engine.position(result.jd, bodyId('moon'));
    expect(result.sunLongitude).toBeCloseTo(sun.longitude, 9);
    expect(result.moonLongitude).toBeCloseTo(moon.longitude, 9);
    expect(result.degree).toBeCloseTo(moon.longitude, 9);
  });

  it('a prevention degree is the luminary above the horizon at that instant, from the Ascendant of provider.houses', async () => {
    const engine = await getEngine();
    const full = (await marchLunations(engine)).find((event) => event.kind === 'full');
    const result = await prenatalSyzygy(engine, (full?.jd ?? 0) + ONE_MINUTE_DAYS, ULM);
    expect(result.kind).toBe('prevention');
    const houses = await engine.houses(result.jd, ULM, 'P');
    const sunAbove = (((result.sunLongitude - houses.ascendant) % 360) + 360) % 360 >= 180;
    expect(result.degree).toBeCloseTo(sunAbove ? result.sunLongitude : result.moonLongitude, 9);
  });

  // Measured on origin/main (7a6410a5) with the Lahiri mode (SE_SIDM_LAHIRI = 1), for birth one minute after the
  // 1879-03-14 New Moon (JD 2407401.668968): tropical Moon 332.19287726, sidereal Moon 310.01921025, ayanamsa
  // 22.17366702 at the syzygy instant. The sidereal degree is the sidereal Moon, and equals the tropical one less the ayanamsa.
  it('a sidereal chart: the conjunction degree is the sidereal Moon, the tropical one less the ayanamsa (#1798)', async () => {
    const engine = await getEngine();
    const newMoon = (await marchLunations(engine)).find((event) => event.kind === 'new');
    const birthJd = (newMoon?.jd ?? 0) + ONE_MINUTE_DAYS;
    const sidereal = { kind: 'sidereal' as const, ayanamsa: 1 };
    const tropical = await prenatalSyzygy(engine, birthJd, ULM);
    const siderealResult = await prenatalSyzygy(engine, birthJd, ULM, 'P', sidereal);
    expect(siderealResult.kind).toBe('conjunction');
    expect(siderealResult.jd).toBeCloseTo(tropical.jd, 6);
    const siderealMoon = await engine.position(siderealResult.jd, bodyId('moon'), { zodiac: sidereal });
    expect(siderealResult.degree).toBeCloseTo(siderealMoon.longitude, 6);
    expect(siderealResult.degree).toBeCloseTo(310.01921025, 4);
    const ayanamsa = await engine.ayanamsa(tropical.jd, 1);
    expect(ayanamsa).toBeCloseTo(22.17366702, 4);
    expect((tropical.degree ?? 0) - (siderealResult.degree ?? 0)).toBeCloseTo(ayanamsa, 2);
  });
});
