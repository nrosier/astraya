/** The year a consultation reads (#669), against the real ephemeris. */
import { describe, expect, it } from 'vitest';
import { FIRDARIA_SUB_ORDER, FIRDARIA_YEARS } from '../src/astrology/firdaria.js';
import { LUNAR_PHASES } from '../src/astrology/lunar-phase.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { consultationYear } from '../src/domain/consultation-year.js';
import { computeProfections } from '../src/domain/profections.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

describe('consultationYear (#669)', () => {
  it('gathers the profected year and lord, firdaria, progressed Moon and the solar returns around now', async () => {
    const engine = await getEngine();
    const natal = await computeChartData(NATAL, engine, { rulership: 'traditional' });
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const nowJd = natalJd + 36.4 * 365.2425;
    const year = await consultationYear(NATAL, natal, natalJd, nowJd, engine, 'traditional');

    const profections = await computeProfections(NATAL, nowJd, engine, { rulership: 'traditional' });
    expect(year.profection?.sign).toBe(profections.year.signIndex);
    expect(year.profection?.house).toBe(profections.year.house);
    expect(year.profection?.lords).toHaveLength(1);
    expect(year.firdaria?.endJd).toBeGreaterThan(nowJd);
    // The sub-period is a planet inside the firdaria period, so it ends no later than that period.
    expect(FIRDARIA_SUB_ORDER).toContain(year.firdariaSub?.ruler);
    expect(year.firdariaSub?.endJd).toBeGreaterThan(nowJd);
    expect(year.firdariaSub?.endJd).toBeLessThanOrEqual(year.firdaria?.endJd ?? Number.NEGATIVE_INFINITY);
    expect(LUNAR_PHASES).toContain(year.progressedMoon.phase);
    expect(year.progressedMoon.house).toBeGreaterThanOrEqual(1);
    // The current return is the latest one before now, the next one within a year after it.
    expect(year.solarReturns.current).toBeLessThanOrEqual(nowJd);
    expect(year.solarReturns.next).toBeGreaterThan(nowJd);
    expect(year.solarReturns.next - year.solarReturns.current).toBeCloseTo(365.25, 0);
  }, 60_000);

  it('leaves the sub-period out in a node period, where the firdaria period is still set', async () => {
    const engine = await getEngine();
    const natal = await computeChartData(NATAL, engine, { rulership: 'traditional' });
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    // The seven planet periods of a cycle add up to 70 years; the node period comes straight after them.
    const planetYears = FIRDARIA_SUB_ORDER.reduce((sum, planet) => sum + FIRDARIA_YEARS[planet], 0);
    const nowJd = natalJd + planetYears * 365.2425 + 1;
    for (const sect of ['day', 'night'] as const) {
      const year = await consultationYear(NATAL, { ...natal, sect }, natalJd, nowJd, engine, 'traditional');
      expect(year.firdaria).toBeDefined();
      expect(year.firdariaSub).toBeUndefined();
    }
  }, 60_000);

  it('leaves the Ascendant-based facts out without a known birth time', async () => {
    const engine = await getEngine();
    const natal = await computeChartData(NATAL, engine);
    const untimed = { ...natal, houses: { ...natal.houses, ascendant: Number.NaN } };
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const year = await consultationYear(NATAL, untimed, natalJd, natalJd + 20 * 365.2425, engine, 'modern');
    expect(year.profection).toBeUndefined();
    expect(year.progressedMoon.house).toBeUndefined();
  }, 60_000);
});
