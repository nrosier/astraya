/** The primary-directions section of the PDF export selection (#1845): defaults, presets, matching and emptiness. */
import { describe, expect, it } from 'vitest';
import { PrimaryDirectionKey } from '../src/domain/primary-directions.js';
import {
  applyPdfPreset,
  defaultPrimaryDirectionsSectionOptions,
  matchPdfPreset,
  PDF_PRESETS,
  pdfSelectionIsEmpty,
  type PdfPrimaryDirectionsSectionOptions,
  type PdfSelection,
} from '../src/domain/pdf-export-sections.js';

describe('primary directions section (#1845)', () => {
  it('starts with the Naibod key, direct mode and every part on', () => {
    expect(defaultPrimaryDirectionsSectionOptions()).toEqual({
      key: PrimaryDirectionKey.NAIBOD,
      mode: 'direct',
      activeTable: true,
      allTable: true,
      wheel: true,
    });
  });

  it('is in both presets that carry solar arc, with the default options', () => {
    expect(PDF_PRESETS['complete-archive'].primaryDirections).toEqual(defaultPrimaryDirectionsSectionOptions());
    expect(PDF_PRESETS['full-predictive-report'].primaryDirections).toEqual(defaultPrimaryDirectionsSectionOptions());
  });

  it('is absent from the executive summary', () => {
    expect(PDF_PRESETS['executive-summary'].primaryDirections).toBeUndefined();
  });

  it('keeps both full presets matching themselves back', () => {
    expect(matchPdfPreset(applyPdfPreset('complete-archive', 'p-ada'))).toBe('complete-archive');
    expect(matchPdfPreset(applyPdfPreset('full-predictive-report', 'p-ada'))).toBe('full-predictive-report');
  });

  it('says Custom once a preset primary-directions section is changed in any field', () => {
    const base = applyPdfPreset('complete-archive', 'p-ada');
    const changed: readonly Partial<PdfPrimaryDirectionsSectionOptions>[] = [
      { key: PrimaryDirectionKey.TRUE_SOLAR_ARC },
      { mode: 'converse' },
      { activeTable: false },
      { allTable: false },
      { wheel: false },
    ];
    for (const patch of changed) {
      const selection: PdfSelection = {
        ...base,
        primaryDirections: { ...defaultPrimaryDirectionsSectionOptions(), ...patch },
      };
      expect(matchPdfPreset(selection)).toBeUndefined();
    }
  });

  it('says Custom when the section is removed from a preset that carries it', () => {
    const base = applyPdfPreset('complete-archive', 'p-ada');
    const without = Object.fromEntries(
      Object.entries(base).filter(([key]) => key !== 'primaryDirections'),
    ) as unknown as PdfSelection;
    expect(matchPdfPreset(without)).toBeUndefined();
  });

  it('round-trips a selection through a copy and keeps the key and mode', () => {
    const selection: PdfSelection = {
      personId: 'p-ada',
      ...PDF_PRESETS['complete-archive'],
      primaryDirections: {
        key: PrimaryDirectionKey.TRUE_SOLAR_ARC,
        mode: 'converse',
        activeTable: false,
        allTable: true,
        wheel: false,
      },
    };
    const copy: PdfSelection = JSON.parse(JSON.stringify(selection)) as PdfSelection;
    expect(copy.primaryDirections).toEqual(selection.primaryDirections);
    expect(matchPdfPreset(copy)).toBeUndefined();
  });

  it('counts as empty only when every part is off', () => {
    const none: PdfPrimaryDirectionsSectionOptions = {
      key: PrimaryDirectionKey.NAIBOD,
      mode: 'direct',
      activeTable: false,
      allTable: false,
      wheel: false,
    };
    const empty: PdfSelection = {
      personId: 'p-ada',
      birthRecord: false,
      interpretation: { base: false, aiInterpretationIds: [] },
      charts: [],
      primaryDirections: none,
    };
    expect(pdfSelectionIsEmpty(empty)).toBe(true);
    expect(pdfSelectionIsEmpty({ ...empty, primaryDirections: { ...none, wheel: true } })).toBe(false);
  });
});
