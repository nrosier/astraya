// @vitest-environment jsdom
/**
 * `buildPdfPlan` (#441) against the real Swiss Ephemeris engine, never a mock: the whole point is
 * that the plan comes from the same compute functions and table columns the on-screen chart uses.
 * `renderPdfPlan` (jsPDF/svg2pdf.js/jspdf-autotable, DOM-only) is covered end to end instead
 * (`e2e/pdf-export-builder.spec.ts`), not here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ayanamsaByKey } from '../src/astrology/ayanamsas.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../src/astrology/rulership.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { CURRENT_SNAPSHOT_VERSION } from '../src/domain/calculation-snapshot.js';
import { TRADITIONAL_ACG_BODY_IDS } from '../src/domain/astrocartography.js';
import {
  EMPTY_SELECTION,
  type PdfChartTable,
  type PdfPrimaryDirectionsSectionOptions,
  type PdfSelection,
} from '../src/domain/pdf-export-sections.js';
import { PrimaryDirectionKey } from '../src/domain/primary-directions.js';
import { primaryDirectionsViewMessages } from '../src/ui/PrimaryDirectionsView.messages.js';
import { timingBasisMessages } from '../src/ui/timing-basis.messages.js';
import { timingTimelineViewMessages } from '../src/ui/TimingTimelineView.messages.js';
import type { Person } from '../src/domain/person.js';
import type { SavedInterpretationDetail } from '../src/interpretation/tier2-client.js';
import { fixedStarsScopeNoteOf } from '../src/ui/ChartView.js';
import { hermeticLotColumns } from '../src/ui/ChartViewPlacements.js';
import { cellText } from '../src/ui/table-sort.js';
import { hermeticLots } from '../src/domain/hermetic-lots.js';
import { degreeParts } from '../src/domain/degree-parts.js';
import { lotFormulaByKey } from '../src/astrology/arabic-parts.js';
import { NATAL_FIXED_STARS, computeChartData } from '../src/domain/chart-compute.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { harmonicViewMessages } from '../src/ui/HarmonicView.messages.js';
import {
  almutenLeadText,
  almutenNameList,
  buildPdfPlan,
  sectionCalculationOptions,
  type PdfParagraphPlan,
  type PdfPlanContext,
  type PdfTextSectionPlan,
} from '../src/ui/pdf-export-plan.js';
import { pdfExportMessages } from '../src/ui/pdf-export.messages.js';
import { solarArcViewMessages } from '../src/ui/SolarArcView.messages.js';
import { getEngine } from './engine-harness.js';
import { computeSecondaryProgression } from '../src/domain/secondary-progression.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';

const repoRoot = resolve(import.meta.dirname, '..');

/** Serves the already-built `public/corpus/<locale>.json` files, so no real network is touched. */
const corpusFetch: typeof fetch = async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/api/corpus-overrides/')) return new Response(JSON.stringify({ entries: [] }));
  const locale = url.endsWith('/nl.json') ? 'nl' : 'en';
  const body = readFileSync(resolve(repoRoot, 'public/corpus', `${locale}.json`), 'utf8');
  return new Response(body, { status: 200 });
};

const ADA: Person = {
  id: 'p-ada',
  displayName: 'Ada Lovelace',
  moment: {
    civil: { year: 1815, month: 12, day: 10, hour: 7, minute: 45, second: 0 },
    coordinates: { latitude: 51.5072, longitude: -0.1276 },
    offsetOverrideMinutes: 0,
  },
  placeLabel: 'London, UK',
  timeAccuracy: 'recorded',
  notes: '',
  missing: [],
};

const CHARLES: Person = {
  id: 'p-charles',
  displayName: 'Charles Babbage',
  moment: {
    civil: { year: 1820, month: 12, day: 26, hour: 10, minute: 0, second: 0 },
    coordinates: { latitude: 51.5072, longitude: -0.1276 },
    offsetOverrideMinutes: 0,
  },
  placeLabel: 'London, UK',
  timeAccuracy: 'recorded',
  notes: '',
  missing: [],
};

const PEOPLE = new Map([
  [ADA.id, ADA],
  [CHARLES.id, CHARLES],
]);

/** A text section's paragraphs in order, whatever body group they sit in (#654). */
function paragraphsOf(section: PdfTextSectionPlan): readonly PdfParagraphPlan[] {
  return section.groups.flatMap((group) => group.paragraphs);
}

describe('buildPdfPlan', () => {
  it('builds nothing but the title when the selection is empty', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = { personId: ADA.id, ...EMPTY_SELECTION };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.sections).toHaveLength(0);
    expect(plan.errors).toHaveLength(0);
    expect(plan.personName).toBe('Ada Lovelace');
  }, 30_000);

  it('includes a birth-record fields section with the stored coordinates and place', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = { personId: ADA.id, ...EMPTY_SELECTION, birthRecord: true };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.sections).toHaveLength(1);
    const [section] = plan.sections;
    if (section?.kind !== 'fields') throw new Error('expected a fields section');
    expect(section.fields.some((f) => f.value.includes('London'))).toBe(true);
    expect(section.fields.some((f) => f.value === 'Recorded (certificate or hospital record)')).toBe(true);
  }, 30_000);

  describe('life events table (#1399)', () => {
    const withEvents = (lifeEvents: Person['lifeEvents'], provider: PdfPlanContext['provider']): PdfPlanContext => ({
      person: { ...ADA, lifeEvents },
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    });
    const selection: PdfSelection = { personId: ADA.id, ...EMPTY_SELECTION, birthRecord: true };

    it('lists events by date, then time, untimed after timed on the same day, after the map', async () => {
      const context = withEvents(
        [
          { id: 'e1', date: '1835-07-08', label: 'Married' },
          { id: 'e2', date: '1833-06-05', label: 'Met Babbage' },
          { id: 'e3', date: '1835-07-08', time: '15:30', label: 'Afternoon' },
          { id: 'e4', date: '1835-07-08', time: '09:00', label: 'Morning' },
        ],
        await getEngine(),
      );
      const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
      const [section] = plan.sections;
      if (section?.kind !== 'fields') throw new Error('expected a fields section');
      expect(section.map).toBeDefined();
      expect(Object.keys(section)).toEqual(['kind', 'heading', 'fields', 'map', 'lifeEvents']);
      expect(section.lifeEvents?.caption).toBe('Life events');
      expect(section.lifeEvents?.head).toEqual(['Date', 'Time', 'Label']);
      expect(section.lifeEvents?.body).toEqual([
        ['1833-06-05', '', 'Met Babbage'],
        ['1835-07-08', '09:00', 'Morning'],
        ['1835-07-08', '15:30', 'Afternoon'],
        ['1835-07-08', '', 'Married'],
      ]);
    }, 30_000);

    it('omits the table when there are no events', async () => {
      const provider = await getEngine();
      for (const lifeEvents of [undefined, []] as const) {
        const plan = await buildPdfPlan(
          selection,
          { ...withEvents(lifeEvents, provider) },
          chartViewMessages.en,
          pdfExportMessages.en,
        );
        const [section] = plan.sections;
        if (section?.kind !== 'fields') throw new Error('expected a fields section');
        expect(section.lifeEvents).toBeUndefined();
      }
    }, 30_000);
  });

  it('builds a natal chart section with a wheel and the requested tables, in sign with reality', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      charts: [{ type: 'natal', wheel: true, tables: ['positions', 'aspects'] }],
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.svg?.markup).toContain('<svg');
    // The name line is the bold lead and the scope note starts the regular hint (#1646, owner decision 2026-11-18).
    expect(section.hintLead?.startsWith(chartViewMessages.en.almutenOfAscendantSentence(''))).toBe(true);
    expect(section.hintLead).not.toContain(chartViewMessages.en.almutenScopeNote);
    expect(section.hint?.startsWith(chartViewMessages.en.almutenScopeNote)).toBe(true);
    expect(section.tables.map((t) => t.caption)).toEqual(
      expect.arrayContaining([chartViewMessages.en.positionsCaption, chartViewMessages.en.aspectsCaption]),
    );
    const positions = section.tables.find((t) => t.caption === chartViewMessages.en.positionsCaption);
    expect(positions?.body.length).toBeGreaterThan(5);
    // Every cell is already a plain string, the same conversion a CSV download uses.
    expect(positions?.body.every((row) => row.every((cell) => typeof cell === 'string'))).toBe(true);
  }, 30_000);

  it('labels the angles AC and MC in the Positions table and the wheel AC, DC, MC, IC, in en and nl (#1649)', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      charts: [{ type: 'natal', wheel: true, tables: ['positions'] }],
    };
    for (const locale of ['en', 'nl'] as const) {
      const context: PdfPlanContext = {
        person: ADA,
        provider,
        settings: DEFAULT_EXTENDED_SETTINGS,
        rulership: DEFAULT_RULERSHIP_CHOICE,
        locale,
        corpusFetch,
      };
      const plan = await buildPdfPlan(selection, context, chartViewMessages[locale], pdfExportMessages[locale]);
      expect(plan.errors).toHaveLength(0);
      const [section] = plan.sections;
      if (section?.kind !== 'chart') throw new Error('expected a chart section');
      const markup = section.svg?.markup ?? '';
      for (const label of ['AC', 'DC', 'MC', 'IC']) expect(markup).toContain(`>${label}<`);
      expect(markup).not.toContain('>ASC<');
      expect(markup).not.toContain('>DSC<');
      const positions = section.tables.find((t) => t.caption === chartViewMessages[locale].positionsCaption);
      if (positions === undefined) throw new Error('expected a Positions table');
      const glyphColumn = positions.head.indexOf(chartViewMessages[locale].symbolLabel);
      expect(glyphColumn).toBeGreaterThanOrEqual(0);
      const glyphs = positions.body.map((row) => row[glyphColumn]);
      expect(glyphs).toContain('AC');
      expect(glyphs).toContain('MC');
    }
  }, 60_000);

  it('gives the almuten name line as the bold lead and starts the hint with the scope note, in en and nl (#1646)', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      charts: [{ type: 'natal', wheel: true, tables: ['positions'] }],
    };
    for (const locale of ['en', 'nl'] as const) {
      const context: PdfPlanContext = {
        person: ADA,
        provider,
        settings: DEFAULT_EXTENDED_SETTINGS,
        rulership: DEFAULT_RULERSHIP_CHOICE,
        locale,
        corpusFetch,
      };
      const plan = await buildPdfPlan(selection, context, chartViewMessages[locale], pdfExportMessages[locale]);
      const [section] = plan.sections;
      if (section?.kind !== 'chart') throw new Error('expected a chart section');
      expect(section.hintLead?.startsWith(chartViewMessages[locale].almutenOfAscendantSentence(''))).toBe(true);
      expect(section.hintLead).not.toContain(chartViewMessages[locale].almutenScopeNote);
      expect(section.hint?.startsWith(chartViewMessages[locale].almutenScopeNote)).toBe(true);
    }
  }, 60_000);

  it('keeps tied almutens on the one bold name line, in en and nl (#1646)', () => {
    for (const locale of ['en', 'nl'] as const) {
      const t = chartViewMessages[locale];
      const lead = almutenLeadText(['sun', 'mars'], t, locale);
      expect(lead).toBe(t.almutenOfAscendantSentence(almutenNameList(['sun', 'mars'], t, locale)));
      expect(lead).not.toContain('\n');
      expect(almutenNameList(['sun', 'mars'], t, locale)).toContain(', ');
    }
  });

  it('names no almuten with the no-almuten text in the lead (#1646)', () => {
    const t = chartViewMessages.en;
    expect(almutenLeadText([], t, 'en')).toBe(t.almutenOfAscendantSentence(t.noAlmuten));
  });

  it('builds a draconic chart from the same person without the Houses table it has no houses change for', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      charts: [{ type: 'draconic', wheel: false, tables: ['positions'] }],
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.svg).toBeUndefined();
    expect(section.tables).toHaveLength(1);
  }, 30_000);

  it('computes a solar return for the chosen year, not the natal year', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      charts: [{ type: 'solar-return', wheel: false, tables: ['positions'], returnYear: 2025 }],
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    expect(plan.sections).toHaveLength(1);
  }, 30_000);

  it('includes the base interpretation report as plain-text paragraphs', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      interpretation: { base: true, aiInterpretationIds: [] },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    // The chart overview first (#691), then the reading as text.
    const [overview, ...reading] = plan.sections;
    if (overview?.kind !== 'fields') throw new Error('expected the overview first');
    expect(overview.heading).toBe('At a glance');
    expect(overview.fields.map((field) => field.label)).toEqual(
      expect.arrayContaining(['Sun', 'Moon', 'Ascendant', 'Chart ruler', 'Temperament']),
    );
    expect(reading.length).toBeGreaterThan(0);
    expect(reading.every((s) => s.kind === 'text' && paragraphsOf(s).length > 0)).toBe(true);
  }, 30_000);

  it.each(['en', 'nl'] as const)(
    'sets each Sabian symbol apart as an image and a labelled reading, and leaves every other paragraph plain (%s, #653)',
    async (locale) => {
      const provider = await getEngine();
      const selection: PdfSelection = {
        personId: ADA.id,
        ...EMPTY_SELECTION,
        interpretation: { base: true, aiInterpretationIds: [] },
      };
      const context: PdfPlanContext = {
        person: ADA,
        provider,
        settings: DEFAULT_EXTENDED_SETTINGS,
        rulership: DEFAULT_RULERSHIP_CHOICE,
        locale,
        corpusFetch,
      };
      const messages = pdfExportMessages[locale];
      const plan = await buildPdfPlan(selection, context, chartViewMessages[locale], messages);
      const paragraphs = plan.sections.flatMap((s) => (s.kind === 'text' ? paragraphsOf(s) : []));
      const sabian = paragraphs.filter((p) => typeof p !== 'string' && 'image' in p);
      // Sun, Moon, Ascendant and Midheaven each get one.
      expect(sabian).toHaveLength(4);
      for (const p of sabian) {
        if (typeof p === 'string' || !('image' in p)) throw new Error('unreachable: filtered to Sabian paragraphs');
        expect(p.image.length).toBeGreaterThan(0);
        expect(p.insight?.length ?? 0).toBeGreaterThan(p.image.length);
        expect(p.insightLabel).toBe(locale === 'en' ? 'Key insight' : 'Kerninzicht');
      }
      expect(paragraphs.length).toBeGreaterThan(sabian.length);
    },
    30_000,
  );

  it.each([
    ['included when the option is on', true, true],
    ['included when the option is absent, the report’s own default', undefined, true],
    ['left out when the option is off', false, false],
  ])(
    'Sabian symbol notes are %s (#660)',
    async (_label, sabianSymbols, expectSabian) => {
      const provider = await getEngine();
      const interpretation = {
        base: true,
        aiInterpretationIds: [],
        ...(sabianSymbols === undefined ? {} : { sabianSymbols }),
      };
      const selection: PdfSelection = { personId: ADA.id, ...EMPTY_SELECTION, interpretation };
      const context: PdfPlanContext = {
        person: ADA,
        provider,
        settings: DEFAULT_EXTENDED_SETTINGS,
        rulership: DEFAULT_RULERSHIP_CHOICE,
        locale: 'en',
        corpusFetch,
      };
      const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
      const paragraphs = plan.sections.flatMap((s) => (s.kind === 'text' ? paragraphsOf(s) : []));
      const sabian = paragraphs.filter((p) => typeof p !== 'string' && 'image' in p);
      expect(sabian.length > 0).toBe(expectSabian);
      // Only the Sabian paragraphs go; the rest of the report is the same either way.
      expect(paragraphs.filter((p) => typeof p === 'string' || !('image' in p)).length).toBeGreaterThan(0);
    },
    30_000,
  );

  describe('saved AI interpretations (#759)', () => {
    const saved = (id: string): SavedInterpretationDetail => ({
      id,
      mode: 'freeform',
      locale: 'en',
      createdAt: '2026-03-10T16:30:00.000Z',
      description: null,
      kind: 'whole-chart',
      basis: null,
      sections: [{ heading: `Heading ${id}`, body: `Body ${id}` }],
    });
    const planWith = async (
      ids: readonly string[],
      fetcher: (id: string) => Promise<SavedInterpretationDetail>,
    ): ReturnType<typeof buildPdfPlan> => {
      const provider = await getEngine();
      const selection: PdfSelection = {
        personId: ADA.id,
        ...EMPTY_SELECTION,
        interpretation: { base: false, aiInterpretationIds: ids },
      };
      const context: PdfPlanContext = {
        person: ADA,
        provider,
        settings: DEFAULT_EXTENDED_SETTINGS,
        rulership: DEFAULT_RULERSHIP_CHOICE,
        locale: 'en',
        savedInterpretation: fetcher,
        corpusFetch,
      };
      return buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    };
    const bodiesOf = (plan: Awaited<ReturnType<typeof buildPdfPlan>>): string[] =>
      plan.sections.flatMap((s) => (s.kind === 'text' ? paragraphsOf(s).map(String) : []));

    it('includes no AI text and never calls the fetcher when no ids are chosen', async () => {
      const fetcher = vi.fn((id: string) => Promise.resolve(saved(id)));
      const plan = await planWith([], fetcher);
      expect(plan.sections).toHaveLength(0);
      expect(plan.errors).toEqual([]);
      expect(fetcher).not.toHaveBeenCalled();
    }, 30_000);

    it('gives exactly one AI section for one id', async () => {
      const fetcher = vi.fn((id: string) => Promise.resolve(saved(id)));
      const plan = await planWith(['a'], fetcher);
      expect(plan.sections).toHaveLength(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(bodiesOf(plan)).toEqual(['Heading a: Body a']);
    }, 30_000);

    it('keeps the chosen order across several ids', async () => {
      const fetcher = vi.fn((id: string) => Promise.resolve(saved(id)));
      const plan = await planWith(['c', 'a', 'b'], fetcher);
      expect(bodiesOf(plan)).toEqual(['Heading c: Body c', 'Heading a: Body a', 'Heading b: Body b']);
    }, 30_000);

    it('records a failed fetch and still builds the other id', async () => {
      const fetcher = vi.fn((id: string) =>
        id === 'bad' ? Promise.reject(new Error('gone')) : Promise.resolve(saved(id)),
      );
      const plan = await planWith(['bad', 'ok'], fetcher);
      expect(bodiesOf(plan)).toEqual(['Heading ok: Body ok']);
      expect(plan.errors).toHaveLength(1);
      expect(plan.errors[0]).toContain('bad');
      expect(plan.errors[0]).toContain('gone');
    }, 30_000);
  });

  it('records an error and keeps the rest of the plan when a person has no birth record at all', async () => {
    const provider = await getEngine();
    const incomplete: Person = {
      id: ADA.id,
      displayName: ADA.displayName,
      placeLabel: '',
      timeAccuracy: 'unknown',
      notes: '',
      missing: ['civil'],
    };
    const selection: PdfSelection = {
      personId: incomplete.id,
      ...EMPTY_SELECTION,
      birthRecord: true,
      charts: [{ type: 'natal', wheel: true, tables: ['positions'] }],
    };
    const context: PdfPlanContext = {
      person: incomplete,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.sections.some((s) => s.kind === 'fields')).toBe(true);
    expect(plan.errors).toHaveLength(1);
  }, 30_000);

  it('builds a synastry section with a bi-wheel, the ranked aspects table, and the relationship summary text (#441, #422)', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      synastry: { partnerId: CHARLES.id, wheel: true, aspectsTable: true, relationshipSummary: true },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
      people: PEOPLE,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [section, summarySection] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.heading).toContain('Ada Lovelace');
    expect(section.heading).toContain('Charles Babbage');
    expect(section.svg?.markup).toContain('<svg');
    expect(section.tables).toHaveLength(1);
    expect(section.tables[0]?.body.length).toBeGreaterThan(0);
    // The interpretation column is already resolved to plain text, same as the live table.
    expect(section.tables[0]?.body.every((row) => row.every((cell) => typeof cell === 'string'))).toBe(true);

    // The no-LLM grouped/ranked text (#422), never the opt-in AI reading: a text section right
    // after the chart, with at least the hint/balance-sentence paragraphs every pairing gets.
    if (summarySection?.kind !== 'text') throw new Error('expected a text section');
    expect(summarySection.heading).toContain('Relationship summary');
    expect(summarySection.heading).toContain('Ada Lovelace');
    expect(summarySection.heading).toContain('Charles Babbage');
    expect(paragraphsOf(summarySection).length).toBeGreaterThanOrEqual(2);
    expect(paragraphsOf(summarySection).every((p) => typeof p === 'string' && p.length > 0)).toBe(true);
  }, 30_000);

  it('omits the relationship summary text when its own checkbox is off, keeping the chart section', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      synastry: { partnerId: CHARLES.id, wheel: true, aspectsTable: true, relationshipSummary: false },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
      people: PEOPLE,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    expect(plan.sections).toHaveLength(1);
    expect(plan.sections[0]?.kind).toBe('chart');
  }, 30_000);

  it('skips synastry with an error, not a crash, when the partner cannot be found', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      synastry: { partnerId: 'p-does-not-exist', wheel: true, aspectsTable: true, relationshipSummary: true },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
      people: PEOPLE,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.sections).toHaveLength(0);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]).toContain('Synastry');
  }, 30_000);

  it('builds a composite section as a single synthetic chart with the requested tables (#441)', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      composite: { partnerId: CHARLES.id, wheel: true, tables: ['positions', 'aspects'] },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
      people: PEOPLE,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.heading).toContain('Ada Lovelace');
    expect(section.heading).toContain('Charles Babbage');
    expect(section.svg?.markup).toContain('<svg');
    expect(section.tables.map((t) => t.caption)).toEqual(
      expect.arrayContaining([chartViewMessages.en.positionsCaption, chartViewMessages.en.aspectsCaption]),
    );
  }, 30_000);

  it('builds a secondary progressions section with both tables and the MC method noted (#441)', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      progressions: {
        technique: 'secondary',
        mcMethod: 'naibod',
        positionsTable: true,
        contactsTable: true,
        asOfDate: '2025-01-01',
      },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.heading).toContain('Ada Lovelace');
    expect(section.hint).toContain('Naibod');
    expect(section.tables).toHaveLength(2);
    expect(section.tables.every((table) => table.body.length > 0)).toBe(true);
    expect(
      section.tables.every((table) => table.body.every((row) => row.every((cell) => typeof cell === 'string'))),
    ).toBe(true);
  }, 30_000);

  it('builds a minor-progressions section with no MC method hint, since minor progressions have none', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      progressions: {
        technique: 'minor',
        mcMethod: 'naibod',
        positionsTable: true,
        contactsTable: false,
        asOfDate: '2025-01-01',
      },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.hint).toBeUndefined();
    expect(section.tables).toHaveLength(1);
  }, 30_000);

  it('builds a solar arc section with correctly-formatted exact contact dates (#441)', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      solarArc: { positionsTable: true, contactsTable: true, asOfDate: '2025-01-01' },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.tables).toHaveLength(2);
    const contacts = section.tables[1];
    const exactColumn = contacts?.head.findIndex((label) => label === solarArcViewMessages.en.exactOnLabel);
    expect(exactColumn).toBeGreaterThanOrEqual(0);
    // The exact-date column must come through as the formatted date string (`formatExactDate`:
    // `YYYY-MM-DD` or the "unknown" fallback), never the raw Julian Day number `exactJd`'s own
    // `valueOf` would otherwise stringify to.
    expect(contacts?.body.length).toBeGreaterThan(0);
    expect(
      contacts?.body.every((row) => {
        const cell = row[exactColumn ?? -1];
        return (
          cell !== undefined && (/^\d{4}-\d{2}-\d{2}$/.test(cell) || cell === solarArcViewMessages.en.exactOnUnknown)
        );
      }),
    ).toBe(true);
  }, 30_000);

  it("reads the solar arc and secondary progressions sections in the person's zodiac (#1492, #1935)", async () => {
    const provider = await getEngine();
    const lahiri = ayanamsaByKey('lahiri')?.id;
    if (lahiri === undefined) throw new Error('expected the Lahiri ayanamsa');
    const sidereal = { ...DEFAULT_EXTENDED_SETTINGS, zodiac: { kind: 'sidereal' as const, ayanamsa: lahiri } };
    async function tablesOf(settings: typeof DEFAULT_EXTENDED_SETTINGS, part: Partial<PdfSelection>) {
      const selection: PdfSelection = { personId: ADA.id, ...EMPTY_SELECTION, ...part };
      const context: PdfPlanContext = {
        person: ADA,
        provider,
        settings,
        rulership: DEFAULT_RULERSHIP_CHOICE,
        locale: 'en',
        corpusFetch,
      };
      const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
      expect(plan.errors).toHaveLength(0);
      const [section] = plan.sections;
      if (section?.kind !== 'chart') throw new Error('expected a chart section');
      return section.tables.map((table) => table.body);
    }
    const solarArc = { solarArc: { positionsTable: true, contactsTable: false, asOfDate: '2025-01-01' } };
    expect(await tablesOf(sidereal, solarArc)).not.toEqual(await tablesOf(DEFAULT_EXTENDED_SETTINGS, solarArc));
    const progressions = {
      progressions: {
        technique: 'secondary' as const,
        mcMethod: 'naibod' as const,
        positionsTable: true,
        contactsTable: false,
        asOfDate: '2025-01-01',
      },
    };
    // #1935: the progressions section now reads the person's zodiac too, so the sidereal tables differ from the tropical ones.
    expect(await tablesOf(sidereal, progressions)).not.toEqual(await tablesOf(DEFAULT_EXTENDED_SETTINGS, progressions));
    // The stronger check: the sidereal progressed angles are the tropical ones minus the ayanamsa, to the arcsecond
    // (natal 1990-06-15 14:30 UTC+2, 45N 5E, Placidus, as of 2020-06-15), for the same zodiac the section is given.
    const natal = {
      civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
      coordinates: { latitude: 45, longitude: 5 },
      offsetOverrideMinutes: 120,
    };
    const targetJd = await provider.julianDayFromUtc(2020, 6, 15, 12, 0, 0);
    const zodiac = { kind: 'sidereal' as const, ayanamsa: lahiri };
    const gap = (a: number, b: number): number => Math.abs(((((a - b) % 360) + 540) % 360) - 180) * 3600;
    const natalJd = await julianDayFor(provider, resolveMoment(natal));
    for (const mcMethod of ['quotidian', 'naibod'] as const) {
      const tropical = await computeSecondaryProgression(natal, targetJd, provider, { mcMethod });
      const sid = await computeSecondaryProgression(natal, targetJd, provider, { mcMethod, zodiac });
      const atProgressed = await provider.ayanamsa(sid.progressedJd, lahiri);
      const atNatal = await provider.ayanamsa(natalJd, lahiri);
      // Quotidian reads both angles at the progressed date. The Naibod MC is the natal sidereal MC plus the arc, so it
      // is anchored to the natal ayanamsa, while the angles derived from it use the progressed-date ayanamsa.
      const mcAyanamsa = mcMethod === 'quotidian' ? atProgressed : atNatal;
      expect(gap(sid.houses.midheaven, tropical.houses.midheaven - mcAyanamsa)).toBeLessThan(1);
      expect(gap(sid.houses.ascendant, tropical.houses.ascendant - atProgressed)).toBeLessThan(
        mcMethod === 'quotidian' ? 1 : 10,
      );
      expect(gap(sid.houses.ascendant, tropical.houses.ascendant)).toBeGreaterThan(20 * 3600);
    }
  }, 60_000);

  it('notes the rigid angle shift in the progressions hint for a user-defined ayanamsa only (#1935)', async () => {
    const provider = await getEngine();
    const lahiri = ayanamsaByKey('lahiri')?.id;
    if (lahiri === undefined) throw new Error('expected the Lahiri ayanamsa');
    const userDefined = {
      ...DEFAULT_EXTENDED_SETTINGS,
      zodiac: { kind: 'sidereal' as const, ayanamsa: 255, user: { referenceDate: '2000-01-01', degrees: 24 } },
    };
    const builtIn = { ...DEFAULT_EXTENDED_SETTINGS, zodiac: { kind: 'sidereal' as const, ayanamsa: lahiri } };
    async function hintOf(settings: typeof DEFAULT_EXTENDED_SETTINGS, mcMethod: 'naibod' | 'quotidian') {
      const selection: PdfSelection = {
        personId: ADA.id,
        ...EMPTY_SELECTION,
        progressions: {
          technique: 'secondary',
          mcMethod,
          positionsTable: true,
          contactsTable: false,
          asOfDate: '2025-01-01',
        },
      };
      const context: PdfPlanContext = {
        person: ADA,
        provider,
        settings,
        rulership: DEFAULT_RULERSHIP_CHOICE,
        locale: 'en',
        corpusFetch,
      };
      const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
      expect(plan.errors).toHaveLength(0);
      const [section] = plan.sections;
      if (section?.kind !== 'chart') throw new Error('expected a chart section');
      return section.hint ?? '';
    }
    const note = timingTimelineViewMessages.en.progressedAnglesRigidNote;
    expect(await hintOf(userDefined, 'naibod')).toContain(note);
    expect(await hintOf(userDefined, 'quotidian')).not.toContain(note);
    expect(await hintOf(builtIn, 'naibod')).not.toContain(note);
    expect(await hintOf(DEFAULT_EXTENDED_SETTINGS, 'naibod')).not.toContain(note);
  }, 90_000);

  it('builds a profections section with the year/month table and profected-house meanings (#441)', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      profections: { table: true, meanings: true, asOfDate: '2025-01-01' },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [chartSection, fieldsSection] = plan.sections;
    if (chartSection?.kind !== 'chart') throw new Error('expected a chart section');
    expect(chartSection.tables).toHaveLength(1);
    expect(chartSection.tables[0]?.body).toHaveLength(2);

    if (fieldsSection?.kind !== 'fields') throw new Error('expected a fields section');
    expect(fieldsSection.fields).toHaveLength(2);
    expect(fieldsSection.fields.every((field) => field.value.length > 0)).toBe(true);
  }, 30_000);

  it('omits the profections meanings section when its checkbox is off, keeping the table', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      profections: { table: true, meanings: false, asOfDate: '2025-01-01' },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    expect(plan.sections).toHaveLength(1);
    expect(plan.sections[0]?.kind).toBe('chart');
  }, 30_000);

  it('builds an astrocartography section with a rendered map and per-line meanings (#441)', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      astrocartography: {
        map: true,
        lineTypes: ['MC', 'AC'],
        bodies: TRADITIONAL_ACG_BODY_IDS.slice(0, 2),
        localSpace: false,
        meanings: true,
      },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [chartSection, fieldsSection] = plan.sections;
    if (chartSection?.kind !== 'chart') throw new Error('expected a chart section');
    expect(chartSection.heading).toContain('Ada Lovelace');
    expect(chartSection.svg?.markup).toContain('<svg');

    if (fieldsSection?.kind !== 'fields') throw new Error('expected a fields section');
    // 2 bodies x 2 line types.
    expect(fieldsSection.fields).toHaveLength(4);
    expect(fieldsSection.fields.every((field) => field.value.length > 0)).toBe(true);
  }, 30_000);

  it('skips astrocartography meanings when there are no bodies or line types chosen', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      astrocartography: { map: true, lineTypes: [], bodies: [], localSpace: false, meanings: true },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    expect(plan.sections).toHaveLength(1);
    expect(plan.sections[0]?.kind).toBe('chart');
  }, 30_000);

  it('builds a transits section with a bi-wheel and the contacts table (#441)', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      transits: { filterPreset: 'important', wheel: true, aspectsTable: true, asOfDate: '2025-01-01' },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.heading).toContain('Ada Lovelace');
    expect(section.svg?.markup).toContain('<svg');
    expect(section.tables).toHaveLength(1);
  }, 30_000);

  it('builds a forecast section with only the ticked tiers', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      forecast: {
        filterPreset: 'important',
        daily: true,
        weekly: false,
        monthly: false,
        yearly: false,
        asOfDate: '2025-01-01',
      },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    expect(plan.sections.length).toBeGreaterThan(0);
    expect(plan.sections.every((section) => section.kind === 'chart' || section.kind === 'text')).toBe(true);
  }, 30_000);

  it('fills table cells with the text the screen shows, not the sort value (#664)', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      charts: [{ type: 'natal', wheel: false, tables: ['aspects'] }],
      forecast: {
        filterPreset: 'all',
        daily: true,
        weekly: true,
        monthly: true,
        yearly: false,
        asOfDate: '2025-01-01',
      },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const cells = plan.sections.flatMap((section) =>
      section.kind === 'chart' ? section.tables.flatMap((table) => table.body.flat()) : [],
    );
    expect(cells.length).toBeGreaterThan(0);
    // A Julian day (`2460676.5…`), an unrounded float (`1.560225…`) or a bare boolean is a sort value leaking through.
    expect(cells.filter((cell) => /^\d{7}\.\d+$|\d\.\d{4,}|^(true|false)$/.test(cell))).toEqual([]);
    const aspects = plan.sections
      .flatMap((section) => (section.kind === 'chart' ? section.tables : []))
      .find((table) => table.caption === chartViewMessages.en.aspectsCaption);
    const orbColumn = aspects?.head.indexOf(chartViewMessages.en.orbLabel) ?? -1;
    expect(orbColumn).toBeGreaterThanOrEqual(0);
    expect(aspects?.body.every((row) => (row[orbColumn] ?? '').includes('°'))).toBe(true);
  }, 30_000);

  it('builds an eclipses section listing eclipses in the given span, with natal contacts for a known birth time (#441, #484)', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      eclipses: { table: true, fromYear: 2023, toYear: 2024 },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.heading).toContain('Ada Lovelace');
    expect(section.svg).toBeUndefined();
    expect(section.tables).toHaveLength(1);
    const table = section.tables[0];
    expect(table?.body.length).toBeGreaterThan(0);
    expect(table?.body.every((row) => row.every((cell) => typeof cell === 'string'))).toBe(true);
    // At least one row names a real natal contact — Ada has a complete, known-time birth record.
    expect(table?.body.some((row) => row[3] !== '—')).toBe(true);
  }, 30_000);

  it('builds an eclipses section with no contacts column content when no person is given a complete birth record', async () => {
    const provider = await getEngine();
    const NO_RECORD: Person = {
      id: 'p-no-record',
      displayName: 'No Record',
      placeLabel: '',
      timeAccuracy: 'unknown',
      notes: '',
      missing: [],
    };
    const selection: PdfSelection = {
      personId: NO_RECORD.id,
      ...EMPTY_SELECTION,
      eclipses: { table: true, fromYear: 2023, toYear: 2024 },
    };
    const context: PdfPlanContext = {
      person: NO_RECORD,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    const table = section.tables[0];
    expect(table?.body.length).toBeGreaterThan(0);
    expect(table?.body.every((row) => row[3] === '—')).toBe(true);
  }, 30_000);
});

describe('PDF chart sections use the Charts page’s own calculation settings (#582)', () => {
  const WITH_POINT: Person = {
    ...ADA,
    customPoints: [{ id: 'fortune-like', name: 'Fortune-like', formula: 'ascendant + moon - sun' }],
  };
  const WHOLE_SIGN = { ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'W' };

  async function natalSection(person: Person, settings: typeof DEFAULT_EXTENDED_SETTINGS) {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: person.id,
      ...EMPTY_SELECTION,
      charts: [{ type: 'natal', wheel: false, tables: ['positions', 'houses'] }],
    };
    const context: PdfPlanContext = {
      person,
      provider,
      settings,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    return section;
  }

  it('draws the natal houses in the house system in force, not always Placidus', async () => {
    const placidus = await natalSection(ADA, DEFAULT_EXTENDED_SETTINGS);
    const wholeSign = await natalSection(ADA, WHOLE_SIGN);
    const housesOf = (section: Awaited<ReturnType<typeof natalSection>>) =>
      section.tables.find((table) => table.caption === chartViewMessages.en.housesCaption)?.body;
    expect(housesOf(placidus)).toBeDefined();
    expect(housesOf(wholeSign)).not.toEqual(housesOf(placidus));
  }, 30_000);

  it('includes the person’s custom points in the natal positions, as the chart screen does', async () => {
    const section = await natalSection(WITH_POINT, DEFAULT_EXTENDED_SETTINGS);
    const positions = section.tables.find((table) => table.caption === chartViewMessages.en.positionsCaption);
    expect(positions?.body.some((row) => row.includes('Fortune-like'))).toBe(true);
  }, 30_000);

  it('prints the natal calculation fingerprint, which changes with the settings', async () => {
    const placidus = await natalSection(ADA, DEFAULT_EXTENDED_SETTINGS);
    const wholeSign = await natalSection(ADA, WHOLE_SIGN);
    expect(placidus.provenance).toMatch(
      new RegExp(`^Calculation fingerprint: v${String(CURRENT_SNAPSHOT_VERSION)}-[0-9a-f]{12}/[0-9a-f]{12}$`),
    );
    expect(wholeSign.provenance).not.toBe(placidus.provenance);
  }, 30_000);

  async function natalPlan(settings: typeof DEFAULT_EXTENDED_SETTINGS, tables: readonly string[], wheel: boolean) {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      charts: [{ type: 'natal', wheel, tables: tables as never }],
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const built = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    const [section] = built.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    return section;
  }

  it('mirrors the chart’s object policy: a body hidden on screen is absent from the PDF wheel and the tables the screen filters (#719)', async () => {
    const hidden: typeof DEFAULT_EXTENDED_SETTINGS = {
      ...DEFAULT_EXTENDED_SETTINGS,
      objectPolicies: {
        ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
        neptune: { visible: false, aspectParticipant: true },
      },
    };
    const all = ['positions', 'houses', 'aspects', 'dignities', 'derived'];
    // The tables the Charts page filters by the object policy. Declinations and the dispositor
    // chains name hidden bodies on screen too (their row builders take no visibility), so the PDF
    // matches the screen there rather than diverging from it.
    const filtered = (section: Awaited<ReturnType<typeof natalPlan>>) =>
      section.tables.filter((table) =>
        [
          chartViewMessages.en.positionsCaption,
          chartViewMessages.en.aspectsCaption,
          chartViewMessages.en.dignitiesCaption,
          chartViewMessages.en.derivedPointsCaption,
        ].includes(table.caption),
      );
    const mentionsNeptune = (section: Awaited<ReturnType<typeof natalPlan>>): boolean =>
      filtered(section).some((table) => table.body.some((row) => row.some((cell) => /neptune/i.test(cell))));
    const shown = await natalPlan(DEFAULT_EXTENDED_SETTINGS, all, true);
    const mirrored = await natalPlan(hidden, all, true);
    // Guard against a vacuous pass: with the default policy Neptune is in those tables and the wheel.
    expect(filtered(shown)).toHaveLength(4);
    expect(mentionsNeptune(shown)).toBe(true);
    expect(mentionsNeptune(mirrored)).toBe(false);
    expect(mirrored.svg?.markup).not.toBe(shown.svg?.markup);
  }, 60_000);

  it('uses the chart’s bounds scheme and midpoint gates, as the Charts page does (#719)', async () => {
    const midpointCaption = chartViewMessages.en.allMidpointsCaption;
    const off = await natalPlan(DEFAULT_EXTENDED_SETTINGS, ['dignities', 'derived'], false);
    const on = await natalPlan(
      { ...DEFAULT_EXTENDED_SETTINGS, midpointsVisible: true },
      ['dignities', 'derived'],
      false,
    );
    expect(off.tables.some((table) => table.caption === midpointCaption)).toBe(false);
    expect(on.tables.some((table) => table.caption === midpointCaption)).toBe(true);
    const egyptian = await natalPlan({ ...DEFAULT_EXTENDED_SETTINGS, boundsScheme: 'egyptian' }, ['dignities'], false);
    const ptolemaic = await natalPlan(
      { ...DEFAULT_EXTENDED_SETTINGS, boundsScheme: 'ptolemaic' },
      ['dignities'],
      false,
    );
    const dignities = (section: typeof egyptian) =>
      section.tables.find((table) => table.caption === chartViewMessages.en.dignitiesCaption)?.body;
    expect(dignities(ptolemaic)).not.toEqual(dignities(egyptian));
  }, 60_000);

  it('reads the interpretation from the same chart the natal section draws, not a default-settings recompute (#718)', async () => {
    const provider = await getEngine();
    const lahiri = ayanamsaByKey('lahiri')?.id;
    if (lahiri === undefined) throw new Error('expected the Lahiri ayanamsa');
    const SIDEREAL_WHOLE_SIGN = { ...WHOLE_SIGN, zodiac: { kind: 'sidereal' as const, ayanamsa: lahiri } };
    async function overviewAndReading(settings: typeof DEFAULT_EXTENDED_SETTINGS) {
      const selection: PdfSelection = {
        personId: ADA.id,
        ...EMPTY_SELECTION,
        interpretation: { base: true, aiInterpretationIds: [] },
      };
      const context: PdfPlanContext = {
        person: ADA,
        provider,
        settings,
        rulership: DEFAULT_RULERSHIP_CHOICE,
        locale: 'en',
        corpusFetch,
      };
      const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
      const [overview, ...reading] = plan.sections;
      if (overview?.kind !== 'fields') throw new Error('expected the overview first');
      const sun = overview.fields.find((field) => field.label === 'Sun')?.value;
      return { sun, reading: JSON.stringify(reading) };
    }
    const tropical = await overviewAndReading(DEFAULT_EXTENDED_SETTINGS);
    const sidereal = await overviewAndReading(SIDEREAL_WHOLE_SIGN);
    // Ada's tropical Sun is in Sagittarius; with Lahiri's ~21° ayanamsa in 1815 it falls in Scorpio.
    expect(tropical.sun).toMatch(/Sagittarius/);
    expect(sidereal.sun).toMatch(/Scorpio/);
    expect(sidereal.reading).not.toBe(tropical.reading);
  }, 60_000);

  it('leaves an object excluded from the reading out of the PDF reading too (#721)', async () => {
    const provider = await getEngine();
    async function readingMentionsMars(settings: typeof DEFAULT_EXTENDED_SETTINGS): Promise<boolean> {
      const selection: PdfSelection = {
        personId: ADA.id,
        ...EMPTY_SELECTION,
        interpretation: { base: true, aiInterpretationIds: [] },
      };
      const context: PdfPlanContext = {
        person: ADA,
        provider,
        settings,
        rulership: DEFAULT_RULERSHIP_CHOICE,
        locale: 'en',
        corpusFetch,
      };
      const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
      // A body with one paragraph gets no group heading, so look at every paragraph's own label too.
      return plan.sections.some(
        (section) =>
          section.kind === 'text' &&
          section.groups.some(
            (group) =>
              group.body === 'Mars' ||
              group.paragraphs.some(
                (paragraph) =>
                  typeof paragraph === 'object' && 'label' in paragraph && /\bMars\b/.test(paragraph.label),
              ),
          ),
      );
    }
    expect(await readingMentionsMars(DEFAULT_EXTENDED_SETTINGS)).toBe(true);
    expect(
      await readingMentionsMars({
        ...DEFAULT_EXTENDED_SETTINGS,
        objectPolicies: {
          ...DEFAULT_EXTENDED_SETTINGS.objectPolicies,
          mars: { visible: true, aspectParticipant: true, interpreted: false },
        },
      }),
    ).toBe(false);
  }, 60_000);

  it('maps each chart type to the options its own Charts-page view uses', () => {
    const options = (type: Parameters<typeof sectionCalculationOptions>[0]) =>
      sectionCalculationOptions(type, WITH_POINT, WHOLE_SIGN, 'traditional');
    expect(options('natal')).toMatchObject({ houseSystem: 'W', rulership: 'traditional' });
    expect(options('natal').customPoints).toEqual(WITH_POINT.customPoints);
    for (const type of ['solar-return', 'lunar-return'] as const) {
      expect(options(type)).toMatchObject({ houseSystem: 'W', rulership: 'traditional' });
      expect(options(type).customPoints).toBeUndefined();
    }
    for (const type of ['draconic', 'harmonic', 'relocated'] as const) {
      expect(options(type).houseSystem).toBeUndefined();
      expect(options(type).customPoints).toEqual(WITH_POINT.customPoints);
    }
  });
});

describe('specialist limits in the PDF (#725)', () => {
  const contextFor = async (locale: 'en' | 'nl'): Promise<PdfPlanContext> => ({
    person: ADA,
    provider: await getEngine(),
    settings: DEFAULT_EXTENDED_SETTINGS,
    rulership: DEFAULT_RULERSHIP_CHOICE,
    locale,
    corpusFetch,
  });

  it('prints the D10 convention note on a tenth-harmonic section, in the document language, and not on others', async () => {
    for (const locale of ['en', 'nl'] as const) {
      const context = await contextFor(locale);
      const plan = await buildPdfPlan(
        {
          personId: ADA.id,
          ...EMPTY_SELECTION,
          charts: [
            { type: 'harmonic', wheel: false, tables: ['positions'], harmonicN: 10 },
            { type: 'harmonic', wheel: false, tables: ['positions'], harmonicN: 9 },
          ],
        },
        context,
        chartViewMessages[locale],
        pdfExportMessages[locale],
      );
      expect(plan.errors).toHaveLength(0);
      const [d10, d9] = plan.sections;
      if (d10?.kind !== 'chart' || d9?.kind !== 'chart') throw new Error('expected two chart sections');
      expect(d10.hint).toContain(harmonicViewMessages[locale].d10Note);
      expect(d9.hint ?? '').not.toContain(harmonicViewMessages[locale].d10Note);
    }
  }, 60_000);

  it('prints the fixed-star scope note under the fixed-stars table', async () => {
    // A day when the Sun is within a degree of Regulus, so the table exists.
    const person: Person = {
      ...ADA,
      moment: {
        civil: { year: 2000, month: 8, day: 22, hour: 12, minute: 0, second: 0 },
        coordinates: { latitude: 51.5072, longitude: -0.1276 },
        offsetOverrideMinutes: 0,
      },
    };
    for (const locale of ['en', 'nl'] as const) {
      const context = { ...(await contextFor(locale)), person };
      const plan = await buildPdfPlan(
        { personId: ADA.id, ...EMPTY_SELECTION, charts: [{ type: 'natal', wheel: false, tables: ['aspects'] }] },
        context,
        chartViewMessages[locale],
        pdfExportMessages[locale],
      );
      const [section] = plan.sections;
      if (section?.kind !== 'chart') throw new Error('expected a chart section');
      const stars = section.tables.find((table) => table.caption === chartViewMessages[locale].fixedStarsCaption);
      expect(stars?.note).toBe(fixedStarsScopeNoteOf(chartViewMessages[locale]));
      for (const star of NATAL_FIXED_STARS) expect(stars?.note).toContain(star);
      expect(section.tables.filter((table) => table !== stars).every((table) => table.note === undefined)).toBe(true);
    }
  }, 60_000);

  it('adds no aspect-patterns section: the PDF does not include them, so there is no note to carry', async () => {
    const plan = await buildPdfPlan(
      { personId: ADA.id, ...EMPTY_SELECTION, charts: [{ type: 'natal', wheel: false, tables: ['aspects'] }] },
      await contextFor('en'),
      chartViewMessages.en,
      pdfExportMessages.en,
    );
    const captions = plan.sections.flatMap((section) =>
      section.kind === 'chart' ? section.tables.map((t) => t.caption) : [],
    );
    expect(captions).not.toContain(chartViewMessages.en.aspectPatternsHeading);
  }, 30_000);
});

describe('view tables in the PDF (#915)', () => {
  const planFor = async (tables: readonly PdfChartTable[]) => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      charts: [{ type: 'natal', wheel: false, tables }],
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    return buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
  };

  it('keeps the aspects key output unchanged: the aspects table, then fixed stars inside it', async () => {
    const plan = await planFor(['aspects']);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.tables[0]?.caption).toBe(chartViewMessages.en.aspectsCaption);
    expect(section.tables.map((table) => table.caption)).toContain(chartViewMessages.en.fixedStarsCaption);
  }, 30_000);

  it('gives the fixed-stars key its own table, with no aspects table', async () => {
    const plan = await planFor(['fixed-stars']);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.tables.length).toBeGreaterThan(0);
    expect(section.tables.every((table) => table.caption === chartViewMessages.en.fixedStarsCaption)).toBe(true);
  }, 30_000);

  it('renders the elements key as the emphasis table', async () => {
    const plan = await planFor(['elements']);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.tables.map((table) => table.caption)).toEqual([chartViewMessages.en.emphasisCaption]);
    expect(section.tables[0]?.body.length).toBeGreaterThan(0);
  }, 30_000);

  it('renders the matrix key as a table of aspect pairs', async () => {
    const plan = await planFor(['matrix']);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.tables.map((table) => table.caption)).toEqual([chartViewMessages.en.matrixLabel]);
    expect(section.tables[0]?.body.length).toBeGreaterThan(0);
  }, 30_000);

  it('renders the shape key as a text summary in the section, with no table', async () => {
    const plan = await planFor(['shape']);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.tables).toHaveLength(0);
    expect(section.hint).toContain(chartViewMessages.en.sectKeyLabel);
    expect(section.hint).toContain(chartViewMessages.en.lunarPhaseKeyLabel);
  }, 30_000);
});

describe('Hermetic lots table in the PDF (#1797)', () => {
  // The same London day and night moments as test/chart-paulus-lots.test.ts (#740).
  const LONDON = {
    coordinates: { latitude: 51.5072, longitude: -0.1276 },
    offsetOverrideMinutes: 60,
  } as const;
  const DAY_MOMENT = { ...LONDON, civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 } };
  const NIGHT_MOMENT = { ...LONDON, civil: { year: 1990, month: 6, day: 15, hour: 2, minute: 30, second: 0 } };
  const LONDON_DAY: Person = {
    id: 'p-lots-day',
    displayName: 'Lots Day',
    moment: DAY_MOMENT,
    placeLabel: 'London, UK',
    timeAccuracy: 'recorded',
    notes: '',
    missing: [],
  };
  const LONDON_NIGHT: Person = { ...LONDON_DAY, id: 'p-lots-night', displayName: 'Lots Night', moment: NIGHT_MOMENT };

  const derivedSection = async (person: Person) => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: person.id,
      ...EMPTY_SELECTION,
      charts: [{ type: 'natal', wheel: false, tables: ['derived'] }],
    };
    const context: PdfPlanContext = {
      person,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      corpusFetch,
    };
    const built = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    const [section] = built.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    return section;
  };

  it('puts the Hermetic lots table right after the Derived points table, with five rows in Paulus order (guards placement and order)', async () => {
    const section = await derivedSection(LONDON_DAY);
    const captions = section.tables.map((table) => table.caption);
    expect(captions.indexOf(chartViewMessages.en.hermeticLotsCaption)).toBe(
      captions.indexOf(chartViewMessages.en.derivedPointsCaption) + 1,
    );
    const hermetic = section.tables.find((table) => table.caption === chartViewMessages.en.hermeticLotsCaption);
    const names = chartViewMessages.en.hermeticLotNames;
    expect(hermetic?.body.map((row) => row[0])).toEqual([
      names['lot-of-eros'],
      names['lot-of-necessity'],
      names['lot-of-courage'],
      names['lot-of-victory'],
      names['lot-of-nemesis'],
    ]);
  }, 60_000);

  it('prints the same cell text as the screen, with the Paulus authority as the source note (guards mirrors-the-screen and the verbatim rule)', async () => {
    const section = await derivedSection(LONDON_DAY);
    const hermetic = section.tables.find((table) => table.caption === chartViewMessages.en.hermeticLotsCaption);
    const chart = await computeChartData(DAY_MOMENT, await getEngine());
    const columns = hermeticLotColumns(chartViewMessages.en, 'en', chart.sect);
    const screenRows = hermeticLots(chart).map((row) => ({
      ...row,
      label: chartViewMessages.en.hermeticLotNames[row.key],
      ...degreeParts(row.longitude),
    }));
    expect(hermetic?.body).toEqual(screenRows.map((row) => columns.map((column) => cellText(column, row))));
    expect(hermetic?.note).toBe(lotFormulaByKey('lot-of-eros')?.authority);
  }, 60_000);

  it('uses the night formula in the Formula cell for a night chart and the day formula for a day chart (guards sect)', async () => {
    const erosFormulaCell = async (person: Person) => {
      const section = await derivedSection(person);
      const hermetic = section.tables.find((table) => table.caption === chartViewMessages.en.hermeticLotsCaption);
      return hermetic?.body[0]?.[hermetic.head.length - 1];
    };
    const eros = lotFormulaByKey('lot-of-eros');
    expect(await erosFormulaCell(LONDON_DAY)).toBe(eros?.dayFormula);
    expect(await erosFormulaCell(LONDON_NIGHT)).toBe(eros?.nightFormula);
  }, 60_000);
});

describe('primary directions section in the PDF (#1845)', () => {
  const provider = () => getEngine();
  /** Einstein, born 1879-03-14 10:50:02 UT at Ulm (the NASA/Espenak fixture's birth), with a known time. */
  const EINSTEIN: Person = {
    id: 'p-einstein',
    displayName: 'Albert Einstein',
    moment: {
      civil: { year: 1879, month: 3, day: 14, hour: 11, minute: 30, second: 0 },
      coordinates: { latitude: 48.4, longitude: 9.99 },
      offsetOverrideMinutes: 40,
    },
    placeLabel: 'Ulm, Germany',
    timeAccuracy: 'recorded',
    notes: '',
    missing: [],
  };
  /** The export date the section reads: 1900-06-01, an age at which both Naibod and the true solar arc have active directions. */
  const EXPORT_DATE = new Date('1900-06-01T12:00:00Z');

  /** Builds one plan with the given primary-directions options, the clock fixed at the export date. */
  async function planWith(options: PdfPrimaryDirectionsSectionOptions, locale: 'en' | 'nl' = 'en') {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(EXPORT_DATE);
    try {
      const selection: PdfSelection = {
        personId: EINSTEIN.id,
        ...EMPTY_SELECTION,
        primaryDirections: options,
      };
      const context: PdfPlanContext = {
        person: EINSTEIN,
        provider: await provider(),
        settings: DEFAULT_EXTENDED_SETTINGS,
        rulership: DEFAULT_RULERSHIP_CHOICE,
        locale,
        corpusFetch,
      };
      return await buildPdfPlan(selection, context, chartViewMessages[locale], pdfExportMessages[locale]);
    } finally {
      vi.useRealTimers();
    }
  }

  const ALL_ON: PdfPrimaryDirectionsSectionOptions = {
    key: PrimaryDirectionKey.NAIBOD,
    mode: 'direct',
    activeTable: true,
    allTable: true,
    wheel: true,
  };

  it('adds the section with both tables and the bi-wheel when every part is on', async () => {
    const plan = await planWith(ALL_ON);
    expect(plan.errors).toHaveLength(0);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.heading).toContain('Albert Einstein');
    expect(section.svg?.markup).toContain('<svg');
    expect(section.tables.map((table) => table.caption)).toEqual([
      primaryDirectionsViewMessages.en.activeCaption('1'),
      primaryDirectionsViewMessages.en.allCaption,
    ]);
  }, 60_000);

  it('drops the bi-wheel when only that option is off, keeping both tables', async () => {
    const plan = await planWith({ ...ALL_ON, wheel: false });
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.svg).toBeUndefined();
    expect(section.tables).toHaveLength(2);
  }, 60_000);

  it('drops the active table when only that option is off, keeping the all-directions table and the wheel', async () => {
    const plan = await planWith({ ...ALL_ON, activeTable: false });
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.svg?.markup).toContain('<svg');
    expect(section.tables.map((table) => table.caption)).toEqual([primaryDirectionsViewMessages.en.allCaption]);
  }, 60_000);

  it('drops the all-directions table when only that option is off', async () => {
    const plan = await planWith({ ...ALL_ON, allTable: false });
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.tables.map((table) => table.caption)).toEqual([primaryDirectionsViewMessages.en.activeCaption('1')]);
  }, 60_000);

  it('adds no section at all when every part is off', async () => {
    const plan = await planWith({ ...ALL_ON, activeTable: false, allTable: false, wheel: false });
    expect(plan.sections).toHaveLength(0);
    expect(plan.errors).toHaveLength(0);
  }, 60_000);

  it('names the chosen key, mode and method on the basis line, in en and nl', async () => {
    const naibod = await planWith(ALL_ON);
    const [naibodSection] = naibod.sections;
    if (naibodSection?.kind !== 'chart') throw new Error('expected a chart section');
    expect(naibodSection.hint).toContain(timingBasisMessages.en.directionKeys.naibod);
    expect(naibodSection.hint).toContain(timingBasisMessages.en.directionMethods.zodiacal);

    const ptolemy = await planWith({ ...ALL_ON, key: PrimaryDirectionKey.PTOLEMY });
    const [ptolemySection] = ptolemy.sections;
    if (ptolemySection?.kind !== 'chart') throw new Error('expected a chart section');
    expect(ptolemySection.hint).toContain(timingBasisMessages.en.directionKeys.ptolemy);
    expect(ptolemySection.hint).not.toContain(timingBasisMessages.en.directionKeys.naibod);

    const nl = await planWith(ALL_ON, 'nl');
    const [nlSection] = nl.sections;
    if (nlSection?.kind !== 'chart') throw new Error('expected a chart section');
    expect(nlSection.hint).toContain(timingBasisMessages.nl.directionKeys.naibod);
  }, 60_000);

  it('gives different active ages for the true solar arc key than for Naibod, at the same date', async () => {
    const naibod = await planWith(ALL_ON);
    const trueArc = await planWith({ ...ALL_ON, key: PrimaryDirectionKey.TRUE_SOLAR_ARC });
    const [naibodSection] = naibod.sections;
    const [trueSection] = trueArc.sections;
    if (naibodSection?.kind !== 'chart' || trueSection?.kind !== 'chart') {
      throw new Error('expected chart sections');
    }
    const naibodActive = naibodSection.tables[0]?.body ?? [];
    const trueActive = trueSection.tables[0]?.body ?? [];
    expect(naibodActive.length).toBeGreaterThan(0);
    expect(trueActive.length).toBeGreaterThan(0);
    expect(trueActive).not.toEqual(naibodActive);
  }, 120_000);

  it('builds a PDF section without error, as the Solar Arc section does (#1845)', async () => {
    const plan = await planWith(ALL_ON);
    expect(plan.errors).toHaveLength(0);
    expect(
      plan.sections.some((section) => section.kind === 'chart' && section.heading.includes('Albert Einstein')),
    ).toBe(true);
  }, 60_000);

  it('prints the converse note in place of the bi-wheel when the mode is converse (rule 1)', async () => {
    const plan = await planWith({ ...ALL_ON, mode: 'converse' });
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.svg).toBeUndefined();
    expect(section.hint).toContain(primaryDirectionsViewMessages.en.converseWheelUnavailable);
  }, 60_000);

  it('still prints the active table in converse mode, computed from the age (rule 2)', async () => {
    const plan = await planWith({ ...ALL_ON, mode: 'converse' });
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.tables.map((table) => table.caption)).toContain(primaryDirectionsViewMessages.en.activeCaption('1'));
  }, 60_000);

  it('prints the before-birth line in place of the active table when the export date is before birth (rule 3)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('1850-01-01T12:00:00Z'));
    try {
      const selection: PdfSelection = { personId: EINSTEIN.id, ...EMPTY_SELECTION, primaryDirections: ALL_ON };
      const context: PdfPlanContext = {
        person: EINSTEIN,
        provider: await provider(),
        settings: DEFAULT_EXTENDED_SETTINGS,
        rulership: DEFAULT_RULERSHIP_CHOICE,
        locale: 'en',
        corpusFetch,
      };
      const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
      const [section] = plan.sections;
      if (section?.kind !== 'chart') throw new Error('expected a chart section');
      expect(section.hint).toContain(primaryDirectionsViewMessages.en.beforeBirth);
      expect(section.tables.map((table) => table.caption)).not.toContain(
        primaryDirectionsViewMessages.en.activeCaption('1'),
      );
      expect(section.tables.map((table) => table.caption)).toContain(primaryDirectionsViewMessages.en.allCaption);
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);
});
