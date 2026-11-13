/**
 * The Transits bi-wheel's natal and transit ring chords follow the aspects-shown filter (#1508),
 * against the real Swiss Ephemeris.
 */
import { describe, expect, it } from 'vitest';
import {
  HARD_ASPECT_KEYS,
  transitPreset,
  type TransitFilter,
  type TransitRuleContext,
} from '../src/astrology/transit-importance.js';
import { chartWheelRing } from '../src/domain/chart-tables.js';
import { computeTransit, type TransitData } from '../src/domain/transit.js';
import { transitWheelInput } from '../src/domain/transit-wheel.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};
const LABELS = { natal: 'Natal', transit: 'Transit' };
const RULES: TransitRuleContext = { everyBodyKey: [], context: 'daily' };

async function data(): Promise<TransitData> {
  const engine = await getEngine();
  const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
  return computeTransit(NATAL, natalJd + 5000, engine);
}

function chordKeys(ring: { readonly aspects?: readonly { readonly aspect: { readonly key: string } }[] }): string[] {
  // Conjunctions are never drawn as ring chords (multi-wheel excludes them).
  return (ring.aspects ?? []).map((a) => a.aspect.key).filter((key) => key !== 'conjunction');
}

describe('transitWheelInput (#1508)', () => {
  it('with a Hard-only filter, every ring-0 and ring-1 chord is hard', async () => {
    const d = await data();
    const hard: TransitFilter = { ...transitPreset('important', RULES), aspects: [...HARD_ASPECT_KEYS] };
    const { natalRing, transitRing } = transitWheelInput(d, hard, LABELS);
    const allowed = new Set(hard.aspects);
    const before = [...chordKeys(chartWheelRing(d.natal)), ...chordKeys(chartWheelRing(d.transit))];
    // The fixture must have soft chords to remove, or the test proves nothing.
    expect(before.some((key) => !allowed.has(key))).toBe(true);
    const shown = [...chordKeys(natalRing), ...chordKeys(transitRing)];
    expect(shown.length).toBeGreaterThan(0);
    for (const key of shown) expect(allowed.has(key)).toBe(true);
  });

  it('with every major aspect shown, the chord set is unchanged', async () => {
    const d = await data();
    const all = transitPreset('all', RULES);
    const { natalRing, transitRing } = transitWheelInput(d, all, LABELS);
    expect(natalRing.aspects).toEqual(chartWheelRing(d.natal, LABELS.natal).aspects);
    expect(transitRing.aspects).toEqual(chartWheelRing(d.transit, LABELS.transit).aspects);
    expect(natalRing.label).toBe('Natal');
    expect(transitRing.label).toBe('Transit');
  });
});
