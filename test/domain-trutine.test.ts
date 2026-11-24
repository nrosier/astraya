/**
 * The Trutine of Hermes conception chart (#1407, Step 9c), Lilly, Christian Astrology (1647), pp. 502-504. The lookup and
 * the day arithmetic are tested as pure functions on the printed longitudes; the Moon at noon and the conception chart
 * use the real engine (test/engine-harness.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  checkMoonNearAscendant,
  computeTrutineConception,
  conceptionFromGestation,
  julianDateFromDayOfYear,
  julianDayOfYear,
  nearestTrutineRow,
  TRUTINE_CHECK_DEGREES,
  TRUTINE_TABLE,
  trutineDistance,
} from '../src/domain/trutine.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

/** Lilly's nativity, p. 503: Moon in Gemini 1 degree 44 minutes; Ascendant 9s 6 degrees 37 minutes (276 degrees 37). */
const LILLY_MOON = 61 + 44 / 60;
const LILLY_ASCENDANT = 276 + 37 / 60;

function rowFor(signs: number, degrees: number) {
  const row = TRUTINE_TABLE.find((candidate) => candidate.signs === signs && candidate.degrees === degrees);
  if (row === undefined) throw new Error(`no table row ${String(signs)}s ${String(degrees)}`);
  return row;
}

describe('the Trutine table as transcribed (#1407 Step 9c, p. 502)', () => {
  it('holds the 16 rows of the 9a transcription, with the 206 kept as printed (p. 502)', () => {
    expect(TRUTINE_TABLE).toHaveLength(16);
    expect(rowFor(3, 6).aboveDays).toBe(206);
    expect(rowFor(2, 24).aboveDays).toBe(265);
    expect(rowFor(3, 18).aboveDays).toBe(267);
  });
});

describe('Lilly worked example, pp. 503-504: the conception day of 10 December 1615 (Julian)', () => {
  it('finds the Moon under the earth at 145 degrees 7 minutes from the Ascendant, the 12-sign wrap (p. 503, step 1)', () => {
    const { column, distance } = trutineDistance(LILLY_MOON, LILLY_ASCENDANT);
    expect(column).toBe('under');
    expect(distance).toBeCloseTo(145 + 7 / 60, 9);
  });

  it('maps 145 degrees 7 minutes to the 144 degree row (4s 24), 285 days under the earth (p. 504)', () => {
    const row = nearestTrutineRow(145 + 7 / 60);
    expect(row).toEqual(rowFor(4, 24));
    expect(row.underDays).toBe(285);
  });

  it('gives 10 December 1615 from birth day 263 (19 September 1616, bissextile) with the 366 correction (p. 504, "629 ... remaines 344")', () => {
    // Lilly: 244 (the days through August in 1616) + 19 = 263; 263 - 285 < 1, so 263 + 366 - 285 = 344 in 1615.
    expect(julianDayOfYear(1616, 9, 19)).toBe(263);
    const conception = conceptionFromGestation(1616, 263, 285);
    expect(conception).toEqual({ year: 1615, dayOfYear: 344 });
    expect(julianDateFromDayOfYear(conception.year, conception.dayOfYear)).toEqual({
      year: 1615,
      month: 12,
      day: 10,
    });
  });

  it('passes the check on 10 December 1615 with the Moon at 28 degrees 13 minutes as printed (p. 504, "28. 13."; the engine is not called)', () => {
    // The printed Moon is "28. 13." of a sign. The sign glyph is unclear on the scan and is UNRESOLVED. The check needs only
    // the degree distance. Assumed: Sagittarius, 268 degrees 13 minutes, the sign that fits Lilly's "not above 8 degrees
    // distant" (p. 504): it is 8 degrees 24 minutes from the Ascendant. Capricorn (298 degrees 13 minutes) would be
    // 21 degrees 36 minutes away and fail. Only the degree value is asserted as printed; the sign is not.
    const assumedSagittariusMoon = 240 + 28 + 13 / 60;
    const check = checkMoonNearAscendant(assumedSagittariusMoon, LILLY_ASCENDANT);
    expect(check.passed).toBe(true);
    expect(check.distance).toBeCloseTo(8 + 24 / 60, 6);
    expect(check.distance).toBeLessThanOrEqual(TRUTINE_CHECK_DEGREES);
  });
});

describe('the above-the-earth branch, p. 502 ("The D above the earth from the 7th house")', () => {
  it('maps a Moon above the earth at 60 degrees from the Descendant to the 2s 0 row, 263 days (p. 502)', () => {
    // Ascendant 0; the Descendant is 180. A Moon at 240 is above the earth (houses 7-12) and 60 degrees from the D.
    const { column, distance } = trutineDistance(240, 0);
    expect(column).toBe('above');
    expect(distance).toBeCloseTo(60, 9);
    const row = nearestTrutineRow(distance);
    expect(row).toEqual(rowFor(2, 0));
    expect(row.aboveDays).toBe(263);
  });
});

describe('the nearest-row lookup, p. 503, step 3 ("seek out the neerest number unto mine")', () => {
  it('maps a distance between two rows to the nearer one: 70 degrees to 72 degrees (2s 12, 279 days under), not the one below', () => {
    const row = nearestTrutineRow(70);
    expect(row).toEqual(rowFor(2, 12));
    expect(row.underDays).toBe(279);
  });

  it('breaks an exact tie between two rows to the earlier, smaller row, a rule the page does not state (66 degrees to 60, 278 days under)', () => {
    // 66 is 6 from 60 and 6 from 72. The page states no tie rule; this code takes the earlier row.
    const row = nearestTrutineRow(66);
    expect(row).toEqual(rowFor(2, 0));
    expect(row.underDays).toBe(278);
  });
});

describe('the 12-sign wrap, p. 502 ("adding 12 whole Signes to the place of the D")', () => {
  it('adds 360 degrees to the Moon when she is less than the Ascendant (Moon 10, Ascendant 350: under, 20 degrees)', () => {
    const { column, distance } = trutineDistance(10, 350);
    expect(column).toBe('under');
    expect(distance).toBeCloseTo(20, 9);
  });

  it('wraps the Descendant too: Moon 50, Ascendant 100 is above the earth, the Descendant is 280, so 50 + 360 - 280 = 130 (p. 502)', () => {
    // Moon minus Ascendant is 310 (at least 180), so she is above. The Moon (50) is less than the D (280), so 360 is added.
    const wrapped = trutineDistance(50, 100);
    expect(wrapped.column).toBe('above');
    expect(wrapped.distance).toBeCloseTo(130, 9);
  });
});

describe('the check, p. 503, step 5: within 13 degrees of the Ascendant', () => {
  it('passes when the Moon at noon is within 13 degrees of the Ascendant (12.5 degrees away, p. 503)', () => {
    const check = checkMoonNearAscendant(100 + 12.5, 100);
    expect(check.passed).toBe(true);
    expect(check.distance).toBeCloseTo(12.5, 9);
  });

  it('fails with a check-failed result when the Moon at noon is more than 13 degrees from the Ascendant (13.5 degrees away, p. 503)', () => {
    const check = checkMoonNearAscendant(100 + 13.5, 100);
    expect(check.passed).toBe(false);
    expect(check.distance).toBeCloseTo(13.5, 9);
  });

  it('measures the angle the short way round, so Moon 350 is 20 degrees from Ascendant 10 and fails (p. 503)', () => {
    expect(checkMoonNearAscendant(350, 10).passed).toBe(false);
    expect(checkMoonNearAscendant(350, 10).distance).toBeCloseTo(20, 9);
  });
});

describe('computeTrutineConception on the real engine (pp. 502-504)', () => {
  // A Julian-calendar birth at a known time and place, cast by the engine. The result is checked for internal consistency
  // with the printed rules (the table value, the day of year, the check) rather than against an invented number.
  const BIRTH: BirthMomentInput = {
    civil: { year: 1850, month: 6, day: 15, hour: 12, minute: 0, second: 0 },
    coordinates: { latitude: 51.5074, longitude: -0.1278 },
    offsetOverrideMinutes: 0,
    calendar: 'julian',
  };

  it('returns a conception date with a gestation value from the table and a check that matches its own distance (p. 503)', async () => {
    const engine = await getEngine();
    const result = await computeTrutineConception(BIRTH, engine);
    const gestationValues = TRUTINE_TABLE.flatMap((row) => [row.underDays, row.aboveDays]);
    expect(gestationValues).toContain(result.gestationDays);
    expect(result.check.passed).toBe(result.check.distance <= TRUTINE_CHECK_DEGREES);
    expect(result.conception.year === 1849 || result.conception.year === 1850).toBe(true);
    expect(result.chart.positions.length).toBeGreaterThan(0);
  });

  it('refuses a Gregorian birth, since Lilly reckons in the Julian calendar (p. 503)', async () => {
    const engine = await getEngine();
    const gregorian: BirthMomentInput = { ...BIRTH, calendar: 'gregorian' };
    await expect(computeTrutineConception(gregorian, engine)).rejects.toThrow(RangeError);
  });
});

describe('the year-boundary wrap at a zero or minus-one count (p. 504 bissextile rule; the zero case is the owner decision on #1407)', () => {
  it('returns 31 December 1615 for the 1616 bissextile birth with count 0 (birth day 285, gestation 285) without throwing (owner decision on #1407)', () => {
    const conception = conceptionFromGestation(1616, 285, 285);
    expect(conception).toEqual({ year: 1615, dayOfYear: 365 });
    expect(julianDateFromDayOfYear(conception.year, conception.dayOfYear)).toEqual({ year: 1615, month: 12, day: 31 });
  });

  it('returns 31 December of the year before for a zero count in a leap and a common birth year (owner decision on #1407)', () => {
    // 1616 is bissextile (year before 1615 is common, 365). 1617 is common (year before 1616 is bissextile, 366).
    expect(conceptionFromGestation(1616, 285, 285)).toEqual({ year: 1615, dayOfYear: 365 });
    expect(conceptionFromGestation(1617, 285, 285)).toEqual({ year: 1616, dayOfYear: 366 });
    expect(julianDateFromDayOfYear(1616, 366)).toEqual({ year: 1616, month: 12, day: 31 });
  });

  it('gives a valid calendar day for counts 0 and -1 in a leap birth year 1616 and a common birth year 1617 (p. 504; the -1 result is an extension the page does not state)', () => {
    // gestation 285 throughout; the birth day is 285 + count, so the direct count is exactly `count`.
    const cases = [
      { birthYear: 1616, count: 0, year: 1615, dayOfYear: 365, date: { year: 1615, month: 12, day: 31 } },
      { birthYear: 1616, count: -1, year: 1615, dayOfYear: 365, date: { year: 1615, month: 12, day: 31 } },
      { birthYear: 1617, count: 0, year: 1616, dayOfYear: 366, date: { year: 1616, month: 12, day: 31 } },
      { birthYear: 1617, count: -1, year: 1616, dayOfYear: 364, date: { year: 1616, month: 12, day: 29 } },
    ];
    for (const row of cases) {
      const conception = conceptionFromGestation(row.birthYear, 285 + row.count, 285);
      expect(conception).toEqual({ year: row.year, dayOfYear: row.dayOfYear });
      expect(julianDateFromDayOfYear(conception.year, conception.dayOfYear)).toEqual(row.date);
    }
  });
});
