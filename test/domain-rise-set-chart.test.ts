/**
 * The rise and set chart (#1407, Step 8): `computeRiseSetChart` casts the chart at the first rise, set, culmination or
 * anti-culmination after a birth moment, at the birthplace (Solar Fire Deluxe guide §12.9, PDF p. 92). Real engine; the
 * event moment is the engine's own `riseTransit` (Step 7).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { computeRiseSetChart } from '../src/domain/rise-set-chart.js';
import type { SwissEphemerisEngine } from '../src/ephemeris/engine.js';
import type { BodyId, GeoPosition } from '../src/ephemeris/types.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

function idOf(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`unknown body ${key}`);
  return body.id;
}

const SUN = idOf('sun');

/** Amsterdam, 1 January 2024, 00:00 local: the Sun rises that morning (mid latitude). */
const AMSTERDAM_NEW_YEAR: BirthMomentInput = {
  civil: { year: 2024, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
  coordinates: { latitude: 52.37, longitude: 4.9 },
  offsetOverrideMinutes: 60,
};

/** Tromsø, 21 June 2024, 00:00 local: the Sun does not set that day (polar day). */
const TROMSO_MIDSUMMER: BirthMomentInput = {
  civil: { year: 2024, month: 6, day: 21, hour: 0, minute: 0, second: 0 },
  coordinates: { latitude: 69.65, longitude: 18.96 },
  offsetOverrideMinutes: 120,
};

/** The shorter angular distance between two longitudes, in degrees (0-180). */
function circularGap(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
}

let engine: SwissEphemerisEngine;

beforeAll(async () => {
  engine = await getEngine();
});

describe('computeRiseSetChart (#1407, Step 8)', () => {
  it('casts the chart at the moment riseTransit returns for the same base moment and place', async () => {
    const result = await computeRiseSetChart(AMSTERDAM_NEW_YEAR, SUN, 'rise', 'true', engine);
    expect(result.chart).toBeDefined();
    if (result.chart === undefined) return;
    const baseJd = await julianDayFor(engine, resolveMoment(AMSTERDAM_NEW_YEAR));
    const place: GeoPosition = { ...AMSTERDAM_NEW_YEAR.coordinates, altitude: 0 };
    const direct = await engine.riseTransit(baseJd, SUN, place, 'rise', 'true');
    expect(result.eventJd).toBe(direct);
    expect(result.place).toEqual(place);
  });

  it('the true-horizon rise of the Sun has its Ascendant within 0.5° of the Sun’s longitude', async () => {
    const result = await computeRiseSetChart(AMSTERDAM_NEW_YEAR, SUN, 'rise', 'true', engine);
    if (result.chart === undefined) throw new Error('the Sun rises in Amsterdam on 1 January 2024');
    const sun = result.chart.positions.find((position) => position.body === SUN);
    expect(sun).toBeDefined();
    if (sun === undefined) return;
    expect(circularGap(result.chart.houses.ascendant, sun.longitude)).toBeLessThan(0.5);
  });

  it('returns the typed circumpolar reason, not an error, when the Sun does not set at this latitude', async () => {
    const result = await computeRiseSetChart(TROMSO_MIDSUMMER, SUN, 'set', 'true', engine);
    expect(result).toEqual({ chart: undefined, reason: 'circumpolar' });
  });
});
