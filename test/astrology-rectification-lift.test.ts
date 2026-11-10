/**
 * Lift over the window average and event-subset re-scoring for rectification candidates (#1445). Pure: no ephemeris.
 */
import { describe, expect, it } from 'vitest';
import { CHANCE_LIFT, isSpike, liftOf, rescoreForEvents, windowAverage } from '../src/astrology/rectification-lift.js';

describe('windowAverage', () => {
  it('is the mean score across all candidates', () => {
    expect(windowAverage([2, 4, 6])).toBe(4);
    expect(windowAverage([0, 0, 3])).toBe(1);
  });

  it('is 0 for an empty window', () => {
    expect(windowAverage([])).toBe(0);
  });
});

describe('liftOf', () => {
  it('is candidate score over the window average', () => {
    expect(liftOf(6, 4)).toBe(1.5);
    expect(liftOf(2, 4)).toBe(0.5);
  });

  it('is exactly 1.0 for a candidate scoring the average', () => {
    expect(liftOf(4, 4)).toBe(CHANCE_LIFT);
  });

  it('is 0, not NaN or Infinity, when the window average is 0', () => {
    expect(liftOf(0, 0)).toBe(0);
    expect(liftOf(3, windowAverage([]))).toBe(0);
  });
});

describe('isSpike', () => {
  it('highlights only a lift strictly above 1.0', () => {
    expect(isSpike(1.01)).toBe(true);
    expect(isSpike(2)).toBe(true);
  });

  it('does not highlight a lift at 1.0 or below ("explains the events no better than chance")', () => {
    expect(isSpike(1)).toBe(false);
    expect(isSpike(0.99)).toBe(false);
    expect(isSpike(0)).toBe(false);
  });
});

describe('rescoreForEvents', () => {
  const candidate = (jd: number, eventIndexes: readonly number[]) => ({
    jd,
    score: 99,
    lift: 99,
    contacts: eventIndexes.map((eventIndex) => ({ eventIndex })),
  });
  const candidates = [candidate(1, [0, 0, 1]), candidate(2, [1, 1, 1]), candidate(3, [0])];

  it('counts one point per contact of the included events only, and ranks best first', () => {
    const all = rescoreForEvents(candidates, new Set([0, 1]));
    expect(all.map((c) => [c.jd, c.score])).toEqual([
      [1, 3],
      [2, 3],
      [3, 1],
    ]);
    const onlyFirst = rescoreForEvents(candidates, new Set([0]));
    expect(onlyFirst.map((c) => [c.jd, c.score])).toEqual([
      [1, 2],
      [3, 1],
      [2, 0],
    ]);
  });

  it('changes the lift with the included set, over the re-scored window average', () => {
    const onlySecond = rescoreForEvents(candidates, new Set([1]));
    expect(onlySecond[0]?.jd).toBe(2);
    expect(onlySecond[0]?.lift).toBeCloseTo(3 / (4 / 3), 9);
    expect(isSpike(onlySecond[0]?.lift ?? 0)).toBe(true);
  });

  it('gives lift 0 to every candidate when no event is included', () => {
    const none = rescoreForEvents(candidates, new Set());
    expect(none.every((c) => c.score === 0 && c.lift === 0)).toBe(true);
  });

  it('handles an empty window', () => {
    expect(rescoreForEvents([], new Set([0]))).toEqual([]);
  });
});
