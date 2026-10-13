/**
 * Pure unit tests for `finiteDifferenceRate` (#546) — no ephemeris access needed, since the
 * function is plain arithmetic over two longitudes and a time step.
 */
import { describe, expect, it } from 'vitest';
import { FINITE_DIFFERENCE_DT_DAYS, finiteDifferenceRate } from '../src/ephemeris/finite-difference.js';

describe('finiteDifferenceRate (#546)', () => {
  it('gives a plain forward rate when nothing wraps', () => {
    expect(finiteDifferenceRate(10, 11, 1)).toBeCloseTo(1, 10);
    expect(finiteDifferenceRate(100, 90, 1)).toBeCloseTo(-10, 10);
  });

  it('divides by the step, not just the raw delta', () => {
    // 1° in a tenth of a day is 10°/day.
    expect(finiteDifferenceRate(0, 1, 0.1)).toBeCloseTo(10, 10);
  });

  it('unwraps a sample that crosses the 360°/0° seam going forward', () => {
    // 359° to 1° is a 2° forward step, not a 358° backward one.
    expect(finiteDifferenceRate(359, 1, 1)).toBeCloseTo(2, 10);
  });

  it('unwraps a sample that crosses the seam going backward', () => {
    // 1° to 359° is a 2° backward step, not a 358° forward one.
    expect(finiteDifferenceRate(1, 359, 1)).toBeCloseTo(-2, 10);
  });

  it('is zero for a stationary point', () => {
    expect(finiteDifferenceRate(42, 42, 1)).toBe(0);
  });

  it('reports a point sweeping about 361°/day — roughly the Ascendant/Midheaven rate — correctly across the seam', () => {
    // One sidereal day's worth of sweep from 350° lands just past the seam.
    const dtDays = FINITE_DIFFERENCE_DT_DAYS;
    const sweepPerDay = 360.9856;
    const before = 350;
    const after = (before + sweepPerDay * dtDays) % 360;
    expect(finiteDifferenceRate(before, after, dtDays)).toBeCloseTo(sweepPerDay, 6);
  });
});
