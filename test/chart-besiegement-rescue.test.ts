// @vitest-environment jsdom
/**
 * The besiegement rescue (#724) end to end against the real Swiss Ephemeris (never a mock), plus the
 * words it adds to the condition table and the consultation highlights in English and Dutch.
 *
 * The chart is a real one: 1803-08-05 12:00 UT, 52°N 5°E. Mars is besieged between Saturn and Venus's
 * neighbourhood, and Venus casts a sextile onto it within 7°. That date was found by scanning real
 * charts, not by constructing longitudes; the edge cases (6.9°, 7.0°, wrong aspects) are covered at the
 * pure level in `astrology-planetary-condition.test.ts` and `chart-tables.test.ts`.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { computeChartDataAtJd, type ChartData } from '../src/domain/chart-compute.js';
import { type ConditionRow, conditionRows } from '../src/domain/chart-tables.js';
import type { BesiegementRescue } from '../src/astrology/planetary-condition.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { besiegementRescueList } from '../src/ui/besiegement-rescue-label.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { conditionColumns } from '../src/ui/ChartView.js';
import { consultationViewMessages } from '../src/ui/ConsultationView.messages.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
let data: ChartData;

beforeAll(async () => {
  engine = await getEngine();
  const jd = await engine.julianDay(1803, 8, 5, 12);
  data = await computeChartDataAtJd(jd, { latitude: 52, longitude: 5, altitude: 0 }, engine);
}, 60_000);

describe('besiegement rescue on a real chart (#724)', () => {
  it('finds a besieged planet eased by a fortune, which stays besieged', () => {
    const rows = conditionRows(data);
    const eased = rows.filter((row) => row.besiegementRescuedBy !== undefined);
    expect(eased.length).toBeGreaterThan(0);
    for (const row of eased) {
      expect(row.besieged).toBe(true);
      expect(row.besiegementRescuedBy?.every((rescue) => ['sun', 'jupiter', 'venus'].includes(rescue.bodyKey))).toBe(
        true,
      );
      expect(row.besiegementRescuedBy?.every((rescue) => rescue.bodyKey !== row.bodyKey)).toBe(true);
    }
    const mars = rows.find((row) => row.bodyKey === 'mars');
    expect(mars?.besiegementRescuedBy).toEqual([{ bodyKey: 'venus', aspect: 'sextile' }]);
  });

  it('confirms the rescue from the real longitudes: Venus within 7° of an exact sextile to Mars', () => {
    const longitudeOf = (key: string): number => {
      const id = bodyByKey(key)?.id;
      const found = data.positions.find((p) => p.body === id);
      if (found === undefined) throw new Error(`no position for ${key}`);
      return found.longitude;
    };
    const separation = Math.abs(((longitudeOf('venus') - longitudeOf('mars') + 540) % 360) - 180);
    expect(Math.abs(separation - 60)).toBeLessThan(7);
  });

  it('has no besiegementRescuedBy on any row that is not besieged', () => {
    for (const row of conditionRows(data)) {
      if (!row.besieged) expect(row).not.toHaveProperty('besiegementRescuedBy');
    }
  });
});

describe('besiegement rescue wording (#724)', () => {
  const rescues: readonly BesiegementRescue[] = [
    { bodyKey: 'jupiter', aspect: 'trine' },
    { bodyKey: 'venus', aspect: 'sextile' },
  ];
  // Built inside each test, not at describe time: `data` is only set in `beforeAll`.
  const marsRow = (): ConditionRow => {
    const row = conditionRows(data).find((r) => r.bodyKey === 'mars');
    if (row === undefined) throw new Error('no Mars row');
    return row;
  };
  const besiegedCell = (locale: 'en' | 'nl', row: ConditionRow): string | undefined =>
    conditionColumns(chartViewMessages[locale], locale)
      .find((c) => c.key === 'besieged')
      ?.render?.(row);

  it('lists the easing fortunes with their aspects, in English and Dutch', () => {
    expect(besiegementRescueList(rescues, 'en')).toBe('Jupiter, trine; Venus, sextile');
    expect(besiegementRescueList(rescues, 'nl')).toBe('Jupiter, driehoek; Venus, sextiel');
  });

  it('adds the note to the condition table cell only when a fortune eases the besiegement', () => {
    // The real Mars row on this date is eased by Venus; strip that to get the plain besieged row.
    const besiegedRow = Object.fromEntries(
      Object.entries(marsRow()).filter(([key]) => key !== 'besiegementRescuedBy'),
    ) as ConditionRow;
    const easedRow: ConditionRow = { ...besiegedRow, besiegementRescuedBy: rescues };
    expect(besiegedCell('en', easedRow)).toBe('✓ (eased by Jupiter, trine; Venus, sextile)');
    expect(besiegedCell('nl', easedRow)).toBe('✓ (verlicht door Jupiter, driehoek; Venus, sextiel)');
    expect(besiegedCell('en', besiegedRow)).toBe('✓');
    expect(besiegedCell('nl', besiegedRow)).toBe('✓');
  });

  it('words the consultation highlight in both languages', () => {
    expect(consultationViewMessages.en.besiegedEasedCondition('Jupiter, trine')).toBe(
      'besieged (eased by Jupiter, trine)',
    );
    expect(consultationViewMessages.nl.besiegedEasedCondition('Jupiter, driehoek')).toBe(
      'belegerd (verlicht door Jupiter, driehoek)',
    );
  });
});
