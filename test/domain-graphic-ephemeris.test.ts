/**
 * The graphic ephemeris (#1404): its positions are the ephemeris engine's, checked against NASA/JPL Horizons.
 *
 * Reference: `test/fixtures/graphic-ephemeris-horizons.json`, fetched by `scripts/fetch-graphic-ephemeris-fixture.mjs`
 * (Horizons quantity 31, geocentric apparent ecliptic longitude of date, 00:00 UT on 2024-01-01, 2024-07-01 and
 * 2024-12-31). The fixed date range is the leap year 2024, so it has 366 days. The same rows are checked against the
 * engine called directly, and the CSV carries them unchanged.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderCycleTimeSeriesSvg } from '../src/chart/cycle-diagram.js';
import {
  computeGraphicEphemeris,
  dateTicks,
  defaultRange,
  GRAPHIC_EPHEMERIS_CLASSICAL_KEYS,
  graphicEphemerisCsv,
  isoFromDay,
  parseIsoDay,
  validateRange,
} from '../src/domain/graphic-ephemeris.js';
import { arcsecondsBetween, getEngine } from './engine-harness.js';

interface Fixture {
  readonly longitudes: Record<string, Record<string, number>>;
}
const fixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'fixtures/graphic-ephemeris-horizons.json'), 'utf8'),
) as Fixture;

const START = parseIsoDay('2024-01-01') ?? 0;
const END = parseIsoDay('2024-12-31') ?? 0;
// Within the observed delta-T record the golden-chart gate holds the engine to 0.2"; the Moon gets the same.
const TOLERANCE_ARCSEC = 0.2;

describe('computeGraphicEphemeris against JPL Horizons (fixed range 2024-01-01 to 2024-12-31)', () => {
  it('has one row a day, the classical seven in order by default, and the Horizons longitudes on the reference days', async () => {
    const engine = await getEngine();
    const data = await computeGraphicEphemeris(engine, GRAPHIC_EPHEMERIS_CLASSICAL_KEYS, START, END);
    expect(data.rows).toHaveLength(366);
    expect(data.bodyKeys).toEqual(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']);
    for (const [iso, expected] of Object.entries(fixture.longitudes)) {
      const row = data.rows.find((candidate) => isoFromDay(candidate.day) === iso);
      expect(row, iso).toBeDefined();
      data.bodyKeys.forEach((key, index) => {
        const actual = row?.longitudes[index] ?? Number.NaN;
        const reference = expected[key] ?? Number.NaN;
        expect(
          arcsecondsBetween(actual, reference),
          `${key} on ${iso}: ${String(actual)} vs ${String(reference)}`,
        ).toBeLessThan(TOLERANCE_ARCSEC);
      });
    }
  });

  it('matches the engine called directly on every day', async () => {
    const engine = await getEngine();
    const data = await computeGraphicEphemeris(engine, ['sun', 'mars', 'pluto'], START, START + 59);
    expect(data.bodyKeys).toEqual(['sun', 'mars', 'pluto']);
    for (const row of data.rows) {
      const direct = await engine.positions(row.jd, [0, 4, 9]);
      expect(row.longitudes).toEqual(direct.map((position) => position.longitude));
    }
  });

  it('writes the same values to CSV, one line a day under a header', async () => {
    const engine = await getEngine();
    const data = await computeGraphicEphemeris(engine, ['sun', 'saturn'], START, START + 2);
    const lines = graphicEphemerisCsv(data).trimEnd().split('\n');
    expect(lines[0]).toBe('date_utc,jd_ut,sun_longitude,saturn_longitude');
    expect(lines).toHaveLength(4);
    const first = data.rows[0];
    expect(lines[1]).toBe(
      `2024-01-01,${first?.jd.toFixed(1) ?? ''},${first?.longitudes[0]?.toFixed(6) ?? ''},${first?.longitudes[1]?.toFixed(6) ?? ''}`,
    );
  });
});

describe('range helpers', () => {
  it('opens on one year from a given day, to the same date a year on', () => {
    expect(defaultRange('2026-11-11')).toEqual({ start: '2026-11-11', end: '2027-11-11' });
    expect(defaultRange('2024-02-29')).toEqual({ start: '2024-02-29', end: '2025-03-01' });
  });

  it('refuses a bad, reversed, out-of-ephemeris or over-long range', () => {
    expect(validateRange('2024-01-01', '2024-12-31')).toBeUndefined();
    expect(validateRange('2024-02-30', '2024-12-31')).toBe('invalid');
    expect(validateRange('', '2024-12-31')).toBe('invalid');
    expect(validateRange('2024-12-31', '2024-01-01')).toBe('reversed');
    expect(validateRange('1799-12-31', '1800-06-01')).toBe('outside-ephemeris');
    expect(validateRange('2399-06-01', '2400-01-01')).toBe('outside-ephemeris');
    expect(validateRange('2020-01-01', '2026-01-01')).toBe('too-long');
  });

  it('puts date ticks on month starts, thinning them for a long range', () => {
    const year = dateTicks(START, END);
    expect(year).toHaveLength(12);
    expect(isoFromDay(year[0]?.day ?? 0)).toBe('2024-01-01');
    expect(year[0]?.at).toBe(0);
    const long = dateTicks(parseIsoDay('2020-01-01') ?? 0, parseIsoDay('2024-12-31') ?? 0);
    expect(long.length).toBeLessThanOrEqual(12);
    expect(long.every((tick) => isoFromDay(tick.day).endsWith('-01'))).toBe(true);
  });
});

describe('renderCycleTimeSeriesSvg (the cycle diagram laid out against time)', () => {
  it('draws the twelve sign bands, a date tick, and a line per series, breaking a line where it wraps through Aries', () => {
    const svg = renderCycleTimeSeriesSvg(
      [
        {
          key: 'sun',
          points: [
            { at: 0, longitude: 350 },
            { at: 0.5, longitude: 359 },
            { at: 0.6, longitude: 1 },
            { at: 1, longitude: 20 },
          ],
        },
      ],
      [{ at: 0.5, label: 'Jul' }],
    );
    expect(svg).toContain('class="cycle-diagram cycle-time-series"');
    expect(svg.match(/chart-sign-glyph /g)).toHaveLength(12);
    expect(svg).toContain('>Jul<');
    expect(svg.match(/class="cycle-series cycle-series-sun"/g)).toHaveLength(2);
    expect(svg).toContain('cycle-series-glyph-sun');
  });
});
