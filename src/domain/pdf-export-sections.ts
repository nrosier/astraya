/**
 * The declarative "what can go into a PDF" registry (#441): which pages are exportable, what each
 * one's own options are, and the ready-made presets that fill a selection in one go.
 *
 * Pure and DOM-free on purpose — `chart/pdf-export.ts` turns a selection plus already-computed data
 * into pages; `ui/PdfExportBuilder.tsx` is the screen that builds a selection. Neither of those needs
 * to know the registry's shape to use it, and this file needs neither jsPDF nor React to be tested.
 *
 * First slice (#441): the Charts page's five chart types with their own tables and wheel, the birth
 * record, and the interpretation report (the base corpus text, plus an opt-in AI-customised
 * narrative that costs an API call). Second slice: synastry and composite, each with their own
 * partner picker — unlike a chart type (independently on/off, several at once), only one partner
 * can be compared/combined with at a time, so these are a single optional field each rather than
 * an array entry. Third slice: transits and forecast — like synastry/composite, each is a single
 * optional field (there is only one "the transits"/"the forecast" per selection), but unlike
 * synastry/composite neither needs a partner picker, so (unlike synastry/composite) both are
 * allowed into a preset. Both carry their own "as of" date and the same "important vs. all"
 * contact filter the live `TransitFilterPanel.tsx` offers, chosen here rather than read off
 * whatever a live screen happened to show. Fourth slice: progressions (any of the three
 * techniques `ProgressionsView.tsx` offers), solar arc, profections, and astrocartography —
 * each a single optional field for the same reason transits/forecast are: there is only one
 * "the progressions"/"the solar arc"/etc. per selection, and none needs a partner picker, so
 * all four are allowed into a preset the same way transits/forecast are.
 */
/**
 * @module pdf-export-sections
 * @purpose Declarative registry of what can go into a PDF export (#441): which pages/sections are selectable, each section's own options, and ready-made presets.
 * @conventions Pure and DOM-free, with neither jsPDF nor React dependencies, so it's Vitest-testable without a browser; `chart/pdf-export.ts` turns a selection into pages, `ui/PdfExportBuilder.tsx` builds a selection — neither needs this file's internals beyond its exported shape; synastry/composite are single optional fields needing a partner, transits/forecast/progressions/solarArc/profections/astrocartography are single optional fields needing no partner (so, unlike synastry/composite, they can appear in a preset); `charts` is the one array field.
 * @exports PdfSelection, PdfChartSectionOptions, PdfSynastrySectionOptions, PdfCompositeSectionOptions, PdfInterpretationOptions, PdfTransitsSectionOptions, PdfForecastSectionOptions, PdfTransitFilterPreset, PdfProgressionTechnique, PdfProgressionsSectionOptions, PdfSolarArcSectionOptions, PdfProfectionsSectionOptions, PdfAcgLineType, PDF_ACG_LINE_TYPES, PdfAstrocartographySectionOptions, PDF_CHART_TABLES, PDF_CHART_TYPES, EMPTY_SELECTION, PDF_PRESETS, PDF_PRESET_KEYS, applyPdfPreset, matchPdfPreset, pdfSelectionIsEmpty, defaultChartSectionOptions, defaultSynastrySectionOptions, defaultCompositeSectionOptions, defaultTransitsSectionOptions, defaultForecastSectionOptions, defaultProgressionsSectionOptions, defaultSolarArcSectionOptions, defaultProfectionsSectionOptions, defaultAstrocartographySectionOptions
 */
import type { ProgressedMcMethod } from '../astrology/progressions.js';
import { EXTENDED_ACG_BODY_IDS, TRADITIONAL_ACG_BODY_IDS } from './astrocartography.js';
import type { BodyId } from '../ephemeris/types.js';
import type { ChartType } from '../ui/chart-sections.js';

/** The data tables a chart-type section can include, independently of each other and of the wheel. */
export const PDF_CHART_TABLES = ['positions', 'houses', 'aspects', 'dignities', 'derived'] as const;
export type PdfChartTable = (typeof PDF_CHART_TABLES)[number];

export const PDF_CHART_TYPES: readonly ChartType[] = ['natal', 'draconic', 'harmonic', 'solar-return', 'lunar-return'];

/** One chart type's own place in the export: whether its wheel and which of its tables are included, plus
 * the type-specific inputs that chart type needs (chosen here, not read off whatever a live screen shows). */
export interface PdfChartSectionOptions {
  readonly type: ChartType;
  readonly wheel: boolean;
  readonly tables: readonly PdfChartTable[];
  /** Harmonic only: the harmonic number (a Varga preset's `n`, or any positive integer). */
  readonly harmonicN?: number;
  /** Solar return only: the calendar year. */
  readonly returnYear?: number;
  /** Lunar return only: the date (yyyy-mm-dd) to search on or after. */
  readonly returnFromDate?: string;
  /** Either return, optional: cast somewhere other than the birthplace. */
  readonly place?: { readonly latitude: number; readonly longitude: number };
}

export interface PdfInterpretationOptions {
  readonly base: boolean;
  /** Costs an API call and needs its own consent tick in the builder — never defaulted on by a preset. */
  readonly aiCustomised: boolean;
}

/** Synastry's own place in the export: the partner it's compared against, and the wheel/table on. */
export interface PdfSynastrySectionOptions {
  readonly partnerId: string;
  readonly wheel: boolean;
  /** The one table synastry's own screen shows (the ranked cross-chart aspects); no sub-choice to make. */
  readonly aspectsTable: boolean;
  /** The grouped, ranked no-LLM text from `RelationshipSummary.tsx` (#422) — never the opt-in AI
   * reading, which (like the natal AI-customised narrative) is never included in an export. */
  readonly relationshipSummary: boolean;
}

/**
 * Composite's own place in the export: the partner it's combined with, and which tables (the
 * same five a chart type can show — a composite is a single synthetic `ChartData`, same as any
 * other chart this builder already draws).
 */
export interface PdfCompositeSectionOptions {
  readonly partnerId: string;
  readonly wheel: boolean;
  readonly tables: readonly PdfChartTable[];
}

/** The two filter levels the issue decided on (#441): the live `TransitFilterPanel.tsx` offers finer
 * presets and custom per-body/per-aspect tuning, but a builder page that has never had the live
 * screen open only needs the two the issue itself names — "limited to the important ones" (the
 * same `'important'` preset `TransitFilterPanel.tsx` defaults to) or "show all". */
export type PdfTransitFilterPreset = 'important' | 'all';

/** Transits' own place in the export: the single bi-wheel `TransitView.tsx` shows (natal inner
 * ring, transiting outer ring) and its one contacts table, as of a chosen date. `asOfDate` left
 * unset means "today, at build time" — the same lazy-default convention `returnFromDate` uses. */
export interface PdfTransitsSectionOptions {
  readonly filterPreset: PdfTransitFilterPreset;
  readonly wheel: boolean;
  readonly aspectsTable: boolean;
  readonly asOfDate?: string;
}

/** Forecast's own place in the export: `PeriodicTransitView.tsx`'s four always-on tiers
 * (daily/weekly/monthly/yearly), each independently on/off; its fifth tier (a planetary return on
 * a body the user picks on that screen) is left out of this slice — see the issue comment. */
export interface PdfForecastSectionOptions {
  readonly filterPreset: PdfTransitFilterPreset;
  readonly daily: boolean;
  readonly weekly: boolean;
  readonly monthly: boolean;
  readonly yearly: boolean;
  readonly asOfDate?: string;
}

/** The three techniques `ProgressionsView.tsx` offers — same meaning, same default (`'secondary'`). */
export type PdfProgressionTechnique = 'secondary' | 'tertiary' | 'minor';

/** Progressions' own place in the export: the technique, the MC method (secondary only — ignored,
 * but harmless if set, for tertiary/minor, same as `harmonicN` being ignored for a non-harmonic
 * chart type), and the live screen's own two tables (progressed positions, progressed-to-natal
 * contacts), as of a chosen date. */
export interface PdfProgressionsSectionOptions {
  readonly technique: PdfProgressionTechnique;
  readonly mcMethod: ProgressedMcMethod;
  readonly positionsTable: boolean;
  readonly contactsTable: boolean;
  readonly asOfDate?: string;
}

/** Solar arc's own place in the export: `SolarArcView.tsx`'s two tables (directed positions,
 * directed-to-natal contacts with exact-date timing), as of a chosen date. No wheel/map of its
 * own — same reasoning the forecast section has none: there is no single wheel a directed chart
 * draws that isn't already the natal or progressed one. */
export interface PdfSolarArcSectionOptions {
  readonly positionsTable: boolean;
  readonly contactsTable: boolean;
  readonly asOfDate?: string;
}

/** Profections' own place in the export: `ProfectionsView.tsx`'s year/month table and the
 * profected-house meanings beneath it, as of a chosen date. Rulership comes from the same
 * `PdfPlanContext.rulership` every other section reads, not a separate choice here. */
export interface PdfProfectionsSectionOptions {
  readonly table: boolean;
  readonly meanings: boolean;
  readonly asOfDate?: string;
}

/** The four line types `AstrocartographyView.tsx` offers. */
export const PDF_ACG_LINE_TYPES = ['MC', 'IC', 'AC', 'DC'] as const;
export type PdfAcgLineType = (typeof PDF_ACG_LINE_TYPES)[number];

/** Astrocartography's own place in the export: the rendered map, which line types and bodies it
 * carries, whether Local Space lines are added, and the per-body/line meanings beneath it — the
 * same options `AstrocartographyView.tsx` exposes, chosen here rather than read off that screen.
 * No "as of" date: a natal ACG map is time-invariant, unlike every other section above it. */
export interface PdfAstrocartographySectionOptions {
  readonly map: boolean;
  readonly lineTypes: readonly PdfAcgLineType[];
  readonly bodies: readonly BodyId[];
  readonly localSpace: boolean;
  readonly meanings: boolean;
}

export interface PdfSelection {
  readonly personId: string;
  readonly birthRecord: boolean;
  readonly interpretation: PdfInterpretationOptions;
  readonly charts: readonly PdfChartSectionOptions[];
  /** Absent means "not included" — there is at most one of each at a time, unlike `charts`. */
  readonly synastry?: PdfSynastrySectionOptions;
  readonly composite?: PdfCompositeSectionOptions;
  readonly transits?: PdfTransitsSectionOptions;
  readonly forecast?: PdfForecastSectionOptions;
  readonly progressions?: PdfProgressionsSectionOptions;
  readonly solarArc?: PdfSolarArcSectionOptions;
  readonly profections?: PdfProfectionsSectionOptions;
  readonly astrocartography?: PdfAstrocartographySectionOptions;
}

const EVERY_TABLE = PDF_CHART_TABLES;

export const EMPTY_SELECTION: Omit<PdfSelection, 'personId'> = {
  birthRecord: false,
  interpretation: { base: false, aiCustomised: false },
  charts: [],
};

export function defaultSynastrySectionOptions(partnerId: string): PdfSynastrySectionOptions {
  return { partnerId, wheel: true, aspectsTable: true, relationshipSummary: true };
}

export function defaultCompositeSectionOptions(partnerId: string): PdfCompositeSectionOptions {
  return { partnerId, wheel: true, tables: EVERY_TABLE };
}

/** The same "today" default `returnFromDate`'s own builder-only default below uses, computed once a section is first ticked (presets leave `asOfDate` unset instead, resolved lazily at build time). */
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Transits' own default parameters, for when it is first ticked in the builder — matches the live screen's own default filter (`'important'`). */
export function defaultTransitsSectionOptions(): PdfTransitsSectionOptions {
  return { filterPreset: 'important', wheel: true, aspectsTable: true, asOfDate: todayDateString() };
}

/** Every tier on, matching the live screen's own default filter. */
export function defaultForecastSectionOptions(): PdfForecastSectionOptions {
  return {
    filterPreset: 'important',
    daily: true,
    weekly: true,
    monthly: true,
    yearly: true,
    asOfDate: todayDateString(),
  };
}

/** Transits, every table/wheel on and every contact shown — "complete archive" leaves `asOfDate` unset so it resolves to "today" at build time, not at preset-definition time. */
function fullTransitsSection(): PdfTransitsSectionOptions {
  return { filterPreset: 'all', wheel: true, aspectsTable: true };
}

/** Forecast, every tier on and every contact shown — same lazy `asOfDate` reasoning as `fullTransitsSection`. */
function fullForecastSection(): PdfForecastSectionOptions {
  return { filterPreset: 'all', daily: true, weekly: true, monthly: true, yearly: true };
}

/** Progressions' own default parameters, matching the live screen's own defaults (`'secondary'`, `'naibod'`). */
export function defaultProgressionsSectionOptions(): PdfProgressionsSectionOptions {
  return {
    technique: 'secondary',
    mcMethod: 'naibod',
    positionsTable: true,
    contactsTable: true,
    asOfDate: todayDateString(),
  };
}

/** Progressions, both tables on — same lazy `asOfDate` reasoning as `fullTransitsSection`. */
function fullProgressionsSection(): PdfProgressionsSectionOptions {
  return { technique: 'secondary', mcMethod: 'naibod', positionsTable: true, contactsTable: true };
}

/** Solar arc's own default parameters, for when it is first ticked in the builder. */
export function defaultSolarArcSectionOptions(): PdfSolarArcSectionOptions {
  return { positionsTable: true, contactsTable: true, asOfDate: todayDateString() };
}

/** Solar arc, both tables on — same lazy `asOfDate` reasoning as `fullTransitsSection`. */
function fullSolarArcSection(): PdfSolarArcSectionOptions {
  return { positionsTable: true, contactsTable: true };
}

/** Profections' own default parameters, for when it is first ticked in the builder. */
export function defaultProfectionsSectionOptions(): PdfProfectionsSectionOptions {
  return { table: true, meanings: true, asOfDate: todayDateString() };
}

/** Profections, table and meanings on — same lazy `asOfDate` reasoning as `fullTransitsSection`. */
function fullProfectionsSection(): PdfProfectionsSectionOptions {
  return { table: true, meanings: true };
}

/** Astrocartography's own default parameters, matching the live screen's own defaults (all four
 * line types, the traditional seven bodies, Local Space off). */
export function defaultAstrocartographySectionOptions(): PdfAstrocartographySectionOptions {
  return {
    map: true,
    lineTypes: PDF_ACG_LINE_TYPES,
    bodies: TRADITIONAL_ACG_BODY_IDS,
    localSpace: false,
    meanings: true,
  };
}

/** Astrocartography, map and meanings on, every body (traditional and extended) and line type included. */
function fullAstrocartographySection(): PdfAstrocartographySectionOptions {
  return {
    map: true,
    lineTypes: PDF_ACG_LINE_TYPES,
    bodies: [...TRADITIONAL_ACG_BODY_IDS, ...EXTENDED_ACG_BODY_IDS],
    localSpace: false,
    meanings: true,
  };
}

/** One chart type, every table and the wheel on, with no type-specific parameters set. */
function fullChartSection(type: ChartType): PdfChartSectionOptions {
  return { type, wheel: true, tables: EVERY_TABLE };
}

export type PdfPresetKey = 'executive-summary' | 'complete-archive' | 'full-predictive-report';

export const PDF_PRESET_KEYS: readonly PdfPresetKey[] = [
  'executive-summary',
  'complete-archive',
  'full-predictive-report',
];

/** What each preset fills a selection with — `personId` is always chosen separately, never by a preset. */
export const PDF_PRESETS: Readonly<Record<PdfPresetKey, Omit<PdfSelection, 'personId'>>> = {
  'executive-summary': {
    birthRecord: true,
    interpretation: { base: true, aiCustomised: false },
    charts: [{ type: 'natal', wheel: true, tables: ['positions'] }],
  },
  'complete-archive': {
    birthRecord: true,
    interpretation: { base: true, aiCustomised: false },
    charts: PDF_CHART_TYPES.map(fullChartSection),
    transits: fullTransitsSection(),
    forecast: fullForecastSection(),
    progressions: fullProgressionsSection(),
    solarArc: fullSolarArcSection(),
    profections: fullProfectionsSection(),
    astrocartography: fullAstrocartographySection(),
  },
  /** Natal wheel + transits + progressions + solar arc, named for the issue's own wording — a
   * forward-looking read of "what's coming," so profections and astrocartography (both about
   * where/whose a period is, not what's approaching) are deliberately left out, same as the
   * issue's own phrasing of this preset implies. */
  'full-predictive-report': {
    birthRecord: true,
    interpretation: { base: true, aiCustomised: false },
    charts: [fullChartSection('natal')],
    transits: fullTransitsSection(),
    progressions: fullProgressionsSection(),
    solarArc: fullSolarArcSection(),
  },
};

export function applyPdfPreset(key: PdfPresetKey, personId: string): PdfSelection {
  return { personId, ...PDF_PRESETS[key] };
}

/** Whether a transits section matches a preset's own (`asOfDate` ignored, same as `returnYear`/`harmonicN`/`returnFromDate` above — a date is a per-build parameter, not part of a preset's identity). */
function transitsMatches(
  selection: PdfTransitsSectionOptions | undefined,
  preset: PdfTransitsSectionOptions | undefined,
): boolean {
  if (preset === undefined) return selection === undefined;
  return (
    selection?.filterPreset === preset.filterPreset &&
    selection.wheel === preset.wheel &&
    selection.aspectsTable === preset.aspectsTable
  );
}

/** Same reasoning as `transitsMatches`, for the forecast section. */
function forecastMatches(
  selection: PdfForecastSectionOptions | undefined,
  preset: PdfForecastSectionOptions | undefined,
): boolean {
  if (preset === undefined) return selection === undefined;
  return (
    selection?.filterPreset === preset.filterPreset &&
    selection.daily === preset.daily &&
    selection.weekly === preset.weekly &&
    selection.monthly === preset.monthly &&
    selection.yearly === preset.yearly
  );
}

/** Same reasoning as `transitsMatches`, for the progressions section. */
function progressionsMatches(
  selection: PdfProgressionsSectionOptions | undefined,
  preset: PdfProgressionsSectionOptions | undefined,
): boolean {
  if (preset === undefined) return selection === undefined;
  return (
    selection?.technique === preset.technique &&
    selection.mcMethod === preset.mcMethod &&
    selection.positionsTable === preset.positionsTable &&
    selection.contactsTable === preset.contactsTable
  );
}

/** Same reasoning as `transitsMatches`, for the solar arc section. */
function solarArcMatches(
  selection: PdfSolarArcSectionOptions | undefined,
  preset: PdfSolarArcSectionOptions | undefined,
): boolean {
  if (preset === undefined) return selection === undefined;
  return selection?.positionsTable === preset.positionsTable && selection.contactsTable === preset.contactsTable;
}

/** Same reasoning as `transitsMatches`, for the profections section. */
function profectionsMatches(
  selection: PdfProfectionsSectionOptions | undefined,
  preset: PdfProfectionsSectionOptions | undefined,
): boolean {
  if (preset === undefined) return selection === undefined;
  return selection?.table === preset.table && selection.meanings === preset.meanings;
}

/** Same reasoning as `transitsMatches`, for the astrocartography section. */
function astrocartographyMatches(
  selection: PdfAstrocartographySectionOptions | undefined,
  preset: PdfAstrocartographySectionOptions | undefined,
): boolean {
  if (preset === undefined) return selection === undefined;
  return (
    selection?.map === preset.map &&
    selection.localSpace === preset.localSpace &&
    selection.meanings === preset.meanings &&
    selection.lineTypes.length === preset.lineTypes.length &&
    preset.lineTypes.every((lineType) => selection.lineTypes.includes(lineType)) &&
    selection.bodies.length === preset.bodies.length &&
    preset.bodies.every((body) => selection.bodies.includes(body))
  );
}

/** Which preset (if any) a selection matches exactly, ignoring `personId`; `undefined` means "Custom". */
export function matchPdfPreset(selection: PdfSelection): PdfPresetKey | undefined {
  return PDF_PRESET_KEYS.find((key) => {
    const preset = PDF_PRESETS[key];
    return (
      selection.birthRecord === preset.birthRecord &&
      selection.interpretation.base === preset.interpretation.base &&
      selection.interpretation.aiCustomised === preset.interpretation.aiCustomised &&
      selection.charts.length === preset.charts.length &&
      selection.charts.every((chart, index) => {
        const other = preset.charts[index];
        return (
          other?.type === chart.type &&
          other.wheel === chart.wheel &&
          other.tables.length === chart.tables.length &&
          chart.tables.every((table) => other.tables.includes(table))
        );
      }) &&
      transitsMatches(selection.transits, preset.transits) &&
      forecastMatches(selection.forecast, preset.forecast) &&
      progressionsMatches(selection.progressions, preset.progressions) &&
      solarArcMatches(selection.solarArc, preset.solarArc) &&
      profectionsMatches(selection.profections, preset.profections) &&
      astrocartographyMatches(selection.astrocartography, preset.astrocartography) &&
      // No preset sets either — a partner is always picked separately — so a selection that
      // does include one, however it's filled in, can only ever be "Custom".
      selection.synastry === undefined &&
      selection.composite === undefined
    );
  });
}

/** Whether a selection has anything at all ticked — the "Build PDF" button's own gate. */
export function pdfSelectionIsEmpty(selection: PdfSelection): boolean {
  return (
    !selection.birthRecord &&
    !selection.interpretation.base &&
    !selection.interpretation.aiCustomised &&
    selection.charts.every((chart) => !chart.wheel && chart.tables.length === 0) &&
    (selection.synastry === undefined ||
      (!selection.synastry.wheel && !selection.synastry.aspectsTable && !selection.synastry.relationshipSummary)) &&
    (selection.composite === undefined || (!selection.composite.wheel && selection.composite.tables.length === 0)) &&
    (selection.transits === undefined || (!selection.transits.wheel && !selection.transits.aspectsTable)) &&
    (selection.forecast === undefined ||
      (!selection.forecast.daily &&
        !selection.forecast.weekly &&
        !selection.forecast.monthly &&
        !selection.forecast.yearly)) &&
    (selection.progressions === undefined ||
      (!selection.progressions.positionsTable && !selection.progressions.contactsTable)) &&
    (selection.solarArc === undefined || (!selection.solarArc.positionsTable && !selection.solarArc.contactsTable)) &&
    (selection.profections === undefined || (!selection.profections.table && !selection.profections.meanings)) &&
    (selection.astrocartography === undefined ||
      (!selection.astrocartography.map && !selection.astrocartography.meanings))
  );
}

/** A chart-type section's own default parameters, for when it is first ticked in the builder. */
export function defaultChartSectionOptions(type: ChartType): PdfChartSectionOptions {
  switch (type) {
    case 'harmonic':
      return { type, wheel: true, tables: EVERY_TABLE, harmonicN: 5 };
    case 'solar-return':
      return { type, wheel: true, tables: EVERY_TABLE, returnYear: new Date().getFullYear() };
    case 'lunar-return':
      return {
        type,
        wheel: true,
        tables: EVERY_TABLE,
        returnFromDate: new Date().toISOString().slice(0, 10),
      };
    default:
      return fullChartSection(type);
  }
}
