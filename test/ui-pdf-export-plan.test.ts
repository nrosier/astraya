// @vitest-environment jsdom
/**
 * `buildPdfPlan` (#441) against the real Swiss Ephemeris engine, never a mock: the whole point is
 * that the plan comes from the same compute functions and table columns the on-screen chart uses.
 * `renderPdfPlan` (jsPDF/svg2pdf.js/jspdf-autotable, DOM-only) is covered end to end instead
 * (`e2e/pdf-export-builder.spec.ts`), not here.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULERSHIP_CHOICE } from '../src/astrology/rulership.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { CURRENT_SNAPSHOT_VERSION } from '../src/domain/calculation-snapshot.js';
import { TRADITIONAL_ACG_BODY_IDS } from '../src/domain/astrocartography.js';
import { EMPTY_SELECTION, type PdfSelection } from '../src/domain/pdf-export-sections.js';
import type { Person } from '../src/domain/person.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import {
  buildPdfPlan,
  sectionCalculationOptions,
  type PdfParagraphPlan,
  type PdfPlanContext,
  type PdfTextSectionPlan,
} from '../src/ui/pdf-export-plan.js';
import { pdfExportMessages } from '../src/ui/pdf-export.messages.js';
import { solarArcViewMessages } from '../src/ui/SolarArcView.messages.js';
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
      aiConsent: false,
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
      aiConsent: false,
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.sections).toHaveLength(1);
    const [section] = plan.sections;
    if (section?.kind !== 'fields') throw new Error('expected a fields section');
    expect(section.fields.some((f) => f.value.includes('London'))).toBe(true);
    expect(section.fields.some((f) => f.value === 'Recorded (certificate or hospital record)')).toBe(true);
  }, 30_000);

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
      aiConsent: false,
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    const [section] = plan.sections;
    if (section?.kind !== 'chart') throw new Error('expected a chart section');
    expect(section.svg?.markup).toContain('<svg');
    expect(section.tables.map((t) => t.caption)).toEqual(
      expect.arrayContaining([chartViewMessages.en.positionsCaption, chartViewMessages.en.aspectsCaption]),
    );
    const positions = section.tables.find((t) => t.caption === chartViewMessages.en.positionsCaption);
    expect(positions?.body.length).toBeGreaterThan(5);
    // Every cell is already a plain string, the same conversion a CSV download uses.
    expect(positions?.body.every((row) => row.every((cell) => typeof cell === 'string'))).toBe(true);
  }, 30_000);

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
      aiConsent: false,
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
      aiConsent: false,
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
      interpretation: { base: true, aiCustomised: false },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      aiConsent: false,
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
        interpretation: { base: true, aiCustomised: false },
      };
      const context: PdfPlanContext = {
        person: ADA,
        provider,
        settings: DEFAULT_EXTENDED_SETTINGS,
        rulership: DEFAULT_RULERSHIP_CHOICE,
        locale,
        aiConsent: false,
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
        aiCustomised: false,
        ...(sabianSymbols === undefined ? {} : { sabianSymbols }),
      };
      const selection: PdfSelection = { personId: ADA.id, ...EMPTY_SELECTION, interpretation };
      const context: PdfPlanContext = {
        person: ADA,
        provider,
        settings: DEFAULT_EXTENDED_SETTINGS,
        rulership: DEFAULT_RULERSHIP_CHOICE,
        locale: 'en',
        aiConsent: false,
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

  it('records a skip, not a crash, when the AI-customised narrative is ticked without consent', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = {
      personId: ADA.id,
      ...EMPTY_SELECTION,
      interpretation: { base: false, aiCustomised: true },
    };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
      settings: DEFAULT_EXTENDED_SETTINGS,
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      aiConsent: false,
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.sections).toHaveLength(0);
    expect(plan.errors).toEqual(['Interpretation (AI-customised): skipped — not consented to for this build.']);
  }, 30_000);

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
      aiConsent: false,
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
      aiConsent: false,
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
      aiConsent: false,
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
      aiConsent: false,
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
      aiConsent: false,
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
      aiConsent: false,
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
      aiConsent: false,
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
      aiConsent: false,
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
      aiConsent: false,
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
      aiConsent: false,
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
      aiConsent: false,
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
      aiConsent: false,
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
      aiConsent: false,
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
      aiConsent: false,
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    expect(plan.sections.length).toBeGreaterThan(0);
    expect(plan.sections.every((section) => section.kind === 'chart' || section.kind === 'text')).toBe(true);
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
      aiConsent: false,
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
      aiConsent: false,
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
      aiConsent: false,
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
