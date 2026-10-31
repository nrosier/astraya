// @vitest-environment jsdom
/**
 * The Show control's selection state must not change the copy, CSV or PDF text of the aspect matrix and the
 * Placements table (#898). The PDF/sheet path calls `renderAspectMatrixSvg` with no interaction argument, and the
 * Copy/CSV path builds its columns with or without a `TableSelection`; these tests pin that for both states.
 */
import { describe, expect, it } from 'vitest';
import type { AspectMatrixInput, MatrixBody, MatrixInteraction } from '../src/chart/aspect-matrix.js';
import { renderAspectMatrixSvg } from '../src/chart/aspect-matrix.js';
import type { PanelLayout } from '../src/chart/sheet-geometry.js';
import type { AspectRow, PositionRow } from '../src/domain/chart-tables.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { aspectColumns } from '../src/ui/ChartViewAspects.js';
import { positionColumns } from '../src/ui/ChartViewPlacements.js';
import { rowsToCsv, rowsToTsv } from '../src/ui/table-sort.js';
import type { TableSelection } from '../src/ui/table-selection.js';

const t = chartViewMessages.en;
const LAYOUT: PanelLayout = { x: 0, y: 0, width: 400 };

const BODIES: readonly MatrixBody[] = [
  { key: 'sun', label: 'Sun', name: 'Sun', longitude: 280.37, house: 4 },
  { key: 'moon', label: 'Moon', name: 'Moon', longitude: 193.32, house: 1 },
  { key: 'saturn', label: 'Saturn', name: 'Saturn', longitude: 32.05, retrograde: true, house: 8 },
  { key: 'asc', label: 'AC', name: 'ASC', longitude: 180.55 },
];

const MATRIX: AspectMatrixInput = {
  bodies: BODIES,
  aspects: [
    { aKey: 'sun', bKey: 'moon', aspectKey: 'square', orb: 2.95, signedOrb: -2.95, applying: false },
    { aKey: 'saturn', bKey: 'sun', aspectKey: 'trine', orb: 0.5, signedOrb: 0.5, applying: true },
  ],
};

/** A matrix Show control with one pair selected: the on-screen cell state, not the printed text. */
function showControl(selected: boolean): MatrixInteraction {
  return {
    describe: (a, b) => `Show ${b.name} and ${a.name}`,
    isSelected: (aKey, bKey) => selected && [aKey, bKey].sort().join() === 'moon,sun',
  };
}

/** Visible text of an SVG fragment: tags removed. Attributes such as aria-label are not printed. */
function visibleText(markup: string): string {
  return markup.replace(/<[^>]*>/g, '');
}

const ASPECT_ROWS: readonly AspectRow[] = [
  {
    bodyAKey: 'sun',
    bodyAName: 'Sun',
    bodyBKey: 'moon',
    bodyBName: 'Moon',
    aspect: 'Trine',
    aspectKey: 'trine',
    angle: 120,
    separation: 121.2,
    orb: 1.2,
    applying: true,
  },
  {
    bodyAKey: 'sun',
    bodyAName: 'Sun',
    bodyBKey: 'saturn',
    bodyBName: 'Saturn',
    aspect: 'Square',
    aspectKey: 'square',
    angle: 90,
    separation: 92.6,
    orb: 2.6,
    applying: false,
  },
];

const POSITION_ROWS: readonly PositionRow[] = [
  {
    bodyKey: 'sun',
    bodyName: 'Sun',
    glyph: '☉',
    longitude: 280.37,
    sign: 'Capricorn',
    degree: 10,
    minute: 22,
    second: 12,
    speed: 0.9856,
    retrograde: false,
    house: 4,
    anaretic: false,
  },
  {
    bodyKey: 'moon',
    bodyName: 'Moon',
    glyph: '☽',
    longitude: 193.32,
    sign: 'Libra',
    degree: 13,
    minute: 19,
    second: 12,
    speed: -12.5,
    retrograde: true,
    house: 1,
    anaretic: false,
  },
];

/** A wheel selection on the Sun, as the on-screen table receives it (#418). */
const SELECTION: TableSelection = {
  selectedKey: 'body:sun',
  onToggle: () => undefined,
  selectableBodies: new Set(['sun', 'moon', 'saturn']),
};

describe('the aspect matrix PDF/sheet text is unchanged by the Show control (#898)', () => {
  it('prints the same text whether or not a pair is selected', () => {
    const withoutControl = renderAspectMatrixSvg(MATRIX, LAYOUT);
    const selected = renderAspectMatrixSvg(MATRIX, LAYOUT, showControl(true));
    const unselected = renderAspectMatrixSvg(MATRIX, LAYOUT, showControl(false));
    expect(visibleText(selected.markup)).toBe(visibleText(withoutControl.markup));
    expect(visibleText(unselected.markup)).toBe(visibleText(withoutControl.markup));
  });

  it('keeps the PDF/sheet markup free of the Show control, so the selection state cannot reach it', () => {
    const { markup } = renderAspectMatrixSvg(MATRIX, LAYOUT);
    expect(markup).not.toContain('chart-matrix-pair');
    expect(markup).not.toContain('aria-pressed');
  });

  it('changes only aria-pressed on the on-screen cells when the selection changes', () => {
    const selected = renderAspectMatrixSvg(MATRIX, LAYOUT, showControl(true)).markup;
    const unselected = renderAspectMatrixSvg(MATRIX, LAYOUT, showControl(false)).markup;
    expect(selected).toContain('aria-pressed="true"');
    expect(unselected).not.toContain('aria-pressed="true"');
    expect(selected.replace('aria-pressed="true"', 'aria-pressed="false"')).toBe(unselected);
  });
});

describe('the Aspects table copy and CSV text is unchanged by the Show control (#898)', () => {
  it('keeps copy (TSV) and CSV identical with and without the selection', () => {
    const plain = aspectColumns(t, 'en');
    const withSelection = aspectColumns(t, 'en', SELECTION);
    expect(rowsToTsv(withSelection, ASPECT_ROWS)).toBe(rowsToTsv(plain, ASPECT_ROWS));
    expect(rowsToCsv(withSelection, ASPECT_ROWS)).toBe(rowsToCsv(plain, ASPECT_ROWS));
  });
});

describe('the Placements table copy, CSV and PDF text is unchanged by the Show control (#898)', () => {
  it('keeps copy (TSV) and CSV identical with and without the selection', () => {
    const plain = positionColumns(t, 'en', 'drawn');
    const withSelection = positionColumns(t, 'en', 'drawn', SELECTION);
    expect(rowsToTsv(withSelection, POSITION_ROWS)).toBe(rowsToTsv(plain, POSITION_ROWS));
    expect(rowsToCsv(withSelection, POSITION_ROWS)).toBe(rowsToCsv(plain, POSITION_ROWS));
  });

  it('builds the PDF table with no selection column, so its text cannot depend on the Show control', () => {
    const pdfColumns = positionColumns(t, 'en', 'drawn');
    expect(pdfColumns.some((column) => column.key === 'select')).toBe(false);
    expect(pdfColumns.some((column) => column.key === 'selectSign')).toBe(false);
  });
});
