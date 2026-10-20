// @vitest-environment jsdom
/**
 * #722: the chart-contract parity matrix — the audit's (`docs/audit/2026-10-19-1936-ASTROLOGY_REVIEW.md`) central finding is
 * that the numbers are right but a chart's *meaning* can drift between the screen, a share link,
 * a saved default, a full export and a PDF. `calculation-snapshot-parity.test.ts` (#544) pins the
 * settings round-trip for one configuration; this matrix runs several deliberately awkward ones
 * (a hidden outer planet, a custom point, custom moieties, sidereal + Whole Sign, a polar house
 * fallback) through every path and compares each against what the chart screen computes, down to
 * the artifact fingerprints. Real Swiss Ephemeris throughout, no mocks.
 *
 * Known open gaps are `it.todo`s, not assertions, because their intended behaviour is still a
 * decision (#719 PDF object visibility, #721 interpretation participation) — flip them to real
 * assertions in the PR that settles each.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ayanamsaByKey } from '../src/astrology/ayanamsas.js';
import { DEFAULT_RULERSHIP_CHOICE, type RulershipChoice } from '../src/astrology/rulership.js';
import { DEFAULT_EXTENDED_SETTINGS, type ExtendedSettings } from '../src/chart/extended-settings.js';
import {
  buildCalculationSnapshot,
  calculationSnapshotToJson,
  decodeCalculationSnapshot,
  snapshotCalculationOptions,
  type CalculationSnapshot,
} from '../src/domain/calculation-snapshot.js';
import { calculationArtifactIdentity } from '../src/domain/calculation-artifact.js';
import { chartOverview } from '../src/domain/chart-overview.js';
import { computeChartData } from '../src/domain/chart-compute.js';
import { decodeChartShareLink, encodeChartShareLink } from '../src/domain/chart-share.js';
import { buildFullExport } from '../src/domain/full-export.js';
import { EMPTY_SELECTION, type PdfSelection } from '../src/domain/pdf-export-sections.js';
import type { Person } from '../src/domain/person.js';
import type { EphemerisProvider } from '../src/ephemeris/types.js';
import { assembleReport } from '../src/interpretation/report.js';
import { loadRuntimeCorpus } from '../src/interpretation/corpus-client.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { buildChartArtifact } from '../src/ui/chart-artifact.js';
import { chartOverviewRows } from '../src/ui/chart-overview-rows.js';
import {
  readDefaultCalculationProfile,
  resetDefaultCalculationProfileMemory,
  writeDefaultCalculationProfile,
} from '../src/ui/default-calculation-profile.js';
import { buildPdfPlan, type PdfPlanContext } from '../src/ui/pdf-export-plan.js';
import { pdfExportMessages } from '../src/ui/pdf-export.messages.js';
import { bodyShortName } from '../src/ui/astro-names.messages.js';
import { getEngine } from './engine-harness.js';

let engine: EphemerisProvider;
beforeAll(async () => {
  engine = await getEngine();
}, 60_000);

afterEach(() => {
  localStorage.clear();
  resetDefaultCalculationProfileMemory();
});

const repoRoot = resolve(import.meta.dirname, '..');
const corpusFetch: typeof fetch = async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/api/corpus-overrides/')) return new Response(JSON.stringify({ entries: [] }));
  const locale = url.endsWith('/nl.json') ? 'nl' : 'en';
  return new Response(readFileSync(resolve(repoRoot, 'public/corpus', `${locale}.json`), 'utf8'), { status: 200 });
};

const LONDON: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 51.5072, longitude: -0.1276 },
  offsetOverrideMinutes: 60,
};
const ARCTIC: BirthMomentInput = { ...LONDON, coordinates: { latitude: 70, longitude: -8 } };

const FORMULA_POINT = { id: 'fortune-like', name: 'Fortune-like', formula: 'ascendant + moon - sun' };

interface Scenario {
  readonly name: string;
  readonly moment: BirthMomentInput;
  readonly settings: ExtendedSettings;
  readonly rulership: RulershipChoice;
  readonly customPoints: readonly { id: string; name: string; formula: string }[];
  /** The house system the engine is expected to end up with, where it differs from the requested one. */
  readonly fallsBackTo?: 'O';
}

const LAHIRI = ayanamsaByKey('lahiri')?.id ?? 1;

const SCENARIOS: readonly Scenario[] = [
  {
    // The audit's own acceptance configuration.
    name: 'Whole Sign, sidereal Lahiri, true node, custom point, custom moieties, hidden outer planet',
    moment: LONDON,
    settings: {
      ...DEFAULT_EXTENDED_SETTINGS,
      houseSystem: 'W',
      zodiac: { kind: 'sidereal', ayanamsa: LAHIRI },
      nodeVariant: 'true',
      orbRules: { bodyOrbs: { venus: 4, mars: 3 } },
      objectPolicies: {
        ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
        neptune: { visible: false, aspectParticipant: false },
      },
    },
    rulership: 'traditional',
    customPoints: [FORMULA_POINT],
  },
  {
    name: 'tropical Koch, true Lilith, scaled orbs, Ptolemaic bounds, both rulers',
    moment: LONDON,
    settings: {
      ...DEFAULT_EXTENDED_SETTINGS,
      houseSystem: 'K',
      lilithVariant: 'true',
      orbScalePercent: -40,
      boundsScheme: 'ptolemaic',
      midpointsVisible: true,
    },
    rulership: 'both',
    customPoints: [],
  },
  {
    name: 'Placidus at 70°N, where the engine falls back to Porphyry',
    moment: ARCTIC,
    settings: { ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'P' },
    rulership: DEFAULT_RULERSHIP_CHOICE,
    customPoints: [],
    fallsBackTo: 'O',
  },
];

function snapshotOf(s: Scenario): CalculationSnapshot {
  return buildCalculationSnapshot(s.settings, s.rulership, s.customPoints);
}

/** What the Charts page does (`ChartView`): the reference every other path is compared with. */
async function onScreen(s: Scenario) {
  const snapshot = snapshotOf(s);
  const chart = await computeChartData(s.moment, engine, snapshotCalculationOptions(snapshot));
  const artifact = await buildChartArtifact(snapshot, s.moment, chart, engine);
  if (artifact === undefined) throw new Error('fixture bug: no artifact');
  return { snapshot, chart, artifact };
}

function personOf(s: Scenario): Person {
  return {
    id: 'p-parity',
    displayName: 'Parity Fixture',
    placeLabel: 'Somewhere',
    timeAccuracy: 'recorded',
    notes: '',
    missing: [],
    moment: s.moment,
    ...(s.customPoints.length === 0 ? {} : { customPoints: s.customPoints }),
  };
}

describe.each(SCENARIOS)('chart contract parity: $name (#722)', (scenario) => {
  it('is not vacuous: it differs from the app defaults, or exercises the polar house fallback', async () => {
    if (scenario.fallsBackTo === undefined) {
      expect(snapshotOf(scenario)).not.toEqual(
        buildCalculationSnapshot(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE),
      );
      return;
    }
    const { artifact } = await onScreen(scenario);
    expect(artifact.provenance.requestedHouseSystem).toBe(scenario.settings.houseSystem);
    expect(artifact.provenance.effectiveHouseSystem).toBe(scenario.fallsBackTo);
    expect(artifact.provenance.warnings.length).toBeGreaterThan(0);
  });

  it('a share link reproduces the screen’s chart, snapshot and artifact fingerprints', async () => {
    const reference = await onScreen(scenario);
    const query = encodeChartShareLink({
      moment: scenario.moment,
      settings: calculationSnapshotToJson(reference.snapshot),
      housesKnown: true,
    }).toString();
    const received = decodeCalculationSnapshot(decodeChartShareLink(new URLSearchParams(query)).settings);
    expect(received).toEqual(reference.snapshot);

    const chart = await computeChartData(scenario.moment, engine, snapshotCalculationOptions(received));
    expect(chart).toEqual(reference.chart);
    const artifact = await buildChartArtifact(received, scenario.moment, chart, engine);
    expect(artifact?.fingerprint).toEqual(reference.artifact.fingerprint);
  });

  it('a saved default restores the same settings and rulership', () => {
    const { settings, rulership } = snapshotOf(scenario);
    writeDefaultCalculationProfile(settings, rulership);
    const restored = readDefaultCalculationProfile();
    expect(restored?.settings).toEqual(settings);
    expect(restored?.rulership).toBe(rulership);
  });

  it('a full export carries the screen’s artifact and positions', async () => {
    const reference = await onScreen(scenario);
    const archive = await buildFullExport({
      people: [personOf(scenario)],
      provider: engine,
      appVersion: '9.9.9',
      settings: scenario.settings,
      rulership: scenario.rulership,
      symbolClass: 'drawn',
      now: new Date('2026-10-19T00:00:00.000Z'),
    });
    const exported = archive.people[0]?.calculation;
    expect(exported?.fingerprint).toEqual(reference.artifact.fingerprint);
    expect(exported?.snapshot).toEqual(reference.snapshot);
    expect(exported?.provenance.requestedHouseSystem).toBe(reference.artifact.provenance.requestedHouseSystem);
    expect(exported?.provenance.effectiveHouseSystem).toBe(reference.artifact.provenance.effectiveHouseSystem);
    expect(exported?.provenance.warnings).toEqual(reference.artifact.provenance.warnings);
  });

  it('a PDF’s chart page and its reading describe the screen’s chart (#718)', async () => {
    const reference = await onScreen(scenario);
    const context: PdfPlanContext = {
      person: personOf(scenario),
      provider: engine,
      settings: scenario.settings,
      rulership: scenario.rulership,
      locale: 'en',
      aiConsent: false,
      corpusFetch,
    };
    const selection: PdfSelection = {
      personId: 'p-parity',
      ...EMPTY_SELECTION,
      charts: [{ type: 'natal', wheel: false, tables: ['positions'] }],
      interpretation: { base: true, aiCustomised: false },
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);

    // The reading comes before the chart pages in the PDF; find each by kind, not by position.
    const chartPage = plan.sections.find((section) => section.kind === 'chart');
    const overview = plan.sections.find((section) => section.kind === 'fields');
    const reading = plan.sections.filter((section) => section.kind === 'text');
    if (chartPage?.kind !== 'chart') throw new Error('expected a chart page');
    expect(chartPage.provenance).toBe(
      pdfExportMessages.en.calculationFingerprint(calculationArtifactIdentity(reference.artifact)),
    );

    // The overview rows are the screen's own, for the screen's chart.
    if (overview?.kind !== 'fields') throw new Error('expected the chart overview');
    expect(overview.fields).toEqual(
      chartOverviewRows(chartOverview(reference.chart, scenario.rulership), 'en').map((row) => ({
        label: row.term,
        value: row.value,
      })),
    );

    // The reading is assembled from that same chart: same sections, in the same order.
    const corpus = await loadRuntimeCorpus('en', corpusFetch);
    const expected = assembleReport(reference.chart, 'en', corpus, scenario.rulership);
    expect(reading.map((section) => section.heading)).toEqual(expected.sections.map((section) => section.title));
  }, 60_000);
});

describe('object visibility and interpretation participation (#719, #721)', () => {
  // Neptune hidden and left out of the reading: the one configuration the two decisions both govern.
  const hiddenNeptune: ExtendedSettings = {
    ...DEFAULT_EXTENDED_SETTINGS,
    objectPolicies: {
      ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
      neptune: { visible: false, aspectParticipant: false, interpreted: false },
    },
  };

  it('#719: a PDF chart and its tables leave out an object the policy hides', async () => {
    const context: PdfPlanContext = {
      person: personOf({ ...scenarioForVisibility(), settings: hiddenNeptune }),
      provider: engine,
      settings: hiddenNeptune,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      aiConsent: false,
      corpusFetch,
    };
    const selection: PdfSelection = {
      personId: 'p-parity',
      ...EMPTY_SELECTION,
      charts: [{ type: 'natal', wheel: true, tables: ['positions'] }],
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const chartPage = plan.sections.find((section) => section.kind === 'chart');
    if (chartPage?.kind !== 'chart') throw new Error('expected a chart page');
    const tableText = chartPage.tables.flatMap((table) => table.body.flat()).join('|');
    expect(tableText).not.toContain(bodyShortName('neptune', 'en'));
  }, 60_000);

  it('#721: an object excluded from interpretation selects no report prose', async () => {
    const chart = await computeChartData(
      scenarioForVisibility().moment,
      engine,
      snapshotCalculationOptions(snapshotOf({ ...scenarioForVisibility(), settings: hiddenNeptune })),
    );
    const corpus = await loadRuntimeCorpus('en', corpusFetch);
    const full = assembleReport(chart, 'en', corpus, DEFAULT_RULERSHIP_CHOICE, 'natal', new Set());
    const reduced = assembleReport(chart, 'en', corpus, DEFAULT_RULERSHIP_CHOICE, 'natal', new Set(['neptune']));
    const mentionsNeptune = (report: typeof full): boolean =>
      report.sections.some((section) =>
        section.paragraphs.some(
          (p) => p.placement !== undefined && 'body' in p.placement && p.placement.body === 'neptune',
        ),
      );
    expect(mentionsNeptune(full)).toBe(true);
    expect(mentionsNeptune(reduced)).toBe(false);
  }, 60_000);
});

/** The tropical Koch scenario, found by name so reordering the scenario list cannot change what these tests cover. */
function scenarioForVisibility(): Scenario {
  const scenario = SCENARIOS.find((candidate) => candidate.name.startsWith('tropical Koch'));
  if (scenario === undefined) throw new Error('fixture bug: no tropical Koch scenario');
  return scenario;
}
