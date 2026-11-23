/**
 * The lunar phase return (#1407), Solar Fire Deluxe guide §12.10 (PDF pp. 92-94): the moment the Sun-Moon phase angle
 * returns to its natal value, before (Current), nearest to or after (Next) a search date. Real engine.
 */
import { describe, expect, it } from 'vitest';
import { findLunations } from '../src/astrology/lunations.js';
import { computeLunarPhaseReturnChart, findLunarPhaseReturns } from '../src/domain/lunar-phase-return.js';
import type { JulianDayUT } from '../src/ephemeris/types.js';
import { civilFromJulianDay, julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { arcsecondsBetween, getEngine } from './engine-harness.js';

const PERSON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

function phaseOf(chart: { positions: readonly { body: number; longitude: number }[] }): number {
  const sun = chart.positions.find((position) => position.body === 0)?.longitude ?? Number.NaN;
  const moon = chart.positions.find((position) => position.body === 1)?.longitude ?? Number.NaN;
  return (((moon - sun) % 360) + 360) % 360;
}

describe('computeLunarPhaseReturnChart (#1407)', () => {
  it('finds an instant whose phase angle matches the natal one within 1 arcsecond', async () => {
    const engine = await getEngine();
    const search: JulianDayUT = 2_460_310.5; // 2024-01-01
    const data = await computeLunarPhaseReturnChart(PERSON, search, engine);
    expect(data.returnJd).toBeGreaterThanOrEqual(search);
    expect(data.returnJd - search).toBeLessThan(30);
    expect(Math.abs(arcsecondsBetween(phaseOf(data.chart), data.natalPhaseAngle))).toBeLessThan(1);
    expect(data.place).toEqual({ ...PERSON.coordinates, altitude: 0 });
  });

  it('Current is before the date, Next on or after it, and Nearest is the closer of the two', async () => {
    const engine = await getEngine();
    const search: JulianDayUT = 2_460_310.5;
    const current = await computeLunarPhaseReturnChart(PERSON, search, engine, { which: 'current' });
    const next = await computeLunarPhaseReturnChart(PERSON, search, engine, { which: 'next' });
    const nearest = await computeLunarPhaseReturnChart(PERSON, search, engine, { which: 'nearest' });
    expect(current.returnJd).toBeLessThan(search);
    expect(next.returnJd).toBeGreaterThanOrEqual(search);
    // About one synodic month apart (29.5 days on average; this pair is 29.91 days apart).
    expect(next.returnJd - current.returnJd).toBeGreaterThan(29);
    expect(next.returnJd - current.returnJd).toBeLessThan(30.5);
    const closer = next.returnJd - search <= search - current.returnJd ? next.returnJd : current.returnJd;
    expect(nearest.returnJd).toBe(closer);
  });

  it('for a birth at a New Moon, returns at the next New Moon', async () => {
    const engine = await getEngine();
    const [newMoon] = (await findLunations(2_447_892.5, 2_447_925.5, engine)).filter((event) => event.kind === 'new');
    expect(newMoon).toBeDefined();
    if (newMoon === undefined) return;
    const born: BirthMomentInput = {
      civil: civilFromJulianDay(newMoon.jd),
      coordinates: PERSON.coordinates,
      offsetOverrideMinutes: 0,
    };
    const bornJd = await julianDayFor(engine, resolveMoment(born));
    const [following] = (await findLunations(bornJd + 1, bornJd + 32, engine)).filter((event) => event.kind === 'new');
    const data = await computeLunarPhaseReturnChart(born, bornJd + 1, engine);
    expect(following).toBeDefined();
    // The birth is rounded to the second, so the natal phase angle is within about 0.5" of 0: a few seconds of time.
    expect(Math.abs(data.returnJd - (following?.jd ?? Number.NaN)) * 86_400).toBeLessThan(60);
  });

  it('lists N returns from the most recent one before the date, Solar Fire’s list (§12.10)', async () => {
    const engine = await getEngine();
    const search: JulianDayUT = 2_460_310.5;
    const list = await findLunarPhaseReturns(PERSON, search, 3, engine);
    const current = await computeLunarPhaseReturnChart(PERSON, search, engine, { which: 'current' });
    expect(list.returns).toHaveLength(3);
    expect(list.returns[0]).toBe(current.returnJd);
    expect(search - (list.returns[0] ?? Number.NaN)).toBeGreaterThan(0);
    expect(search - (list.returns[0] ?? Number.NaN)).toBeLessThan(30.5);
    for (let index = 1; index < list.returns.length; index += 1) {
      const gap = (list.returns[index] ?? Number.NaN) - (list.returns[index - 1] ?? Number.NaN);
      expect(gap).toBeGreaterThan(29);
      expect(gap).toBeLessThan(30.5);
    }
    await expect(findLunarPhaseReturns(PERSON, search, 0, engine)).rejects.toThrow(/positive integer/);
  });

  it('searched from the birth itself, never returns the birth: Current is pre-natal, Next post-natal', async () => {
    const engine = await getEngine();
    const bornJd = await julianDayFor(engine, resolveMoment(PERSON));
    const next = await computeLunarPhaseReturnChart(PERSON, bornJd, engine, { which: 'next' });
    const current = await computeLunarPhaseReturnChart(PERSON, bornJd, engine, { which: 'current' });
    expect(next.returnJd - bornJd).toBeGreaterThan(29);
    expect(bornJd - current.returnJd).toBeGreaterThan(29);
  });

  it('finds the same instant in a sidereal zodiac, since the ayanamsa cancels out of the phase angle', async () => {
    const engine = await getEngine();
    const search: JulianDayUT = 2_460_310.5;
    const tropical = await computeLunarPhaseReturnChart(PERSON, search, engine);
    const sidereal = await computeLunarPhaseReturnChart(PERSON, search, engine, {
      zodiac: { kind: 'sidereal', ayanamsa: 1 },
    });
    expect(Math.abs(sidereal.returnJd - tropical.returnJd) * 86_400).toBeLessThan(2);
    expect(sidereal.natalPhaseAngle).toBeCloseTo(tropical.natalPhaseAngle, 6);
  });

  it('casts the return at a given place instead of the birthplace', async () => {
    const engine = await getEngine();
    const search: JulianDayUT = 2_460_310.5;
    const paris = { latitude: 48.85, longitude: 2.35, altitude: 0 };
    const home = await computeLunarPhaseReturnChart(PERSON, search, engine);
    const away = await computeLunarPhaseReturnChart(PERSON, search, engine, { place: paris });
    expect(away.place).toEqual(paris);
    expect(away.returnJd).toBe(home.returnJd);
    expect(Math.abs(away.chart.houses.ascendant - home.chart.houses.ascendant)).toBeGreaterThan(1);
  });
});
