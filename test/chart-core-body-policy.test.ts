// @vitest-environment jsdom
/**
 * End-to-end proof for #585's core and outer planet policy, against the real engine and no mocks:
 * a hidden planet leaves the wheel, the position and aspect tables, the matrix input, and the dignity
 * table; a visible-but-non-participating planet is shown yet never aspects; a hidden-but-participating
 * planet keeps its computed aspects while the displayed list drops them; and the PDF plan and the
 * full export obey the same policy. The PDF and full-export fixtures are copied from
 * `ui-pdf-export-plan.test.ts` and `domain-full-export.test.ts`, since test files cannot import each other.
 */
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bodyByKey } from '../src/astrology/bodies.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../src/astrology/rulership.js';
import {
  DEFAULT_EXTENDED_SETTINGS,
  toChartCalculationOptions,
  toPointVisibilityOptions,
  type ExtendedSettings,
} from '../src/chart/extended-settings.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { aspectRows, chartSheetInput, chartWheelRing, dignityRows, positionRows } from '../src/domain/chart-tables.js';
import { buildFullExport } from '../src/domain/full-export.js';
import type { Person } from '../src/domain/person.js';
import { EMPTY_SELECTION, type PdfSelection } from '../src/domain/pdf-export-sections.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { buildPdfPlan, type PdfPlanContext } from '../src/ui/pdf-export-plan.js';
import { pdfExportMessages } from '../src/ui/pdf-export.messages.js';
import { getEngine } from './engine-harness.js';

const repoRoot = resolve(import.meta.dirname, '..');

/** Serves the already-built `public/corpus/<locale>.json` files, so no real network is touched. */
const corpusFetch: typeof fetch = async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/api/corpus-overrides/')) return new Response(JSON.stringify({ entries: [] }));
  const locale = url.endsWith('/nl.json') ? 'nl' : 'en';
  const body = readFileSync(resolve(repoRoot, 'public/corpus', `${locale}.json`), 'utf8');
  return new Response(body, { status: 200 });
};

const MOMENT: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

const ADA: Person = {
  id: 'p-ada',
  displayName: 'Ada Lovelace',
  placeLabel: 'London, UK',
  timeAccuracy: 'recorded',
  notes: 'Wrote, "the first program".\nSecond line.',
  missing: [],
  moment: {
    civil: { year: 1815, month: 12, day: 10, hour: 7, minute: 45, second: 0 },
    coordinates: { latitude: 51.5072, longitude: -0.1276 },
    offsetOverrideMinutes: 0,
  },
};

const HIDDEN_OUTER_KEYS = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] as const;

/** Mercury visible but not aspecting; the five outer planets hidden and not aspecting. Everything else stays at its default. */
const POLICY_SETTINGS: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  objectPolicies: {
    ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
    mercury: { visible: true, aspectParticipant: false },
    jupiter: { visible: false, aspectParticipant: false },
    saturn: { visible: false, aspectParticipant: false },
    uranus: { visible: false, aspectParticipant: false },
    neptune: { visible: false, aspectParticipant: false },
    pluto: { visible: false, aspectParticipant: false },
  },
};

/** Jupiter hidden but still an aspect participant; every other object at its default. */
const JUPITER_HIDDEN_PARTICIPATING_SETTINGS: ExtendedSettings = {
  ...DEFAULT_EXTENDED_SETTINGS,
  objectPolicies: {
    ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
    jupiter: { visible: false, aspectParticipant: true },
  },
};

function bodyIdOf(key: string): number {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`fixture bug: ${key} missing from BODIES`);
  return body.id;
}

describe('core planet policy: Mercury visible but non-participating (#585)', () => {
  it('shows Mercury in the wheel and position rows, but in no computed aspect', async () => {
    const engine = await getEngine();
    const mercury = bodyIdOf('mercury');
    const options = toChartCalculationOptions(POLICY_SETTINGS);
    const data = await computeChartData(MOMENT, engine, options);
    const visibility = toPointVisibilityOptions(POLICY_SETTINGS);

    // Not vacuous: the chart really does have aspects, just none involving Mercury.
    expect(data.aspects.length).toBeGreaterThan(0);
    expect(data.aspects.some((aspect) => aspect.bodyA === mercury || aspect.bodyB === mercury)).toBe(false);

    expect(chartWheelRing(data, 'Natal', visibility).bodies.some((body) => body.key === 'mercury')).toBe(true);
    expect(positionRows(data, visibility).some((row) => row.bodyKey === 'mercury')).toBe(true);
    expect(aspectRows(data, visibility).some((row) => row.bodyAKey === 'mercury' || row.bodyBKey === 'mercury')).toBe(
      false,
    );
    expect(
      chartWheelRing(data, 'Natal', visibility).aspects?.some(
        (aspect) => aspect.bodyA === mercury || aspect.bodyB === mercury,
      ),
    ).toBe(false);
  }, 30_000);
});

describe('hidden outer planets leave every displayed surface (#585)', () => {
  it('removes Jupiter through Pluto from the wheel, positions, aspects, matrix, and dignities', async () => {
    const engine = await getEngine();
    const options = toChartCalculationOptions(POLICY_SETTINGS);
    const data = await computeChartData(MOMENT, engine, options);
    const visibility = toPointVisibilityOptions(POLICY_SETTINGS);
    const hiddenIds = HIDDEN_OUTER_KEYS.map((key) => bodyIdOf(key));

    // The outer planets are present in the raw computed positions, so the absence below is a display-side filter.
    for (const id of hiddenIds) expect(data.positions.some((position) => position.body === id)).toBe(true);

    const wheelBodies = chartWheelRing(data, 'Natal', visibility).bodies.map((body) => body.key);
    const positionKeys = positionRows(data, visibility).map((row) => row.bodyKey);
    const aspectKeys = aspectRows(data, visibility).flatMap((row) => [row.bodyAKey, row.bodyBKey]);
    const matrix = chartSheetInput(data, [], 'Natal', visibility).matrix;
    const matrixKeys = matrix.bodies.map((body) => body.key);
    const matrixAspectKeys = matrix.aspects.flatMap((aspect) => [aspect.aKey, aspect.bKey]);
    const dignityKeys = dignityRows(data, visibility).map((row) => row.bodyKey);

    for (const key of HIDDEN_OUTER_KEYS) {
      expect(wheelBodies).not.toContain(key);
      expect(positionKeys).not.toContain(key);
      expect(aspectKeys).not.toContain(key);
      expect(matrixKeys).not.toContain(key);
      expect(matrixAspectKeys).not.toContain(key);
      expect(dignityKeys).not.toContain(key);
    }
    // The visible core planets still show, so the filter is not simply emptying everything.
    expect(wheelBodies).toContain('sun');
    expect(positionKeys).toContain('mercury');
    expect(dignityKeys).toContain('mercury');
  }, 30_000);
});

describe('hidden but participating: Jupiter keeps its aspects in the data (#585)', () => {
  it('drops Jupiter from the displayed aspect list while the computed aspects still carry it', async () => {
    const engine = await getEngine();
    const jupiter = bodyIdOf('jupiter');
    const options = toChartCalculationOptions(JUPITER_HIDDEN_PARTICIPATING_SETTINGS);
    const data = await computeChartData(MOMENT, engine, options);
    const visibility = toPointVisibilityOptions(JUPITER_HIDDEN_PARTICIPATING_SETTINGS);
    const hasJupiter = (bodyA: number, bodyB: number): boolean => bodyA === jupiter || bodyB === jupiter;

    // Not vacuous: Jupiter really does aspect something under these settings.
    expect(data.aspects.some((aspect) => hasJupiter(aspect.bodyA, aspect.bodyB))).toBe(true);

    expect(aspectRows(data, visibility).some((row) => row.bodyAKey === 'jupiter' || row.bodyBKey === 'jupiter')).toBe(
      false,
    );
    expect(
      chartWheelRing(data, 'Natal', visibility).aspects?.some((aspect) => hasJupiter(aspect.bodyA, aspect.bodyB)),
    ).toBe(false);
    expect(chartWheelRing(data, 'Natal', visibility).bodies.some((body) => body.key === 'jupiter')).toBe(false);

    // The raw computed data still carries every Jupiter aspect: only the display side changed.
    expect(data.aspects.some((aspect) => hasJupiter(aspect.bodyA, aspect.bodyB))).toBe(true);
  }, 30_000);
});

describe('the same policy reaches the PDF plan and the full export (#585)', () => {
  it('leaves the hidden outer planets out of the PDF chart tables', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      charts: [{ type: 'natal', wheel: false, tables: ['positions', 'aspects'] }],
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: POLICY_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    const positions = section.tables.find((t) => t.caption === chartViewMessages.en.positionsCaption);
    const aspects = section.tables.find((t) => t.caption === chartViewMessages.en.aspectsCaption);
    if (positions === undefined || aspects === undefined) throw new Error('expected positions and aspects tables');

    const positionText = positions.body.flat().join('|');
    const aspectText = aspects.body.flat().join('|');
    expect(positionText).toContain('Mercury');
    for (const name of ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']) {
      expect(positionText).not.toContain(name);
      expect(aspectText).not.toContain(name);
    }
  }, 30_000);

  it('leaves the hidden outer planets out of the full export natal chart', async () => {
    const provider = await getEngine();
    const archive = await buildFullExport({
      people: [ADA],
      provider,
      appVersion: '9.9.9',
      settings: POLICY_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      symbolClass: 'drawn',
      now: new Date('2026-10-04T12:00:00.000Z'),
    });
    const natal = archive.people[0]?.natalChart;
    if (natal === undefined) throw new Error('expected a natal chart in the export');

    const positionKeys = natal.positions.map((row) => row.bodyKey);
    const aspectKeys = natal.aspects.flatMap((row) => [row.bodyAKey, row.bodyBKey]);
    const dignityKeys = natal.dignities.map((row) => row.bodyKey);
    expect(positionKeys).toContain('mercury');
    for (const key of HIDDEN_OUTER_KEYS) {
      expect(positionKeys).not.toContain(key);
      expect(aspectKeys).not.toContain(key);
      expect(dignityKeys).not.toContain(key);
    }
  }, 30_000);
});
