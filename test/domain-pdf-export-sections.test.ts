/** The declarative PDF-export registry (#441): presets, selection emptiness, and defaults. */
import { describe, expect, it } from 'vitest';
import { EXTENDED_ACG_BODY_IDS, TRADITIONAL_ACG_BODY_IDS } from '../src/domain/astrocartography.js';
import {
  applyPdfPreset,
  defaultAstrocartographySectionOptions,
  defaultChartSectionOptions,
  defaultCompositeSectionOptions,
  defaultEclipsesSectionOptions,
  defaultForecastSectionOptions,
  defaultProfectionsSectionOptions,
  defaultProgressionsSectionOptions,
  defaultSolarArcSectionOptions,
  defaultSynastrySectionOptions,
  defaultTransitsSectionOptions,
  EMPTY_SELECTION,
  matchPdfPreset,
  PDF_ACG_LINE_TYPES,
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

  it('fills complete-archive with all four new sections, every table and body/line type on (#441)', () => {
    const selection = applyPdfPreset('complete-archive', 'p-ada');
    expect(selection.progressions).toEqual({
      technique: 'secondary',
      mcMethod: 'naibod',
      positionsTable: true,
      contactsTable: true,
    });
    expect(selection.solarArc).toEqual({ positionsTable: true, contactsTable: true });
    expect(selection.profections).toEqual({ table: true, meanings: true });
    expect(selection.astrocartography?.map).toBe(true);
    expect(selection.astrocartography?.meanings).toBe(true);
    expect(selection.astrocartography?.lineTypes).toHaveLength(PDF_ACG_LINE_TYPES.length);
    expect(selection.astrocartography?.bodies).toHaveLength(
      TRADITIONAL_ACG_BODY_IDS.length + EXTENDED_ACG_BODY_IDS.length,
    );
  });

  it('fills full-predictive-report with progressions and solar arc, but not profections or astrocartography (#441)', () => {
    const selection = applyPdfPreset('full-predictive-report', 'p-ada');
    expect(selection.progressions).toBeDefined();
    expect(selection.solarArc).toBeDefined();
    expect(selection.profections).toBeUndefined();
    expect(selection.astrocartography).toBeUndefined();
    expect(matchPdfPreset(selection)).toBe('full-predictive-report');
  });

  it('says Custom for full-predictive-report once profections or astrocartography is added (#441)', () => {
    const base = applyPdfPreset('full-predictive-report', 'p-ada');
    expect(matchPdfPreset({ ...base, profections: defaultProfectionsSectionOptions() })).toBeUndefined();
    expect(matchPdfPreset({ ...base, astrocartography: defaultAstrocartographySectionOptions() })).toBeUndefined();
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

  it('is false once any of the four new sections has anything ticked, true for each with nothing ticked (#441)', () => {
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        progressions: { technique: 'secondary', mcMethod: 'naibod', positionsTable: false, contactsTable: false },
      }),
    ).toBe(true);
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        progressions: { technique: 'secondary', mcMethod: 'naibod', positionsTable: true, contactsTable: false },
      }),
    ).toBe(false);

    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        solarArc: { positionsTable: false, contactsTable: false },
      }),
    ).toBe(true);
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        solarArc: { positionsTable: false, contactsTable: true },
      }),
    ).toBe(false);

    expect(
      pdfSelectionIsEmpty({ personId: 'p-ada', ...EMPTY_SELECTION, profections: { table: false, meanings: false } }),
    ).toBe(true);
    expect(
      pdfSelectionIsEmpty({ personId: 'p-ada', ...EMPTY_SELECTION, profections: { table: true, meanings: false } }),
    ).toBe(false);

    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        astrocartography: { map: false, lineTypes: [], bodies: [], localSpace: false, meanings: false },
      }),
    ).toBe(true);
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        astrocartography: { map: true, lineTypes: [], bodies: [], localSpace: false, meanings: false },
      }),
    ).toBe(false);
    // `localSpace`/`lineTypes`/`bodies` alone don't count — same reasoning a chart section's
    // `tables: []` with the wheel off is still empty: only `map`/`meanings` carry content.
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        astrocartography: { map: false, lineTypes: [], bodies: [], localSpace: true, meanings: false },
      }),
    ).toBe(true);
  });

  it('is false once transits, forecast, or eclipses has anything ticked, true for each with nothing ticked (#441, #484)', () => {
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        transits: { filterPreset: 'important', wheel: false, aspectsTable: false },
      }),
    ).toBe(true);
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        transits: { filterPreset: 'important', wheel: true, aspectsTable: false },
      }),
    ).toBe(false);

    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        forecast: { filterPreset: 'important', daily: false, weekly: false, monthly: false, yearly: false },
      }),
    ).toBe(true);
    expect(
      pdfSelectionIsEmpty({
        personId: 'p-ada',
        ...EMPTY_SELECTION,
        forecast: { filterPreset: 'important', daily: true, weekly: false, monthly: false, yearly: false },
      }),
    ).toBe(false);

    expect(pdfSelectionIsEmpty({ personId: 'p-ada', ...EMPTY_SELECTION, eclipses: { table: false } })).toBe(true);
    expect(pdfSelectionIsEmpty({ personId: 'p-ada', ...EMPTY_SELECTION, eclipses: { table: true } })).toBe(false);
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

describe('default section options for the four new sections (#441)', () => {
  it('starts progressions on secondary/Naibod with both tables and today as the date', () => {
    const options = defaultProgressionsSectionOptions();
    expect(options.technique).toBe('secondary');
    expect(options.mcMethod).toBe('naibod');
    expect(options.positionsTable).toBe(true);
    expect(options.contactsTable).toBe(true);
    expect(options.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('starts solar arc with both tables and today as the date', () => {
    const options = defaultSolarArcSectionOptions();
    expect(options.positionsTable).toBe(true);
    expect(options.contactsTable).toBe(true);
    expect(options.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('starts profections with the table and meanings on and today as the date', () => {
    const options = defaultProfectionsSectionOptions();
    expect(options.table).toBe(true);
    expect(options.meanings).toBe(true);
    expect(options.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('starts astrocartography with the map and meanings on, every line type, and only the traditional bodies', () => {
    const options = defaultAstrocartographySectionOptions();
    expect(options.map).toBe(true);
    expect(options.meanings).toBe(true);
    expect(options.localSpace).toBe(false);
    expect(options.lineTypes).toHaveLength(PDF_ACG_LINE_TYPES.length);
    expect(options.bodies).toEqual(TRADITIONAL_ACG_BODY_IDS);
  });

  it('starts transits on the "important" filter with the wheel/table on and today as the date (#441)', () => {
    const options = defaultTransitsSectionOptions();
    expect(options.filterPreset).toBe('important');
    expect(options.wheel).toBe(true);
    expect(options.aspectsTable).toBe(true);
    expect(options.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('starts forecast on the "important" filter with every tier on and today as the date (#441)', () => {
    const options = defaultForecastSectionOptions();
    expect(options.filterPreset).toBe('important');
    expect(options.daily).toBe(true);
    expect(options.weekly).toBe(true);
    expect(options.monthly).toBe(true);
    expect(options.yearly).toBe(true);
    expect(options.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("starts eclipses with the table on and the live screen's own default span (#441, #484)", () => {
    const options = defaultEclipsesSectionOptions();
    const thisYear = new Date().getUTCFullYear();
    expect(options.table).toBe(true);
    expect(options.fromYear).toBe(thisYear - 1);
    expect(options.toYear).toBe(thisYear + 3);
  });
});

describe('eclipses in presets and matching (#441, #484)', () => {
  it('fills complete-archive with the eclipses table on, year span left unset for lazy resolution', () => {
    const selection = applyPdfPreset('complete-archive', 'p-ada');
    expect(selection.eclipses).toEqual({ table: true });
    expect(matchPdfPreset(selection)).toBe('complete-archive');
  });

  it('is Custom once eclipses is added to a selection that otherwise matches a preset with no eclipses', () => {
    const base = applyPdfPreset('executive-summary', 'p-ada');
    expect(matchPdfPreset({ ...base, eclipses: defaultEclipsesSectionOptions() })).toBeUndefined();
  });

  it('ignores fromYear/toYear when matching against a preset, same as asOfDate elsewhere', () => {
    const archive = applyPdfPreset('complete-archive', 'p-ada');
    const withSpan: PdfSelection = { ...archive, eclipses: { table: true, fromYear: 1999, toYear: 2001 } };
    expect(matchPdfPreset(withSpan)).toBe('complete-archive');
  });
});
