/**
 * #1400: the pure arithmetic behind the date and animation bar (rates, throttle, date stepping, slider span) and
 * the `?date=` round trip through the hash.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_TICKS_PER_SECOND,
  PLAYBACK_SPEEDS,
  advanceDate,
  dayNumber,
  isoFromDayNumber,
  playbackPlan,
  sliderSpan,
  stepsPerSecond,
} from '../src/ui/date-animation.ts';
import { hashDate, hashWithDate, parseRoute, routeHref } from '../src/ui/route.ts';

describe('speed (owner spec: speed multiplies the active interval)', () => {
  it('maps each option to its steps per second', () => {
    expect(PLAYBACK_SPEEDS.map(stepsPerSecond)).toEqual([0.5, 1, 2, 5, 10, 30]);
  });

  it('0.5x is one step every 2 seconds, 1x one per second', () => {
    expect(playbackPlan(0.5)).toEqual({ tickMs: 2000, stepsPerTick: 1 });
    expect(playbackPlan(1)).toEqual({ tickMs: 1000, stepsPerTick: 1 });
  });

  it('30x is thirty steps per second, one step per tick, under the 60-tick clamp', () => {
    const plan = playbackPlan(30);
    expect(plan.stepsPerTick).toBe(1);
    expect(1000 / plan.tickMs).toBeCloseTo(30, 9);
  });

  it('never redraws more than 60 times per second, folding the rest into steps per tick', () => {
    const plan = playbackPlan(120);
    expect(1000 / plan.tickMs).toBeCloseTo(MAX_TICKS_PER_SECOND, 9);
    expect(plan.stepsPerTick).toBe(2);
    for (const speed of PLAYBACK_SPEEDS) expect(1000 / playbackPlan(speed).tickMs).toBeLessThanOrEqual(60 + 1e-9);
  });
});

describe('advanceDate', () => {
  it('steps days across month and year ends', () => {
    expect(advanceDate('2026-11-10', 'day', 1)).toBe('2026-11-11');
    expect(advanceDate('2026-12-31', 'day', 1)).toBe('2027-01-01');
    expect(advanceDate('2027-01-01', 'day', -1)).toBe('2026-12-31');
    expect(advanceDate('2028-02-28', 'day', 1)).toBe('2028-02-29');
  });

  it('steps months, clamping to the shorter month', () => {
    expect(advanceDate('2026-11-10', 'month', 1)).toBe('2026-12-10');
    expect(advanceDate('2026-12-10', 'month', 1)).toBe('2027-01-10');
    expect(advanceDate('2026-01-31', 'month', 1)).toBe('2026-02-28');
    expect(advanceDate('2028-01-31', 'month', 1)).toBe('2028-02-29');
    expect(advanceDate('2026-03-31', 'month', -1)).toBe('2026-02-28');
  });

  it('steps years, moving 29 February to 28 February in a common year', () => {
    expect(advanceDate('2026-11-10', 'year', 1)).toBe('2027-11-10');
    expect(advanceDate('2028-02-29', 'year', 1)).toBe('2029-02-28');
    expect(advanceDate('2028-02-29', 'year', -4)).toBe('2024-02-29');
  });

  it('leaves an unreadable date or an out-of-range result unchanged', () => {
    expect(advanceDate('', 'day', 1)).toBe('');
    expect(advanceDate('2026-02-30', 'day', 1)).toBe('2026-02-30');
    expect(advanceDate('9999-12-31', 'day', 1)).toBe('9999-12-31');
    expect(advanceDate('0001-01-01', 'year', -1)).toBe('0001-01-01');
  });
});

describe('slider day numbers', () => {
  it('round-trips a date', () => {
    const days = dayNumber('2026-11-10');
    expect(days).toBeDefined();
    expect(isoFromDayNumber(days ?? 0)).toBe('2026-11-10');
    expect(dayNumber('2026-02-30')).toBeUndefined();
  });

  it('spans 1 January five years before to 31 December five years after', () => {
    const span = sliderSpan(2026);
    expect(isoFromDayNumber(span.min)).toBe('2021-01-01');
    expect(isoFromDayNumber(span.max)).toBe('2031-12-31');
  });
});

describe('?date= in the URL', () => {
  const base = routeHref({ kind: 'transit', personId: '0123456789abcdef0123456789abcdef' });

  it('writes the date on the current route and reads it back', () => {
    const hash = hashWithDate(base, '2027-03-04');
    expect(hash).toBe(`${base}?date=2027-03-04`);
    expect(hashDate(hash)).toBe('2027-03-04');
  });

  it('replaces an earlier date and keeps other query values', () => {
    expect(hashWithDate(`${base}?view=x&date=2020-01-01`, '2021-02-03')).toBe(`${base}?view=x&date=2021-02-03`);
  });

  it('ignores a missing, malformed or impossible date', () => {
    expect(hashDate(base)).toBeUndefined();
    expect(hashDate(`${base}?date=tomorrow`)).toBeUndefined();
    expect(hashDate(`${base}?date=2026-02-30`)).toBeUndefined();
  });

  it('leaves the route itself unchanged (the screen still parses as Transits)', () => {
    expect(parseRoute(hashWithDate(base, '2027-03-04'))).toEqual(parseRoute(base));
  });
});
