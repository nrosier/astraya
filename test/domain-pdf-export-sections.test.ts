/** The declarative PDF-export registry (#441): presets, selection emptiness, and defaults. */
import { describe, expect, it } from 'vitest';
import {
  applyPdfPreset,
  defaultChartSectionOptions,
  EMPTY_SELECTION,
  matchPdfPreset,
  PDF_CHART_TYPES,
  pdfSelectionIsEmpty,
  type PdfSelection,
} from '../src/domain/pdf-export-sections.js';

describe('presets', () => {
  it('fills a selection for the given person, matching itself back', () => {
    for (const key of ['executive-summary', 'complete-archive'] as const) {
      const selection = applyPdfPreset(key, 'p-ada');
      expect(selection.personId).toBe('p-ada');
      expect(matchPdfPreset(selection)).toBe(key);
    }
  });

  it('says Custom for a selection that matches no preset', () => {
    const custom: PdfSelection = { personId: 'p-ada', ...EMPTY_SELECTION, birthRecord: true };
    expect(matchPdfPreset(custom)).toBeUndefined();
  });

  it('offers every chart type in the complete archive, every table and the wheel', () => {
    const selection = applyPdfPreset('complete-archive', 'p-ada');
    expect(selection.charts).toHaveLength(PDF_CHART_TYPES.length);
    for (const chart of selection.charts) {
      expect(chart.wheel).toBe(true);
      expect(chart.tables).toHaveLength(5);
    }
  });

  it('does not fill a tradition preset with an AI-customised narrative or any orb figure', () => {
    for (const key of ['executive-summary', 'complete-archive'] as const) {
      const selection = applyPdfPreset(key, 'p-ada');
      expect(selection.interpretation.aiCustomised).toBe(false);
    }
  });
});

describe('pdfSelectionIsEmpty', () => {
  it('is true for nothing ticked, false once anything is', () => {
    expect(pdfSelectionIsEmpty({ personId: 'p-ada', ...EMPTY_SELECTION })).toBe(true);
    expect(pdfSelectionIsEmpty({ personId: 'p-ada', ...EMPTY_SELECTION, birthRecord: true })).toBe(false);
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        charts: [{ type: 'natal', wheel: true, tables: [] }],
      }),
    ).toBe(false);
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        charts: [{ type: 'natal', wheel: false, tables: ['positions'] }],
      }),
    ).toBe(false);
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        charts: [{ type: 'natal', wheel: false, tables: [] }],
      }),
    ).toBe(true);
  });
});

describe('defaultChartSectionOptions', () => {
  it('gives harmonic, solar return and lunar return their own type-specific defaults', () => {
    expect(defaultChartSectionOptions('harmonic').harmonicN).toBe(5);
    expect(defaultChartSectionOptions('solar-return').returnYear).toBe(new Date().getFullYear());
    expect(defaultChartSectionOptions('lunar-return').returnFromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(defaultChartSectionOptions('natal').harmonicN).toBeUndefined();
    for (const type of PDF_CHART_TYPES) {
      const options = defaultChartSectionOptions(type);
      expect(options.wheel).toBe(true);
      expect(options.tables).toHaveLength(5);
    }
  });
});
