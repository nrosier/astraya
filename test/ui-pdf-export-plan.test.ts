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
import { TRADITIONAL_ACG_BODY_IDS } from '../src/domain/astrocartography.js';
import { EMPTY_SELECTION, type PdfSelection } from '../src/domain/pdf-export-sections.js';
import type { Person } from '../src/domain/person.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { buildPdfPlan, type PdfPlanContext } from '../src/ui/pdf-export-plan.js';
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

describe('buildPdfPlan', () => {
  it('builds nothing but the title when the selection is empty', async () => {
    const provider = await getEngine();
    const selection: PdfSelection = { personId: ADA.id, ...EMPTY_SELECTION };
    const context: PdfPlanContext = {
      person: ADA,
      provider,
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
      rulership: DEFAULT_RULERSHIP_CHOICE,
      locale: 'en',
      aiConsent: false,
      corpusFetch,
    };
    const plan = await buildPdfPlan(selection, context, chartViewMessages.en, pdfExportMessages.en);
    expect(plan.errors).toHaveLength(0);
    expect(plan.sections.length).toBeGreaterThan(0);
    expect(plan.sections.every((s) => s.kind === 'text')).toBe(true);
    expect(plan.sections.every((s) => s.kind === 'text' && s.paragraphs.length > 0)).toBe(true);
  }, 30_000);

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
    expect(summarySection.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(summarySection.paragraphs.every((p) => p.length > 0)).toBe(true);
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
