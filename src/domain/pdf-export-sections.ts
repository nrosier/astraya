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
 * narrative that costs an API call). Synastry, composite, transits, forecast, progressions, solar
 * arc, profections and astrocartography are not sections here yet — see the issue for the follow-up.
 */
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

export interface PdfSelection {
  readonly personId: string;
  readonly birthRecord: boolean;
  readonly interpretation: PdfInterpretationOptions;
  readonly charts: readonly PdfChartSectionOptions[];
}

const EVERY_TABLE = PDF_CHART_TABLES;

export const EMPTY_SELECTION: Omit<PdfSelection, 'personId'> = {
  birthRecord: false,
  interpretation: { base: false, aiCustomised: false },
  charts: [],
};

/** One chart type, every table and the wheel on, with no type-specific parameters set. */
function fullChartSection(type: ChartType): PdfChartSectionOptions {
  return { type, wheel: true, tables: EVERY_TABLE };
}

export type PdfPresetKey = 'executive-summary' | 'complete-archive';

export const PDF_PRESET_KEYS: readonly PdfPresetKey[] = ['executive-summary', 'complete-archive'];

/**
 * What each preset fills a selection with — `personId` is always chosen separately, never by a preset.
 * "Full predictive report" (natal wheel + transits + progressions + solar arc) is not offered: those
 * sections do not exist here yet, and a preset promising a section that silently produces nothing
 * would be worse than not offering it.
 */
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
  },
};

export function applyPdfPreset(key: PdfPresetKey, personId: string): PdfSelection {
  return { personId, ...PDF_PRESETS[key] };
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
      })
    );
  });
}

/** Whether a selection has anything at all ticked — the "Build PDF" button's own gate. */
export function pdfSelectionIsEmpty(selection: PdfSelection): boolean {
  return (
    !selection.birthRecord &&
    !selection.interpretation.base &&
    !selection.interpretation.aiCustomised &&
    selection.charts.every((chart) => !chart.wheel && chart.tables.length === 0)
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
