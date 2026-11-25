/**
 * The fixed-star paran table (#1407; Solar Fire Deluxe guide ch. 21, §21.1.2): every chosen star against every visible
 * body, at the latitude the chart is cast for, within an orb of sidereal time, keeping only the parans whose two angle
 * events are both allowed. Real engine, and an independent recomputation through `armcAtAngle` for each row.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { ANGLE_EVENTS, armcAtAngle, type AngleEvent } from '../src/astrology/fixed-stars.js';
import {
  DEFAULT_EXTENDED_SETTINGS,
  FIXED_STAR_PARAN_ORB_DEFAULT,
  toChartCalculationOptions,
  toPointVisibilityOptions,
  type ExtendedSettings,
} from '../src/chart/extended-settings.js';
import { computeChartData, NATAL_FIXED_STARS, type ChartData } from '../src/domain/chart-compute.js';
import { fixedStarParanRows, type FixedStarParanRow } from '../src/domain/chart-tables.js';
import type { ChosenFixedStar } from '../src/domain/person.js';
import type { EphemerisProvider, GeoPosition } from '../src/ephemeris/types.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const PERSON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

let engine: EphemerisProvider;
let data: ChartData;

beforeAll(async () => {
  engine = await getEngine();
  data = await computeChartData(PERSON, engine, { paranStars: true });
}, 60_000);

function rowsFor(orb: number, events: readonly AngleEvent[] = ANGLE_EVENTS, chart: ChartData = data) {
  return fixedStarParanRows(chart, { fixedStarParans: { orb, events } });
}

function angularSeparation(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe('the paran coordinates (#1407)', () => {
  it('are computed only when asked for, and then hold every chosen star and body at the chart latitude', async () => {
    const plain = await computeChartData(PERSON, engine);
    expect(plain.paranPoints).toBeUndefined();
    expect(data.paranPoints?.latitude).toBe(PERSON.coordinates.latitude);
    expect(data.paranPoints?.stars.size).toBe(NATAL_FIXED_STARS.length);
    expect(data.paranPoints?.bodies.size).toBe(data.positions.length);
  });

  it('are tropical and equatorial whatever the zodiac: a sidereal chart gives the same parans', async () => {
    const sidereal = await computeChartData(PERSON, engine, {
      paranStars: true,
      zodiac: { kind: 'sidereal', ayanamsa: 1 },
    });
    expect(rowsFor(3, ANGLE_EVENTS, sidereal)).toEqual(rowsFor(3));
  });

  it('come from the settings: on only when fixedStarParans is set', () => {
    expect(toChartCalculationOptions(DEFAULT_EXTENDED_SETTINGS).paranStars).toBeUndefined();
    const on: ExtendedSettings = {
      ...DEFAULT_EXTENDED_SETTINGS,
      fixedStarParans: { orb: 2, events: ['rising', 'setting'] },
    };
    expect(toChartCalculationOptions(on).paranStars).toBe(true);
    expect(toPointVisibilityOptions(on).fixedStarParans).toEqual({ orb: 2, events: ['rising', 'setting'] });
    expect(toPointVisibilityOptions(DEFAULT_EXTENDED_SETTINGS).fixedStarParans).toBeUndefined();
  });
});

describe('fixedStarParanRows (#1407)', () => {
  it('lists parans, each row agreeing with an independent recomputation of the two ARMCs', () => {
    const rows = rowsFor(10).filter((row) => row.firstBodyKey === undefined);
    expect(rows.length).toBeGreaterThan(0);
    const points = data.paranPoints;
    expect(points).toBeDefined();
    if (points === undefined) return;
    for (const row of rows) {
      const star = points.stars.get(row.star)?.[row.starEvent];
      const bodyId = bodyByKey(row.bodyKey)?.id;
      const body = bodyId === undefined ? undefined : points.bodies.get(bodyId)?.[row.bodyEvent];
      expect(star, row.star).toBeDefined();
      expect(body, row.bodyKey).toBeDefined();
      if (star === undefined || body === undefined) continue;
      const starArmc = armcAtAngle(star, points.latitude, row.starEvent);
      const bodyArmc = armcAtAngle(body, points.latitude, row.bodyEvent);
      expect(starArmc).toBeDefined();
      expect(bodyArmc).toBeDefined();
      expect(angularSeparation(starArmc ?? Number.NaN, bodyArmc ?? Number.NaN)).toBeCloseTo(row.orb, 9);
      expect(row.orb).toBeLessThanOrEqual(10);
    }
  });

  it('keeps only the parans whose two events are both allowed', () => {
    const all = rowsFor(10);
    const horizon = rowsFor(10, ['rising', 'setting']);
    expect(horizon.length).toBeGreaterThan(0);
    expect(horizon.length).toBeLessThan(all.length);
    for (const row of horizon) {
      expect(['rising', 'setting']).toContain(row.starEvent);
      expect(['rising', 'setting']).toContain(row.bodyEvent);
    }
    // Rising/setting only: a star rising as a planet culminates is a paran, but not one of these.
    expect(all.some((row) => row.starEvent === 'culminating' || row.bodyEvent === 'culminating')).toBe(true);
    expect(rowsFor(10, [])).toEqual([]);
  });

  it('has an exact orb boundary: a paran at its own orb is in, and a hair under is out', () => {
    const rows = rowsFor(10);
    const target = [...rows].sort((a, b) => a.orb - b.orb)[Math.floor(rows.length / 2)];
    expect(target).toBeDefined();
    if (target === undefined) return;
    const same = (row: FixedStarParanRow): boolean =>
      row.star === target.star &&
      row.bodyKey === target.bodyKey &&
      row.starEvent === target.starEvent &&
      row.bodyEvent === target.bodyEvent;
    expect(rowsFor(target.orb).some(same)).toBe(true);
    expect(rowsFor(target.orb - 1e-9).some(same)).toBe(false);
  });

  it('is empty when the setting is off, or the chart holds no paran coordinates', async () => {
    expect(fixedStarParanRows(data, {})).toEqual([]);
    const plain = await computeChartData(PERSON, engine);
    expect(rowsFor(10, ANGLE_EVENTS, plain)).toEqual([]);
  });

  it('leaves out a body that is not shown', () => {
    const withMars = rowsFor(10);
    expect(withMars.some((row) => row.bodyKey === 'mars')).toBe(true);
    const hidden = fixedStarParanRows(data, {
      fixedStarParans: { orb: 10, events: ANGLE_EVENTS },
      bodyVisibility: { mars: false },
    });
    expect(hidden.some((row) => row.bodyKey === 'mars')).toBe(false);
  });
});

describe('body-to-body parans (#1996)', () => {
  const bodyRows = (rows: readonly FixedStarParanRow[]) => rows.filter((row) => row.firstBodyKey !== undefined);

  it('lists every unordered pair of visible bodies once, each row agreeing with an independent ARMC recomputation', () => {
    const rows = bodyRows(rowsFor(10));
    expect(rows.length).toBeGreaterThan(0);
    const points = data.paranPoints;
    if (points === undefined) throw new Error('no paran points');
    for (const row of rows) {
      expect(row.firstBodyKey).not.toBe(row.bodyKey);
      const a = points.bodies.get(bodyByKey(row.firstBodyKey ?? '')?.id ?? -1)?.[row.starEvent];
      const b = points.bodies.get(bodyByKey(row.bodyKey)?.id ?? -1)?.[row.bodyEvent];
      if (a === undefined || b === undefined) throw new Error('missing body point');
      const armcA = armcAtAngle(a, points.latitude, row.starEvent);
      const armcB = armcAtAngle(b, points.latitude, row.bodyEvent);
      expect(angularSeparation(armcA ?? Number.NaN, armcB ?? Number.NaN)).toBeCloseTo(row.orb, 9);
    }
    // A pair appears under one ordering only: the reverse (second, first) never occurs.
    const pairs = new Set(rows.map((row) => `${row.firstBodyKey ?? ''}|${row.bodyKey}`));
    for (const row of rows) expect(pairs.has(`${row.bodyKey}|${row.firstBodyKey ?? ''}`)).toBe(false);
  });

  it('uses the same orb and event filter as star parans', () => {
    const horizon = bodyRows(rowsFor(10, ['rising', 'setting']));
    expect(horizon.length).toBeGreaterThan(0);
    for (const row of horizon) {
      expect(['rising', 'setting']).toContain(row.starEvent);
      expect(['rising', 'setting']).toContain(row.bodyEvent);
    }
    expect(bodyRows(rowsFor(10)).length).toBeGreaterThan(bodyRows(rowsFor(1)).length);
    expect(bodyRows(rowsFor(10, []))).toEqual([]);
  });

  it('leaves out a hidden body', () => {
    const hidden = fixedStarParanRows(data, {
      fixedStarParans: { orb: 10, events: ANGLE_EVENTS },
      bodyVisibility: { mars: false },
    });
    expect(bodyRows(hidden).some((row) => row.bodyKey === 'mars' || row.firstBodyKey === 'mars')).toBe(false);
    expect(bodyRows(rowsFor(10)).some((row) => row.bodyKey === 'mars' || row.firstBodyKey === 'mars')).toBe(true);
  });

  it('has no Sun-Mars body-to-body paran at the default orb, though the same pair appears at a wider orb', () => {
    const sunMars = (rows: readonly FixedStarParanRow[]): FixedStarParanRow[] =>
      bodyRows(rows).filter(
        (row) =>
          (row.firstBodyKey === 'sun' && row.bodyKey === 'mars') ||
          (row.firstBodyKey === 'mars' && row.bodyKey === 'sun'),
      );
    expect(sunMars(rowsFor(FIXED_STAR_PARAN_ORB_DEFAULT))).toEqual([]);
    expect(sunMars(rowsFor(10)).length).toBeGreaterThan(0);
  });
});

describe('body-to-body parans on the owner reference chart (#1996)', () => {
  const REFERENCE: BirthMomentInput = {
    civil: { year: 2025, month: 5, day: 5, hour: 5, minute: 5, second: 5 },
    coordinates: { latitude: 5 + 5 / 60 + 5 / 3600, longitude: 5 + 5 / 60 + 5 / 3600 },
    offsetOverrideMinutes: 60,
  };
  // The reference orb is 2 minutes of time, which is 0.5 degrees of sidereal time.
  const REFERENCE_ORB = 0.5;

  it('has the Venus-Neptune and Sun-Mars parans of the reference listing', async () => {
    const chart = await computeChartData(REFERENCE, engine, { paranStars: true });
    const at = (orb: number) => fixedStarParanRows(chart, { fixedStarParans: { orb, events: ANGLE_EVENTS } });
    const has = (rows: readonly FixedStarParanRow[], a: string, ea: AngleEvent, b: string, eb: AngleEvent): boolean =>
      rows.some(
        (r) =>
          (r.firstBodyKey === a && r.bodyKey === b && r.starEvent === ea && r.bodyEvent === eb) ||
          (r.firstBodyKey === b && r.bodyKey === a && r.starEvent === eb && r.bodyEvent === ea),
      );
    // Within the reference orb: Sun anticulminating with Mars setting, and Venus with Neptune rising.
    const tight = at(REFERENCE_ORB);
    expect(has(tight, 'sun', 'anticulminating', 'mars', 'setting')).toBe(true);
    expect(has(tight, 'venus', 'rising', 'neptune', 'rising')).toBe(true);
    // The reference's other Venus-Neptune events (culminating, setting, anticulminating) used to be 2.6-3.4 minutes
    // apart, when every body was held at the chart moment (the snapshot convention of #1407/#1996). Since #2003 each
    // body is read at the instant of its own event, so they now fall inside the tight orb too (see the gap test
    // below); this wider orb stays as the unchanged superset check.
    const wide = at(1);
    for (const event of ['culminating', 'setting', 'anticulminating'] as const) {
      expect(has(wide, 'venus', event, 'neptune', event)).toBe(true);
    }
  }, 60_000);
});

describe("parans at each event's instant, with a topocentric Moon (#2003)", () => {
  const REFERENCE: BirthMomentInput = {
    civil: { year: 2025, month: 5, day: 5, hour: 5, minute: 5, second: 5 },
    coordinates: { latitude: 5 + 5 / 60 + 5 / 3600, longitude: 5 + 5 / 60 + 5 / 3600 },
    offsetOverrideMinutes: 60,
  };
  const PLACE: GeoPosition = { ...REFERENCE.coordinates, altitude: 5 };
  const MOON = 1;
  const star = (name: string, designation: string): ChosenFixedStar => ({
    id: `,${designation}`,
    name,
    designation,
    equinox: 'ICRS',
    sourceSha256: '0'.repeat(64),
  });
  const MINUTES_PER_DEGREE = 4;
  const rowsOf = async (orb: number) => {
    const chart = await computeChartData(REFERENCE, engine, {
      paranStars: true,
      fixedStars: [
        star('Algol', 'bePer'),
        star('Deneb Adige', 'alCyg'),
        star('Zubeneshamali', 'beLib'),
        star('Alphecca', 'alCrB'),
      ],
    });
    return fixedStarParanRows(chart, { fixedStarParans: { orb, events: ANGLE_EVENTS } });
  };

  it("puts the Venus-Neptune gaps at the listing's 0.62, 1.95 and 1.85 minutes of time, each within 0.1", async () => {
    const rows = await rowsOf(0.5);
    const gap = (event: AngleEvent): number => {
      const row = rows.find(
        (r) => r.firstBodyKey === 'venus' && r.bodyKey === 'neptune' && r.starEvent === event && r.bodyEvent === event,
      );
      expect(row, event).toBeDefined();
      return (row?.orb ?? Number.NaN) * MINUTES_PER_DEGREE;
    };
    expect(Math.abs(gap('culminating') - 0.62)).toBeLessThan(0.1);
    expect(Math.abs(gap('setting') - 1.95)).toBeLessThan(0.1);
    expect(Math.abs(gap('anticulminating') - 1.85)).toBeLessThan(0.1);
  }, 60_000);

  it("holds the Moon at the listing's four event times (topocentric centre, altitude 0, no refraction), within 0.5 minute", async () => {
    // The listing's CET clock times, as UT. The window opens 24 hours before the chart moment, as the table's does.
    const start = (await engine.julianDay(2025, 5, 5, 4 + 5 / 60 + 5 / 3600)) - 1;
    const utJd = (day: number, h: number, m: number, sec: number) =>
      engine.julianDay(2025, 5, day, h + m / 60 + sec / 3600);
    const listing = [
      ['anticulminate', await utJd(4, 5, 44, 11)],
      ['rise', await utJd(4, 11, 53, 0)],
      ['culminate', await utJd(4, 18, 8, 40)],
      ['set', await utJd(5, 0, 23, 8)],
    ] as const;
    for (const [event, expected] of listing) {
      const instant = await engine.riseTransit(start, MOON, PLACE, event, 'centre-topocentric');
      expect(instant, event).toBeDefined();
      expect(Math.abs(((instant ?? Number.NaN) - expected) * 1440), event).toBeLessThan(0.5);
    }
  }, 60_000);

  it('has the Moon rows of the listing: Algol, Deneb Adige, Zubeneshamali, Alphecca and Uranus', async () => {
    const rows = await rowsOf(0.5);
    const has = (starName: string, starEvent: AngleEvent, bodyKey: string, bodyEvent: AngleEvent): boolean =>
      rows.some(
        (r) => r.star === starName && r.bodyKey === bodyKey && r.starEvent === starEvent && r.bodyEvent === bodyEvent,
      );
    expect(has('Algol', 'rising', 'moon', 'anticulminating')).toBe(true);
    expect(has('Deneb Adige', 'setting', 'moon', 'rising')).toBe(true);
    expect(has('Zubeneshamali', 'rising', 'moon', 'culminating')).toBe(true);
    expect(has('Alphecca', 'culminating', 'moon', 'setting')).toBe(true);
    expect(
      rows.some(
        (r) =>
          r.firstBodyKey === 'moon' &&
          r.bodyKey === 'uranus' &&
          r.starEvent === 'setting' &&
          r.bodyEvent === 'anticulminating',
      ),
    ).toBe(true);
  }, 60_000);

  it("reads each body at the event's own instant, not the chart moment: the Moon's four positions differ", async () => {
    const chart = await computeChartData(REFERENCE, engine, { paranStars: true });
    const moon = chart.paranPoints?.bodies.get(MOON);
    const positions = ANGLE_EVENTS.map((event) => moon?.[event]?.rightAscension);
    expect(positions.every((ra) => ra !== undefined)).toBe(true);
    expect(new Set(positions).size).toBe(4);
  }, 60_000);
});

describe('paran rows are limited to Sun through Pluto (#2003 owner decision)', () => {
  const REFERENCE: BirthMomentInput = {
    civil: { year: 2025, month: 5, day: 5, hour: 5, minute: 5, second: 5 },
    coordinates: { latitude: 5 + 5 / 60 + 5 / 3600, longitude: 5 + 5 / 60 + 5 / 3600 },
    offsetOverrideMinutes: 60,
  };
  const EXCLUDED_KEYS = [
    'chiron',
    'pholus',
    'ceres',
    'pallas',
    'juno',
    'vesta',
    'meanNode',
    'trueNode',
    'meanLilith',
    'osculatingLilith',
    'interpolatedLilith',
  ];

  it('has no row whose first or second body is an asteroid, a node or a Lilith, with every event and a 10 degree orb', async () => {
    const chart = await computeChartData(REFERENCE, engine, { paranStars: true });
    const rows = fixedStarParanRows(chart, { fixedStarParans: { orb: 10, events: ANGLE_EVENTS } });
    expect(rows.some((r) => r.firstBodyKey !== undefined)).toBe(true);
    expect(rows.some((r) => r.firstBodyKey === undefined)).toBe(true);
    for (const row of rows) {
      expect(EXCLUDED_KEYS).not.toContain(row.bodyKey);
      expect(EXCLUDED_KEYS).not.toContain(row.firstBodyKey ?? 'sun');
    }
    // The chart itself still holds the excluded bodies.
    expect(chart.positions.some((p) => bodyByKey('chiron')?.id === p.body)).toBe(true);
  }, 60_000);

  it('keeps the Sun-Pluto rows the review matched: Venus-Neptune culminating at 0.62 min, Sun anticulminating with Mars setting', async () => {
    const chart = await computeChartData(REFERENCE, engine, { paranStars: true });
    const rows = fixedStarParanRows(chart, { fixedStarParans: { orb: 0.5, events: ANGLE_EVENTS } });
    const venusNeptune = rows.find(
      (r) =>
        r.firstBodyKey === 'venus' &&
        r.bodyKey === 'neptune' &&
        r.starEvent === 'culminating' &&
        r.bodyEvent === 'culminating',
    );
    expect(Math.abs((venusNeptune?.orb ?? Number.NaN) * 4 - 0.62)).toBeLessThan(0.1);
    expect(
      rows.some(
        (r) =>
          r.firstBodyKey === 'sun' &&
          r.bodyKey === 'mars' &&
          r.starEvent === 'anticulminating' &&
          r.bodyEvent === 'setting',
      ),
    ).toBe(true);
  }, 60_000);
});
