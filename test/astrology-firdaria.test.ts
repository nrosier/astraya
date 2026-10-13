/**
 * Reference fixtures for firdaria (#554), following al-Qabisi, *Introduction to Traditional
 * Astrology*, VII.3: the day sequence begins at Sun and the night sequence at Moon.
 */
import { describe, expect, it } from 'vitest';
import {
  FIRDARIA_CYCLE_YEARS,
  FIRDARIA_DAY_ORDER,
  FIRDARIA_NIGHT_ORDER,
  FIRDARIA_YEARS,
  firdariaPeriodAt,
  firdariaPeriods,
} from '../src/astrology/firdaria.js';

const TROPICAL_YEAR_DAYS = 365.2425;

describe('FIRDARIA tables (#554)', () => {
  it('day order starts at the Sun, night order at the Moon, both the same 7-planet cycle plus nodes', () => {
    expect(FIRDARIA_DAY_ORDER[0]).toBe('sun');
    expect(FIRDARIA_NIGHT_ORDER[0]).toBe('moon');
    expect(FIRDARIA_DAY_ORDER.slice(0, 7).sort()).toEqual(FIRDARIA_NIGHT_ORDER.slice(0, 7).sort());
    expect(FIRDARIA_DAY_ORDER.slice(7)).toEqual(FIRDARIA_NIGHT_ORDER.slice(7)); // nodes last, same order
  });

  it('cycle total is the oft-cited 75 years', () => {
    expect(FIRDARIA_CYCLE_YEARS).toBe(75);
    expect(Object.keys(FIRDARIA_YEARS)).toHaveLength(9);
  });
});

describe('firdariaPeriods (#554)', () => {
  it('day chart: Sun 10y then Venus 8y, back to back', () => {
    const periods = firdariaPeriods('day', 0, 2);
    expect(periods[0]?.ruler).toBe('sun');
    expect(periods[0]?.years).toBe(10);
    expect(periods[0]?.startJd).toBe(0);
    expect(periods[0]?.endJd).toBeCloseTo(10 * TROPICAL_YEAR_DAYS, 6);
    expect(periods[1]?.ruler).toBe('venus');
    expect(periods[1]?.startJd).toBe(periods[0]?.endJd);
  });

  it('night chart: Moon 9y then Saturn 11y', () => {
    const periods = firdariaPeriods('night', 0, 2);
    expect(periods[0]?.ruler).toBe('moon');
    expect(periods[0]?.years).toBe(9);
    expect(periods[1]?.ruler).toBe('saturn');
  });

  it('loops into a second cycle after all 9 rulers', () => {
    const periods = firdariaPeriods('day', 0, 10);
    expect(periods[8]?.ruler).toBe('southNode');
    expect(periods[8]?.cycle).toBe(0);
    expect(periods[9]?.ruler).toBe('sun');
    expect(periods[9]?.cycle).toBe(1);
  });
});

describe('firdariaPeriodAt (#554)', () => {
  it('finds the period covering a given moment', () => {
    const found = firdariaPeriodAt('day', 0, 12 * TROPICAL_YEAR_DAYS); // past Sun's 10y, into Venus's 8y
    expect(found?.ruler).toBe('venus');
  });

  it('is undefined before the starting Julian day', () => {
    expect(firdariaPeriodAt('day', 100, 0)).toBeUndefined();
  });
});
