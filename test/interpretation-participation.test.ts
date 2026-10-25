/**
 * #721: interpretation participation — a third, independent per-object switch. Hiding an object
 * (display) never changes the reading; leaving it out of the reading removes its placements,
 * contacts, dignity and degree paragraphs from every report surface (report sections, wheel
 * selection text, AI payload), while whole-chart facts stay. Against the real engine and corpus.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { DEFAULT_EXTENDED_SETTINGS, toChartCalculationOptions } from '../src/chart/extended-settings.js';
import {
  DEFAULT_OBJECT_POLICIES,
  interpretationExclusions,
  isInterpreted,
  withInterpreted,
} from '../src/chart/object-policy.js';
import {
  buildCalculationSnapshot,
  calculationSnapshotToJson,
  parseCalculationSnapshot,
} from '../src/domain/calculation-snapshot.js';
import { computeChartData, type ChartData } from '../src/domain/chart-compute.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { assembleReport, reportPlacementKeys } from '../src/interpretation/report.js';
import { derivePlacements } from '../src/interpretation/rules.js';
import type { CorpusEntry, CorpusPlacement } from '../src/interpretation/schema.js';
import { selectionPlacements } from '../src/interpretation/selection.js';
import { toTier2ChartPayload } from '../src/interpretation/tier2-client.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
let chart: ChartData;
let corpus: readonly CorpusEntry[];

const MOMENT: BirthMomentInput = {
  civil: { year: 1815, month: 12, day: 10, hour: 7, minute: 45, second: 0 },
  coordinates: { latitude: 51.5072, longitude: -0.1276 },
  offsetOverrideMinutes: 0,
};

beforeAll(async () => {
  engine = await getEngine();
  chart = await computeChartData(MOMENT, engine, {
    ...toChartCalculationOptions(DEFAULT_EXTENDED_SETTINGS),
    rulership: 'modern',
  });
  const raw: unknown = JSON.parse(readFileSync(resolve(import.meta.dirname, '../public/corpus/en.json'), 'utf8'));
  corpus = (Array.isArray(raw) ? raw : (raw as { entries: CorpusEntry[] }).entries) as readonly CorpusEntry[];
}, 60_000);

/** Every body key a placement names, so a test can ask "does the report still mention Mars?". */
function bodiesNamedBy(placement: CorpusPlacement): readonly string[] {
  if ('body' in placement) return [placement.body];
  if ('bodyA' in placement) return [placement.bodyA, placement.bodyB];
  return [];
}

function reportBodies(exclude: ReadonlySet<string>): ReadonlySet<string> {
  const report = assembleReport(chart, 'en', corpus, 'modern', 'natal', exclude);
  return new Set(
    report.sections.flatMap((section) =>
      section.paragraphs.flatMap((paragraph) =>
        paragraph.placement === undefined ? [] : bodiesNamedBy(paragraph.placement),
      ),
    ),
  );
}

describe('the object policy carries interpretation participation (#721)', () => {
  it('defaults to every object read, and stores only an exclusion', () => {
    for (const policy of Object.values(DEFAULT_OBJECT_POLICIES)) expect(isInterpreted(policy)).toBe(true);
    expect(interpretationExclusions(DEFAULT_OBJECT_POLICIES).size).toBe(0);
    const excluded = withInterpreted(DEFAULT_OBJECT_POLICIES.mars, false);
    expect(excluded).toEqual({ visible: true, aspectParticipant: true, interpreted: false });
    // Re-including drops the flag rather than writing `true`, so the default is byte-identical again.
    expect(withInterpreted(excluded, true)).toEqual(DEFAULT_OBJECT_POLICIES.mars);
  });

  it('round-trips through a snapshot, and a chart with no exclusions serializes exactly as before', () => {
    const settings = {
      ...DEFAULT_EXTENDED_SETTINGS,
      objectPolicies: { ...DEFAULT_OBJECT_POLICIES, mars: withInterpreted(DEFAULT_OBJECT_POLICIES.mars, false) },
    };
    const json = calculationSnapshotToJson(buildCalculationSnapshot(settings, 'modern'));
    expect(parseCalculationSnapshot(json).settings.objectPolicies.mars.interpreted).toBe(false);

    const plain = JSON.stringify(
      calculationSnapshotToJson(buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, 'modern')),
    );
    expect(plain).not.toContain('interpreted');
  });

  it('reads an explicit include or a malformed flag as included, never as an exclusion', () => {
    for (const interpreted of [true, 'no', 0, null]) {
      const parsed = parseCalculationSnapshot({
        settings: {
          objectPolicies: { ...DEFAULT_OBJECT_POLICIES, mars: { visible: true, aspectParticipant: true, interpreted } },
        },
      });
      expect(isInterpreted(parsed.settings.objectPolicies.mars)).toBe(true);
    }
  });
});

describe('the reading leaves out exactly what was excluded (#721)', () => {
  it('drops an excluded body from every section, and keeps everything else', () => {
    const full = reportBodies(new Set());
    expect(full.has('mars')).toBe(true);
    const withoutMars = reportBodies(new Set(['mars']));
    expect(withoutMars.has('mars')).toBe(false);
    // Nothing else disappears: the only body lost is the one excluded.
    expect([...full].filter((key) => !withoutMars.has(key))).toEqual(['mars']);
  });

  it('guards against a future path that names the Vertex or a lot: excluding them now changes nothing, since the report never names them', () => {
    const policies = {
      ...DEFAULT_OBJECT_POLICIES,
      vertex: withInterpreted(DEFAULT_OBJECT_POLICIES.vertex, false),
      partOfFortune: withInterpreted(DEFAULT_OBJECT_POLICIES.partOfFortune, false),
      partOfSpirit: withInterpreted(DEFAULT_OBJECT_POLICIES.partOfSpirit, false),
    };
    const exclude = interpretationExclusions(policies);
    expect([...exclude].sort()).toEqual(['partOfFortune', 'partOfSpirit', 'vertex']);

    const full = assembleReport(chart, 'en', corpus, 'modern', 'natal', new Set());
    const withoutPoints = assembleReport(chart, 'en', corpus, 'modern', 'natal', exclude);
    // Same sections, same paragraphs: excluding these keys removes nothing from the reading.
    expect(withoutPoints.sections.map((section) => section.id)).toEqual(full.sections.map((section) => section.id));
    expect(withoutPoints.sections.flatMap((section) => section.paragraphs.map((p) => p.text))).toEqual(
      full.sections.flatMap((section) => section.paragraphs.map((p) => p.text)),
    );
    // No paragraph in the reading is a derived-point (Part of Fortune / Spirit) placement.
    const derivedNamed = withoutPoints.sections.flatMap((section) =>
      section.paragraphs.filter((p) => p.placement?.category.startsWith('derived-point') === true),
    );
    expect(derivedNamed).toEqual([]);
  });

  it('drops a contact when either of its bodies is excluded', () => {
    const contacts = derivePlacements(chart, new Set(['venus'])).filter((p) => p.placement.category === 'aspect-pair');
    for (const contact of contacts) expect(bodiesNamedBy(contact.placement)).not.toContain('venus');
  });

  it('can leave out the Sun and Moon, keeping the opening section’s Ascendant reading', () => {
    const report = assembleReport(chart, 'en', corpus, 'modern', 'natal', new Set(['sun', 'moon']));
    const opening = report.sections.find((section) => section.id === 'core-identity');
    expect(opening?.paragraphs.some((p) => p.placement?.category === 'sign-on-cusp')).toBe(true);
    expect(reportPlacementKeys(report).some((key) => key.includes(':sun:') || key.includes(':moon:'))).toBe(false);
  });

  it('keeps whole-chart facts — temperament and the dispositor chain — even with their bodies excluded', () => {
    const report = assembleReport(chart, 'en', corpus, 'modern', 'natal', new Set(['jupiter', 'saturn', 'mars']));
    const derived = report.sections.flatMap((section) => section.paragraphs.filter((p) => p.source.kind === 'derived'));
    expect(derived.some((p) => p.text.startsWith('Dispositor chain'))).toBe(true);
    expect(report.sections.find((section) => section.id === 'temperament')?.paragraphs.length).toBe(2);
  });

  it('is unaffected by display visibility: hiding an object on the wheel does not change the reading', () => {
    const hiddenPolicies = {
      ...DEFAULT_OBJECT_POLICIES,
      mars: { ...DEFAULT_OBJECT_POLICIES.mars, visible: false },
    };
    expect(interpretationExclusions(hiddenPolicies).size).toBe(0);
  });

  it('applies the same exclusions to the wheel’s “What it means” text, including the degree symbol', () => {
    const mars = selectionPlacements(chart, { kind: 'body', key: 'mars', ring: 0 }, new Set(['mars']));
    expect(mars).toEqual([]);
    const sun = selectionPlacements(chart, { kind: 'body', key: 'sun', ring: 0 }, new Set(['mars']));
    for (const item of sun) expect(bodiesNamedBy(item.placement)).not.toContain('mars');
  });

  it('leaves a derived point out of the wheel’s “What it means” text when it is excluded (#721)', () => {
    const fortune = { kind: 'derived', point: 'part-of-fortune' } as const;
    expect(selectionPlacements(chart, fortune).length).toBeGreaterThan(0);
    expect(selectionPlacements(chart, fortune, new Set(['partOfFortune']))).toEqual([]);
    const spirit = { kind: 'derived', point: 'part-of-spirit' } as const;
    expect(selectionPlacements(chart, spirit, new Set(['partOfFortune'])).length).toBeGreaterThan(0);
  });

  it('does not send an excluded body, or its contacts, to the AI model', () => {
    const marsId = bodyByKey('mars')?.id;
    const payload = toTier2ChartPayload(chart, new Set(['mars']));
    expect(payload.positions.some((position) => position.body === marsId)).toBe(false);
    expect(payload.aspects.some((aspect) => aspect.bodyA === marsId || aspect.bodyB === marsId)).toBe(false);
    expect(toTier2ChartPayload(chart).positions.some((position) => position.body === marsId)).toBe(true);
  });
});
