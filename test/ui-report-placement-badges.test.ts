/**
 * #802: the placement badges (sign and degree, house, retrograde) for a body or an angle of a real chart.
 *
 * Runs against the real Swiss Ephemeris engine, never a mock: the badges are derived from computed
 * positions and houses, so only the real engine proves they are right.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { BODIES, bodyByKey } from '../src/astrology/bodies.js';
import { signOf } from '../src/astrology/signs.js';
import { computeChartData, housesAreDefined, type ChartData } from '../src/domain/chart-compute.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { placementBadges } from '../src/ui/report-placement-badges.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

const MOMENT: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

describe('placementBadges (#802)', () => {
  it('gives a body its sign and degree and a house badge', async () => {
    const data = await computeChartData(MOMENT, engine);
    const badges = placementBadges(data, 'sun', 'en');
    const sun = bodyByKey('sun');
    const position = data.positions.find((candidate) => candidate.body === sun?.id);
    expect(badges).toBeDefined();
    expect(position).toBeDefined();
    if (badges === undefined || position === undefined) return;

    const expectedSign = signOf(position.longitude).name;
    expect(badges.signDegree.startsWith(`${expectedSign} · `)).toBe(true);
    expect(badges.signDegree).toMatch(/ · \d+°\d{2}′$/);
    expect(housesAreDefined(data.houses)).toBe(true);
    expect(badges.house).toBeGreaterThanOrEqual(1);
    expect(badges.house).toBeLessThanOrEqual(12);
    expect(badges.houseBadge).toMatch(/^(1st|2nd|3rd|[4-9]th|1[0-2]th) house$/);
  });

  it('gives the Dutch house word and ordinal in nl', async () => {
    const data = await computeChartData(MOMENT, engine);
    const badges = placementBadges(data, 'moon', 'nl');
    expect(badges?.houseBadge).toMatch(/^\d+e huis$/);
  });

  it('gives an angle no house badge', async () => {
    const data = await computeChartData(MOMENT, engine);
    const badges = placementBadges(data, 'asc', 'en');
    expect(badges).toBeDefined();
    expect(badges?.house).toBeUndefined();
    expect(badges?.houseBadge).toBeUndefined();
    expect(badges?.signDegree.startsWith(`${signOf(data.houses.ascendant).name} · `)).toBe(true);
  });

  it('gives the Midheaven no house badge either', async () => {
    const data = await computeChartData(MOMENT, engine);
    const badges = placementBadges(data, 'mc', 'en');
    expect(badges?.house).toBeUndefined();
    expect(badges?.houseBadge).toBeUndefined();
  });

  it('returns undefined for a key the chart does not contain', async () => {
    const data = await computeChartData(MOMENT, engine);
    expect(placementBadges(data, 'no-such-body', 'en')).toBeUndefined();
  });

  it('marks retrograde only for a body that is retrograde', async () => {
    // Scan a few dates until one chart has a retrograde body, so the true case is really exercised.
    let found: { data: ChartData; key: string } | undefined;
    for (let month = 1; month <= 12 && found === undefined; month++) {
      const data = await computeChartData(
        { ...MOMENT, civil: { year: 2026, month, day: 10, hour: 12, minute: 0, second: 0 } },
        engine,
      );
      const retro = data.positions.find((position) => position.retrograde);
      const key = retro === undefined ? undefined : bodyKeyOf(data, retro.body);
      if (key !== undefined) found = { data, key };
    }
    expect(found).toBeDefined();
    if (found === undefined) return;

    const retroBadges = placementBadges(found.data, found.key, 'en');
    expect(retroBadges?.retrograde).toBe(true);
    expect(retroBadges?.retrogradeLabel).toBe('Retrograde');

    for (const position of found.data.positions) {
      const key = bodyKeyOf(found.data, position.body);
      if (key === undefined) continue;
      const badges = placementBadges(found.data, key, 'en');
      expect(badges?.retrograde).toBe(position.retrograde);
      if (!position.retrograde) expect(badges?.retrogradeLabel).toBeUndefined();
    }
  }, 120_000);
});

/** The `BodyDefinition.key` for a body id that is in this chart, or undefined. */
function bodyKeyOf(data: ChartData, bodyId: number): string | undefined {
  if (!data.positions.some((position) => position.body === bodyId)) return undefined;
  return BODIES.find((body) => body.id === bodyId)?.key;
}
