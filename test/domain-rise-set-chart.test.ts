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

/** Tromsø, 21 December 2024, 00:00 local: the Sun does not rise that day (polar night, Tromsø's season runs late Nov to mid Jan). */
const TROMSO_MIDWINTER: BirthMomentInput = {
  civil: { year: 2024, month: 12, day: 21, hour: 0, minute: 0, second: 0 },
  coordinates: { latitude: 69.65, longitude: 18.96 },
  offsetOverrideMinutes: 60,
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

  it('the true-horizon rise of the Sun has its Ascendant within 0.01° of the Sun’s longitude', async () => {
    // 0.01° is a documented precision choice, not a sourced value: the event is bisected to one second, which leaves an
    // Ascendant gap of a few arcseconds (astrologer review of #1951, finding 5; #1407 comment, 2026-11-24).
    const result = await computeRiseSetChart(AMSTERDAM_NEW_YEAR, SUN, 'rise', 'true', engine);
    if (result.chart === undefined) throw new Error('the Sun rises in Amsterdam on 1 January 2024');
    const sun = result.chart.positions.find((position) => position.body === SUN);
    expect(sun).toBeDefined();
    if (sun === undefined) return;
    expect(circularGap(result.chart.houses.ascendant, sun.longitude)).toBeLessThan(0.01);
  });

  it('returns the typed circumpolar reason, not an error, when the Sun does not set at this latitude', async () => {
    const result = await computeRiseSetChart(TROMSO_MIDSUMMER, SUN, 'set', 'true', engine);
    expect(result).toEqual({ chart: undefined, reason: 'circumpolar' });
  });

  it('the visual-horizon Sun rise comes at or before the true-horizon rise the same day (refraction lifts the body)', async () => {
    const visual = await computeRiseSetChart(AMSTERDAM_NEW_YEAR, SUN, 'rise', 'visual', engine);
    const trueHorizon = await computeRiseSetChart(AMSTERDAM_NEW_YEAR, SUN, 'rise', 'true', engine);
    if (visual.chart === undefined || trueHorizon.chart === undefined) {
      throw new Error('the Sun rises in Amsterdam on 1 January 2024 on both horizons');
    }
    expect(visual.eventJd).toBeLessThanOrEqual(trueHorizon.eventJd);
  });

  it('the Moon’s true-horizon rise has its geocentric centre at altitude 0 at eventJd, within 0.01°', async () => {
    // Tolerance 0.01° is about one second of the Moon's diurnal motion (its altitude changes by at most ~0.25° a minute),
    // the same second the engine's bisection stops at (`engine.ts`, `while (to - from > 1 / 86400)`). It is a choice of
    // precision, not a sourced value.
    const moonRise = await computeRiseSetChart(AMSTERDAM_NEW_YEAR, idOf('moon'), 'rise', 'true', engine);
    if (moonRise.chart === undefined)
      throw new Error('the Moon rises in Amsterdam within the window on 1 January 2024');
    const position = await engine.position(moonRise.eventJd, idOf('moon'));
    const horizontal = await engine.azimuthAltitude(
      moonRise.eventJd,
      { longitude: position.longitude, latitude: position.latitude },
      moonRise.place,
    );
    expect(Math.abs(horizontal.altitude)).toBeLessThan(0.01);
  });

  it('the event moment is after the birth moment (the search start) and within one day of it (Amsterdam)', async () => {
    const result = await computeRiseSetChart(AMSTERDAM_NEW_YEAR, SUN, 'rise', 'true', engine);
    if (result.chart === undefined) throw new Error('the Sun rises in Amsterdam on 1 January 2024');
    const fromJd = await julianDayFor(engine, resolveMoment(AMSTERDAM_NEW_YEAR));
    expect(result.eventJd).toBeGreaterThan(fromJd);
    expect(result.eventJd - fromJd).toBeLessThan(1);
  });

  it('a search-from date starts the search there, so the event moves to the next day (searchJd option)', async () => {
    const fromJd = await julianDayFor(engine, resolveMoment(AMSTERDAM_NEW_YEAR));
    const later = await computeRiseSetChart(AMSTERDAM_NEW_YEAR, SUN, 'rise', 'true', engine, { searchJd: fromJd + 1 });
    if (later.chart === undefined) throw new Error('the Sun rises in Amsterdam on 2 January 2024');
    expect(later.eventJd).toBeGreaterThan(fromJd + 1);
    expect(later.eventJd - fromJd - 1).toBeLessThan(1);
  });

  it('returns never-rises, not circumpolar, when the Sun does not rise in the window (polar night)', async () => {
    const result = await computeRiseSetChart(TROMSO_MIDWINTER, SUN, 'rise', 'true', engine);
    expect(result).toEqual({ chart: undefined, reason: 'never-rises' });
  });
});
