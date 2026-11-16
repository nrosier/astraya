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
import { BODIES, bodyById } from '../src/astrology/bodies.js';
import { filterAspectsForDisplay } from '../src/chart/aspect-web.js';
import { renderMultiWheelSvg, type CrossRingAspects, type WheelRingInput } from '../src/chart/multi-wheel.js';
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
const EVERY_BODY = BODIES.map((body) => body.key);
const RULES: TransitRuleContext = { everyBodyKey: EVERY_BODY, context: 'daily' };

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
    const hard: TransitFilter = { ...transitPreset('all', RULES), aspects: [...HARD_ASPECT_KEYS] };
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

describe('transitWheelInput strict body filter (#1641)', () => {
  const keys = (ring: { readonly bodies: readonly { readonly key: string }[] }): string[] =>
    ring.bodies.map((entry) => entry.key).sort();
  const endKeys = (ring: {
    readonly aspects?: readonly { readonly bodyA: number; readonly bodyB: number }[];
  }): string[] => (ring.aspects ?? []).flatMap((a) => [bodyById(a.bodyA)?.key ?? '', bodyById(a.bodyB)?.key ?? '']);

  it('draws only the selected bodies on each ring and only the hard aspects between them', async () => {
    const d = await data();
    const filter: TransitFilter = {
      ...transitPreset('all', RULES),
      natal: ['sun', 'moon'],
      transiting: ['mars', 'mercury'],
      aspects: [...HARD_ASPECT_KEYS],
    };
    const { natalRing, transitRing } = transitWheelInput(d, filter, LABELS);
    expect(keys(natalRing)).toEqual(['moon', 'sun']);
    expect(keys(transitRing)).toEqual(['mars', 'mercury']);
    for (const ring of [natalRing, transitRing]) {
      for (const aspect of ring.aspects ?? []) expect(HARD_ASPECT_KEYS).toContain(aspect.aspect.key);
    }
    expect(endKeys(natalRing).filter((key) => !['sun', 'moon'].includes(key))).toEqual([]);
    expect(endKeys(transitRing).filter((key) => !['mars', 'mercury'].includes(key))).toEqual([]);
  });

  it('removes every chord that touches an unselected body', async () => {
    const d = await data();
    const before = chartWheelRing(d.natal, LABELS.natal).aspects ?? [];
    expect(before.some((a) => bodyById(a.bodyA)?.key === 'sun' || bodyById(a.bodyB)?.key === 'sun')).toBe(true);
    const filter: TransitFilter = { ...transitPreset('all', RULES), natal: ['moon'], transiting: [] };
    const { natalRing, transitRing } = transitWheelInput(d, filter, LABELS);
    expect(keys(natalRing)).toEqual(['moon']);
    expect(natalRing.aspects).toEqual([]);
    expect(transitRing.bodies).toEqual([]);
    expect(transitRing.aspects).toEqual([]);
  });

  it('with every body selected, the bodies are those of the unfiltered ring', async () => {
    const d = await data();
    const { natalRing, transitRing } = transitWheelInput(d, transitPreset('all', RULES), LABELS);
    expect(natalRing.bodies).toEqual(chartWheelRing(d.natal, LABELS.natal).bodies);
    expect(transitRing.bodies).toEqual(chartWheelRing(d.transit, LABELS.transit).bodies);
  });

  // The pre-#1643 wheel: each ring limited by aspect type only, with no body filter. The All preset
  // selects every body, so today's wheel must render byte-for-byte the same as that one (#1641).
  it('the All preset draws the same wheel as before #1643, with every aspect and with hard aspects only', async () => {
    const d = await data();
    const referenceRing = (ring: WheelRingInput, filter: TransitFilter): WheelRingInput => ({
      ...ring,
      aspects: filterAspectsForDisplay(ring.aspects ?? [], { visibleAspectKeys: filter.aspects }),
    });
    for (const aspects of [transitPreset('all', RULES).aspects, [...HARD_ASPECT_KEYS]]) {
      const filter: TransitFilter = { ...transitPreset('all', RULES), aspects: [...aspects] };
      const before = [
        { ...referenceRing(chartWheelRing(d.natal, LABELS.natal), filter), role: 'natal' as const },
        { ...referenceRing(chartWheelRing(d.transit, LABELS.transit), filter), role: 'transit' as const },
      ];
      const { natalRing, transitRing } = transitWheelInput(d, filter, LABELS);
      // Cross-ring lines are built the same way on both sides, so only the ring change is compared.
      const crossAspects: CrossRingAspects[] = [
        {
          innerRingIndex: 0,
          outerRingIndex: 1,
          aspects: filterAspectsForDisplay(d.contacts, { visibleAspectKeys: filter.aspects }),
        },
      ];
      const svg = renderMultiWheelSvg([natalRing, transitRing], crossAspects);
      expect(svg).toContain('<svg');
      expect(svg).toBe(renderMultiWheelSvg(before, crossAspects));
    }
  });
});
