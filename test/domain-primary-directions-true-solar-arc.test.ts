/**
 * Domain wiring for the True Solar Arc key (#1795, task 5): `generatePrimaryDirections` and
 * `directedChartAt` with `PrimaryDirectionKey.TRUE_SOLAR_ARC`, against the real Swiss Ephemeris
 * (via `engine-harness.ts`, no mocks). Prince Charles's birth moment is the same as in
 * `primary-directions.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { arcToYears, TIME_KEY_DEGREES_PER_YEAR } from '../src/astrology/primary-directions.js';
import {
  DEFAULT_PRIMARY_DIRECTION_ORB,
  PrimaryDirectionKey,
  activeDirections,
  ageToArc,
  arcToAge,
  directedChartAt,
  generatePrimaryDirections,
  isDirectionActive,
} from '../src/domain/primary-directions.js';
import { createSolarArcClock, SOLAR_ARC_CLOCK_MAX_DAYS } from '../src/domain/solar-arc-clock.js';
import { TROPICAL_YEAR_DAYS } from '../src/astrology/progressions.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { arcsecondsBetween, getEngine } from './engine-harness.js';

const PRINCE_CHARLES: BirthMomentInput = {
  civil: { year: 1948, month: 11, day: 14, hour: 21, minute: 14, second: 39 },
  coordinates: { latitude: 51.5, longitude: -(8 / 60) },
  offsetOverrideMinutes: 0,
};

describe('PrimaryDirectionKey.TRUE_SOLAR_ARC in the domain (#1795, task 5)', () => {
  it('names the key with the true-solar-arc time-key value', () => {
    expect(PrimaryDirectionKey.TRUE_SOLAR_ARC).toBe('true-solar-arc');
  });

  it('stores the clock on the data for the new key', async () => {
    const engine = await getEngine();
    const data = await generatePrimaryDirections(PRINCE_CHARLES, engine, PrimaryDirectionKey.TRUE_SOLAR_ARC);
    expect(data.key).toBe('true-solar-arc');
    expect(data.clock).toBeDefined();
  });

  it('leaves Naibod and Ptolemy without a clock (their outputs do not depend on one)', async () => {
    const engine = await getEngine();
    const naibod = await generatePrimaryDirections(PRINCE_CHARLES, engine, PrimaryDirectionKey.NAIBOD);
    const ptolemy = await generatePrimaryDirections(PRINCE_CHARLES, engine, PrimaryDirectionKey.PTOLEMY);
    expect(naibod.clock).toBeUndefined();
    expect(ptolemy.clock).toBeUndefined();
  });

  it('ages increase with arc, and each hit age is the clock’s days for its arc', async () => {
    const engine = await getEngine();
    const data = await generatePrimaryDirections(PRINCE_CHARLES, engine, PrimaryDirectionKey.TRUE_SOLAR_ARC);
    const clock = data.clock;
    if (clock === undefined) throw new Error('the true-solar-arc data carries its clock');
    expect(data.hits.length).toBeGreaterThan(0);
    let previousAge = 0;
    for (const hit of data.hits) {
      expect(hit.ageYears).toBeGreaterThanOrEqual(previousAge);
      expect(hit.ageYears).toBeCloseTo(clock.daysForArc(hit.arcRA), 9);
      expect(hit.exactJd).toBeCloseTo(data.natalJd + hit.ageYears * TROPICAL_YEAR_DAYS, 6);
      previousAge = hit.ageYears;
    }
  });

  it('produces no hit for an arc beyond the clock’s sampled span, and does not throw (e.g. 152.3°)', async () => {
    const engine = await getEngine();
    const data = await generatePrimaryDirections(PRINCE_CHARLES, engine, PrimaryDirectionKey.TRUE_SOLAR_ARC);
    const clock = data.clock;
    if (clock === undefined) throw new Error('the true-solar-arc data carries its clock');
    // The sampled span ends at arcAfterDays(SOLAR_ARC_CLOCK_MAX_DAYS), about 115.2° for this birth. An arc of
    // 152.3° (the RangeError message in the failing run) lies beyond it, so no hit may carry such an arc.
    const spanEnd = clock.arcAfterDays(SOLAR_ARC_CLOCK_MAX_DAYS);
    expect(152.3).toBeGreaterThan(spanEnd);
    for (const hit of data.hits) {
      expect(hit.arcRA).toBeLessThanOrEqual(spanEnd);
      expect(Number.isFinite(hit.ageYears)).toBe(true);
    }
  });

  it('keeps each hit active at its own age when its arc is at least the orb', async () => {
    const engine = await getEngine();
    const data = await generatePrimaryDirections(PRINCE_CHARLES, engine, PrimaryDirectionKey.TRUE_SOLAR_ARC);
    // A hit whose arc is below its orb has its window edge mirrored to a positive age (owner decision,
    // #1603), so only hits with arcRA >= orb keep the window around their own age.
    const inside = data.hits.filter((hit) => hit.arcRA >= DEFAULT_PRIMARY_DIRECTION_ORB);
    expect(inside.length).toBeGreaterThan(0);
    for (const hit of inside) {
      expect(hit.activeFromAge).toBeLessThanOrEqual(hit.ageYears);
      expect(hit.ageYears).toBeLessThanOrEqual(hit.activeUntilAge);
      expect(isDirectionActive(hit, hit.ageYears)).toBe(true);
    }
  });

  it('converts age to arc and back through the clock, and the window edges use it', async () => {
    const engine = await getEngine();
    const data = await generatePrimaryDirections(PRINCE_CHARLES, engine, PrimaryDirectionKey.TRUE_SOLAR_ARC);
    const clock = data.clock;
    if (clock === undefined) throw new Error('the true-solar-arc data carries its clock');
    const arc = ageToArc(30, PrimaryDirectionKey.TRUE_SOLAR_ARC, clock);
    expect(arcToYears(arc, PrimaryDirectionKey.TRUE_SOLAR_ARC, clock)).toBeCloseTo(30, 6);
    expect(arcToAge(arc, PrimaryDirectionKey.TRUE_SOLAR_ARC, clock)).toBeCloseTo(30, 6);
    const hit = data.hits.find((candidate) => candidate.arcRA >= DEFAULT_PRIMARY_DIRECTION_ORB);
    if (hit === undefined) throw new Error('no hit with an arc above the orb');
    expect(hit.activeUntilAge).toBeCloseTo(arcToAge(hit.arcRA + hit.orb, PrimaryDirectionKey.TRUE_SOLAR_ARC, clock), 9);
    expect(activeDirections(data.hits, hit.ageYears)).toContain(hit);
  });

  it('draws the directed chart for the new key, so each direction perfects at its own age', async () => {
    const engine = await getEngine();
    const data = await generatePrimaryDirections(PRINCE_CHARLES, engine, PrimaryDirectionKey.TRUE_SOLAR_ARC);
    const hit = data.hits.find((candidate) => candidate.significator === 'mc' && candidate.arcRA >= 1);
    if (hit === undefined) throw new Error('no MC direction');
    const chart = await directedChartAt(data, hit.ageYears, engine);
    expect(arcsecondsBetween(chart.arc, hit.arcRA)).toBeLessThan(1e-6);
    expect(arcsecondsBetween(chart.houses.midheaven, hit.promissorPoint)).toBeLessThan(1);
  });

  it('keeps Naibod’s arc-to-age conversion unchanged, with or without a clock (#1795)', async () => {
    const engine = await getEngine();
    const clock = await createSolarArcClock(engine, await engine.julianDayFromUtc(1948, 11, 14, 21, 14, 39));
    expect(arcToYears(16.1, PrimaryDirectionKey.NAIBOD, clock)).toBeCloseTo(
      16.1 / TIME_KEY_DEGREES_PER_YEAR.naibod,
      12,
    );
    expect(arcToYears(16.1, PrimaryDirectionKey.NAIBOD)).toBeCloseTo(16.1 / TIME_KEY_DEGREES_PER_YEAR.naibod, 12);
  });
});
