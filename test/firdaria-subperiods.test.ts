/**
 * Firdaria sub-periods (#1796): each planet period splits into seven equal parts, in the
 * order of the circles from the Sun (Bonatti, Tr. 9, ch. 3, p. 1387). Pure math, no ephemeris.
 */
import { describe, expect, it } from 'vitest';
import { TROPICAL_YEAR_DAYS } from '../src/astrology/progressions.js';
import {
  FIRDARIA_SUB_ORDER,
  FIRDARIA_YEARS,
  firdariaPeriods,
  firdariaSubPeriodAt,
  firdariaSubPeriods,
} from '../src/astrology/firdaria.js';
import type { FirdariaPeriod } from '../src/astrology/firdaria.js';
import type { JulianDayUT } from '../src/ephemeris/types.js';

const FROM_JD = 2451545.0 as JulianDayUT;

describe('firdariaSubPeriods (#1796)', () => {
  it('a Sun period has seven sub-periods in the Bonatti order, each 10/7 years long', () => {
    const sunPeriod = firdariaPeriods('day', FROM_JD, 1)[0];
    expect(sunPeriod).toBeDefined();
    if (sunPeriod === undefined) return;
    const subs = firdariaSubPeriods(sunPeriod);
    expect(subs.map((sub) => sub.ruler)).toEqual(['sun', 'venus', 'mercury', 'moon', 'saturn', 'jupiter', 'mars']);
    for (const sub of subs) {
      expect(sub.endJd - sub.startJd).toBeCloseTo((10 / 7) * TROPICAL_YEAR_DAYS, 6);
    }
  });

  it('a Mercury period starts with Mercury and then the Moon, running cyclically', () => {
    const mercuryPeriod: FirdariaPeriod = {
      ruler: 'mercury',
      years: FIRDARIA_YEARS.mercury,
      startJd: FROM_JD,
      endJd: FROM_JD + FIRDARIA_YEARS.mercury * TROPICAL_YEAR_DAYS,
      cycle: 0,
    };
    const subs = firdariaSubPeriods(mercuryPeriod);
    expect(subs.map((sub) => sub.ruler)).toEqual(['mercury', 'moon', 'saturn', 'jupiter', 'mars', 'sun', 'venus']);
    expect(FIRDARIA_SUB_ORDER).toHaveLength(7);
  });

  it('the North Node and South Node periods give no sub-periods', () => {
    const periods = firdariaPeriods('day', FROM_JD, 9);
    const northNode = periods.find((period) => period.ruler === 'northNode');
    const southNode = periods.find((period) => period.ruler === 'southNode');
    expect(northNode).toBeDefined();
    expect(southNode).toBeDefined();
    if (northNode !== undefined) expect(firdariaSubPeriods(northNode)).toEqual([]);
    if (southNode !== undefined) expect(firdariaSubPeriods(southNode)).toEqual([]);
  });

  it('the parts are contiguous, and the last endJd equals the period endJd exactly', () => {
    for (const sect of ['day', 'night'] as const) {
      for (const period of firdariaPeriods(sect, FROM_JD, 9)) {
        const subs = firdariaSubPeriods(period);
        if (subs.length === 0) continue;
        expect(subs[0]?.startJd).toBe(period.startJd);
        for (let i = 1; i < subs.length; i++) {
          expect(subs[i]?.startJd).toBe(subs[i - 1]?.endJd);
        }
        expect(subs[subs.length - 1]?.endJd).toBe(period.endJd);
      }
    }
  });

  it('firdariaSubPeriodAt returns the later part at a sub-boundary, and undefined in a node period', () => {
    const sunPeriod = firdariaPeriods('day', FROM_JD, 1)[0];
    expect(sunPeriod).toBeDefined();
    if (sunPeriod === undefined) return;
    const subs = firdariaSubPeriods(sunPeriod);
    const boundary = subs[1]?.startJd;
    expect(boundary).toBeDefined();
    if (boundary === undefined) return;
    expect(firdariaSubPeriodAt('day', FROM_JD, boundary)?.ruler).toBe('venus');

    // The North Node runs from year 70 to 73 in both the day and the night cycle.
    const nodeJd = FROM_JD + 71 * TROPICAL_YEAR_DAYS;
    expect(firdariaSubPeriodAt('day', FROM_JD, nodeJd)).toBeUndefined();
    expect(firdariaSubPeriodAt('night', FROM_JD, nodeJd)).toBeUndefined();
  });
});
