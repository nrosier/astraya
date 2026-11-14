/**
 * #1440: the playback tick-rate mapping for every speed the date animation bar offers (0.5x to 30x).
 * Expected values are read from `playbackPlan` in `src/ui/date-animation.ts`: each speed is steps per second,
 * ticks run at `min(speed, MAX_TICKS_PER_SECOND)` per second, so below the 60 clamp every speed is one step per tick.
 */
import { describe, expect, it } from 'vitest';
import { PLAYBACK_SPEEDS, playbackPlan, stepsPerSecond } from '../src/ui/date-animation.ts';

describe('playback tick rate for each offered speed (#1440)', () => {
  it('offers exactly the speeds 0.5x, 1x, 2x, 5x, 10x and 30x', () => {
    expect([...PLAYBACK_SPEEDS]).toEqual([0.5, 1, 2, 5, 10, 30]);
  });

  const expected: readonly (readonly [speed: number, tickMs: number])[] = [
    [0.5, 2000],
    [1, 1000],
    [2, 500],
    [5, 200],
    [10, 100],
    [30, 1000 / 30],
  ];

  it.each(expected)('%sx ticks every %s ms with one step per tick', (speed, tickMs) => {
    const plan = playbackPlan(speed);
    expect(plan.tickMs).toBeCloseTo(tickMs, 9);
    expect(plan.stepsPerTick).toBe(1);
    expect(stepsPerSecond(speed)).toBe(speed);
  });

  it('is monotonic: a faster speed never has a slower step rate or a longer tick', () => {
    const plans = PLAYBACK_SPEEDS.map((speed) => ({ speed, ...playbackPlan(speed) }));
    for (let i = 1; i < plans.length; i += 1) {
      const prev = plans[i - 1];
      const cur = plans[i];
      if (prev === undefined || cur === undefined) throw new Error('unreachable: index in range');
      expect(cur.speed).toBeGreaterThan(prev.speed);
      expect(stepsPerSecond(cur.speed)).toBeGreaterThan(stepsPerSecond(prev.speed));
      expect(cur.tickMs).toBeLessThan(prev.tickMs);
    }
  });
});
