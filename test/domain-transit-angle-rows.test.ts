/**
 * The Transits wheel and table list the same contacts, ASC and MC included (#1508), against the real Swiss Ephemeris.
 */
import { describe, expect, it } from 'vitest';
import {
  transitPreset,
  TRANSITING_GRID_KEYS,
  NATAL_GRID_KEYS,
  rankTransitsWithAngles,
  filterAngleTransits,
  filterTransits,
  angleTransitImportance,
  transitImportance,
  type TransitFilter,
  type TransitRuleContext,
} from '../src/astrology/transit-importance.js';
import { bodyByKey } from '../src/astrology/bodies.js';
import { renderMultiWheelSvg } from '../src/chart/multi-wheel.js';
import { chartWheelRing, crossContactRows } from '../src/domain/chart-tables.js';
import { computeTransit, type TransitAngleContact, type TransitData } from '../src/domain/transit.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};
const RULES: TransitRuleContext = { everyBodyKey: [], context: 'yearly' };

/** Every transiting body to every natal target, ASC and MC included, which no preset offers (owner decision on #1508). */
function withAngles(): TransitFilter {
  const all = transitPreset('all', RULES);
  return { ...all, transiting: TRANSITING_GRID_KEYS, natal: [...NATAL_GRID_KEYS] };
}

async function withAngleContact(angle: 'asc' | 'mc'): Promise<TransitData> {
  const engine = await getEngine();
  const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
  const filter = withAngles();
  // The Sun meets each natal angle once a year, so one year of daily steps always finds the contact.
  for (let day = 5000; day < 5000 + 366; day += 1) {
    const data = await computeTransit(NATAL, natalJd + day, engine);
    if (filterAngleTransits(data.angleContacts, filter).some((c) => c.angle === angle)) return data;
  }
  throw new Error(`fixture bug: no ${angle} contact found`);
}

describe('angle contacts on the Transits wheel and table (#1508)', () => {
  for (const angle of ['asc', 'mc'] as const) {
    it(`the table row count equals the wheel's line count on the ring pair, with a ${angle} contact`, async () => {
      const data = await withAngleContact(angle);
      const filter = withAngles();
      const ranked = rankTransitsWithAngles(
        filterTransits(data.contacts, filter),
        filterAngleTransits(data.angleContacts, filter),
        filter,
      );
      const bodies = ranked.filter((c) => !('angle' in c));
      const angles = ranked.filter((c): c is TransitAngleContact => 'angle' in c);
      expect(angles.some((c) => c.angle === angle)).toBe(true);
      const rows = crossContactRows(ranked);
      expect(rows.some((r) => r.bodyBKey === angle)).toBe(true);

      const svg = renderMultiWheelSvg(
        [chartWheelRing(data.natal, 'Natal'), chartWheelRing(data.transit, 'Transit')],
        [{ innerRingIndex: 0, outerRingIndex: 1, aspects: bodies as never, angleAspects: angles }],
      );
      const lines = svg.match(/class="chart-aspect-link"[^>]*data-ring-a="1" data-ring-b="0"/g) ?? [];
      expect(lines).toHaveLength(rows.length);
      expect(svg).toContain(`data-aspect-body-b="${angle}"`);
    });
  }

  it('weighs an angle contact as the chart ruler, 1.5', async () => {
    const data = await withAngleContact('asc');
    const filter = withAngles();
    const contact = filterAngleTransits(data.angleContacts, filter).find((c) => c.orb < 1);
    if (contact === undefined) throw new Error('fixture bug');
    const sun = bodyByKey('sun');
    if (sun === undefined) throw new Error('fixture bug: no Sun');
    // The same contact scored as if its natal side were the chart ruler.
    const asRuler = transitImportance({ ...contact, bodyA: contact.body, bodyB: sun.id }, filter, ['sun']);
    expect(angleTransitImportance(contact, filter)).toBeCloseTo(asRuler, 10);
    expect(asRuler).toBeGreaterThan(0);
  });
});
