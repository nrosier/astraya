/**
 * Real-engine tests for the station window (#724): a planet inside `k` times its mean speed is stationary, and gets a
 * first or second station type. Runs against the actual Swiss Ephemeris, and cross-checks each type against the
 * station finder (`stations.ts`), so the type is not judged only by the code that assigns it.
 */
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { findStations, type StationEvent } from '../src/astrology/stations.js';
import { isWithinStationWindow, meanDailySpeedOf } from '../src/astrology/planetary-condition.js';
import { computeChartDataAtJd } from '../src/domain/chart-compute.js';
import { conditionRows, positionRows } from '../src/domain/chart-tables.js';
import type { EphemerisProvider, GeoPosition, JulianDayUT } from '../src/ephemeris/types.js';
import { getEngine } from './engine-harness.js';

const NATAL_JD: JulianDayUT = 2448088.104167; // 1990-06-15 14:30 UT, the same fixed epoch stations.test.ts uses
const PLACE: GeoPosition = { latitude: 51.5072, longitude: -0.1276, altitude: 0 };
const K = 0.05;

const MERCURY = bodyByKey('mercury')?.id ?? -1;

/** The first Mercury station in a window wide enough to hold one, from the station finder. */
async function firstMercuryStation(engine: EphemerisProvider): Promise<StationEvent> {
  const [station] = await findStations(engine, [MERCURY], NATAL_JD, NATAL_JD + 200);
  if (station === undefined) throw new Error('fixture bug: no Mercury station in the window');
  return station;
}

/** Mercury's own longitude speed at `jd`, read straight from the engine. */
async function mercurySpeedAt(engine: EphemerisProvider, jd: JulianDayUT): Promise<number> {
  const [position] = await engine.positions(jd, [MERCURY]);
  if (position === undefined) throw new Error('fixture bug: no Mercury position');
  return position.longitudeSpeed;
}

describe('the station window on a real Mercury station (#724)', () => {
  it('a planet at its station is stationary with the window on, and is not with it off', async () => {
    const engine = await getEngine();
    const station = await firstMercuryStation(engine);

    const off = await computeChartDataAtJd(station.jd, PLACE, engine, {});
    expect(off.stationStates).toBeUndefined();
    expect(positionRows(off).find((row) => row.bodyKey === 'mercury')?.stationary).toBeUndefined();
    expect(conditionRows(off).find((row) => row.bodyKey === 'mercury')?.motion).not.toBe('stationary');

    const on = await computeChartDataAtJd(station.jd, PLACE, engine, { stationWindow: { k: K } });
    expect(on.stationStates?.has(MERCURY)).toBe(true);
    expect(conditionRows(on).find((row) => row.bodyKey === 'mercury')?.motion).toBe('stationary');
  });

  it('reports the first or second station, agreeing with the station finder direction', async () => {
    const engine = await getEngine();
    const station = await firstMercuryStation(engine);
    const on = await computeChartDataAtJd(station.jd, PLACE, engine, { stationWindow: { k: K } });
    const row = conditionRows(on).find((candidate) => candidate.bodyKey === 'mercury');
    // The finder's `retrograde` direction is a first station: the speed went negative, the planet turned retrograde.
    const expected = station.direction === 'retrograde' ? 'first' : 'second';
    expect(row?.stationType).toBe(expected);
    expect(positionRows(on).find((candidate) => candidate.bodyKey === 'mercury')?.stationType).toBe(expected);
  });

  it('is not stationary a little beyond the window, but is inside it a little before the window edge', async () => {
    const engine = await getEngine();
    const station = await firstMercuryStation(engine);
    const mean = meanDailySpeedOf(MERCURY) ?? Number.NaN;
    const edge = K * mean;

    // Walk away from the station until |speed| first crosses the edge; both sides of the crossing are then checked.
    let jd = station.jd;
    const step = 0.01;
    let inside = true;
    for (let i = 0; i < 2000 && inside; i++) {
      jd += step;
      inside = isWithinStationWindow(MERCURY, await mercurySpeedAt(engine, jd), K);
    }
    expect(inside).toBe(false);
    const outside = await computeChartDataAtJd(jd, PLACE, engine, { stationWindow: { k: K } });
    expect(outside.stationStates?.has(MERCURY)).toBe(false);
    expect(conditionRows(outside).find((row) => row.bodyKey === 'mercury')?.motion).not.toBe('stationary');
    // The window edge really was crossed here, not an arbitrary point.
    expect(Math.abs(await mercurySpeedAt(engine, jd))).toBeGreaterThan(edge);

    const insideJd = jd - step;
    expect(Math.abs(await mercurySpeedAt(engine, insideJd))).toBeLessThanOrEqual(edge);
  });

  it('the window never changes the Almuten or the essential dignity points', async () => {
    const engine = await getEngine();
    const station = await firstMercuryStation(engine);
    const off = await computeChartDataAtJd(station.jd, PLACE, engine, {});
    const on = await computeChartDataAtJd(station.jd, PLACE, engine, { stationWindow: { k: 1 } });
    const pointsOff = conditionRows(off).map((row) => [row.bodyKey, row.points]);
    const pointsOn = conditionRows(on).map((row) => [row.bodyKey, row.points]);
    expect(pointsOn).toEqual(pointsOff);
  });
});

describe('the station window for an outer planet (#724)', () => {
  it('gives Pluto a station type that agrees with the station finder, with no motion score', async () => {
    const engine = await getEngine();
    const pluto = bodyByKey('pluto')?.id ?? -1;
    // Pluto stations about once a year, so two years is wide enough to contain one; its sidereal period is about 248 years.
    const [station] = await findStations(engine, [pluto], NATAL_JD, NATAL_JD + 730, { sampleStepDays: 2 });
    if (station === undefined) throw new Error('fixture bug: no Pluto station in the window');

    const on = await computeChartDataAtJd(station.jd, PLACE, engine, { stationWindow: { k: K } });
    expect(on.stationStates?.has(pluto)).toBe(true);
    const expected = station.direction === 'retrograde' ? 'first' : 'second';
    expect(on.stationStates?.get(pluto)).toBe(expected);
    // Pluto is shown on the Positions table as a station, and never gets a condition row or a motion score.
    expect(positionRows(on).find((row) => row.bodyKey === 'pluto')?.stationType).toBe(expected);
    expect(conditionRows(on).some((row) => row.bodyKey === 'pluto')).toBe(false);
  }, 60_000);
});
