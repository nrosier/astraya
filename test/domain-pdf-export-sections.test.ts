/** The declarative PDF-export registry (#441): presets, selection emptiness, and defaults. */
import { describe, expect, it } from 'vitest';
import {
  applyPdfPreset,
  defaultChartSectionOptions,
  defaultCompositeSectionOptions,
  defaultSynastrySectionOptions,
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

  it('says Custom for a selection with synastry or composite ticked — no preset sets either (#441)', () => {
    const withSynastry: PdfSelection = {
      ...applyPdfPreset('executive-summary', 'p-ada'),
      synastry: defaultSynastrySectionOptions('p-partner'),
    };
    expect(matchPdfPreset(withSynastry)).toBeUndefined();
    const withComposite: PdfSelection = {
      ...applyPdfPreset('executive-summary', 'p-ada'),
      composite: defaultCompositeSectionOptions('p-partner'),
    };
    expect(matchPdfPreset(withComposite)).toBeUndefined();
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

  it('is false once synastry or composite has anything ticked, true for either with nothing ticked (#441)', () => {
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        synastry: { partnerId: 'p-partner', wheel: false, aspectsTable: false, relationshipSummary: false },
      }),
    ).toBe(true);
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        synastry: { partnerId: 'p-partner', wheel: true, aspectsTable: false, relationshipSummary: false },
      }),
    ).toBe(false);
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        synastry: { partnerId: 'p-partner', wheel: false, aspectsTable: false, relationshipSummary: true },
      }),
    ).toBe(false);
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        composite: { partnerId: 'p-partner', wheel: false, tables: [] },
      }),
    ).toBe(true);
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        composite: { partnerId: 'p-partner', wheel: false, tables: ['positions'] },
      }),
    ).toBe(false);
  });
});

describe('defaultSynastrySectionOptions / defaultCompositeSectionOptions', () => {
  it('starts both with their wheel on and the partner named', () => {
    const synastry = defaultSynastrySectionOptions('p-partner');
    expect(synastry.partnerId).toBe('p-partner');
    expect(synastry.wheel).toBe(true);
    expect(synastry.aspectsTable).toBe(true);

    const composite = defaultCompositeSectionOptions('p-partner');
    expect(composite.partnerId).toBe('p-partner');
    expect(composite.wheel).toBe(true);
    expect(composite.tables).toHaveLength(5);
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
