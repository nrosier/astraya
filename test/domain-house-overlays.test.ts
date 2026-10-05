/**
 * `houseOverlays` (#422), against the real Swiss Ephemeris engine — same convention every
 * other cross-chart domain test here follows.
 */
import { describe, expect, it } from 'vitest';
import { computeSynastry } from '../src/domain/synastry.js';
import { houseOverlays } from '../src/domain/house-overlays.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON_A: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

const PERSON_B: BirthMomentInput = {
  civil: { year: 1988, month: 11, day: 2, hour: 3, minute: 15, second: 0 },
  coordinates: { latitude: 51.5072, longitude: -0.1276 },
  offsetOverrideMinutes: 0,
};

describe('houseOverlays (#422)', () => {
  it('places every real body of each chart into a house of the other chart, both directions', async () => {
    const engine = await getEngine();
    const data = await computeSynastry(PERSON_A, PERSON_B, engine);
    const overlays = houseOverlays(data);

    const aInB = overlays.filter((o) => o.direction === 'a-in-b');
    const bInA = overlays.filter((o) => o.direction === 'b-in-a');
    expect(aInB).toHaveLength(data.chartA.positions.length);
    expect(bInA).toHaveLength(data.chartB.positions.length);
    for (const overlay of overlays) {
      expect(overlay.house).toBeGreaterThanOrEqual(1);
      expect(overlay.house).toBeLessThanOrEqual(12);
    }
  });

  it('omits only the direction whose destination houses have no solution', async () => {
    const engine = await getEngine();
    const data = await computeSynastry(PERSON_A, PERSON_B, engine);
    const noHouses = { ...data.chartB.houses, ascendant: Number.NaN, midheaven: Number.NaN };
    const withoutBHouses = { ...data, chartB: { ...data.chartB, houses: noHouses } };
    const overlays = houseOverlays(withoutBHouses);
    // A's bodies can no longer be placed into B's (now undefined) houses...
    expect(overlays.some((o) => o.direction === 'a-in-b')).toBe(false);
    // ...but B's bodies into A's (still solved) houses are unaffected.
    expect(overlays.filter((o) => o.direction === 'b-in-a')).toHaveLength(data.chartB.positions.length);
  });
});
