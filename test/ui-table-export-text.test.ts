// @vitest-environment jsdom
/**
 * The copy, CSV and PDF text of the aspect matrix's two tables, the Aspects table and the Placements (Positions) table
 * (#898), pinned as exact strings for a small fixed fixture. The PDF plan builds its tables with no wheel selection
 * (`aspectColumns(t, locale)`, `positionColumns(t, locale, 'drawn')`), so the no-selection strings below are the text
 * the PDF carries too. With a wheel selection the on-screen table adds selection columns; they are screen-only (#957),
 * so Copy and CSV stay identical to the no-selection text.
 */
import { describe, expect, it } from 'vitest';
import type { AspectRow, PositionRow } from '../src/domain/chart-tables.js';
import { chartViewMessages } from '../src/ui/ChartView.messages.js';
import { aspectColumns } from '../src/ui/ChartViewAspects.js';
import { positionColumns } from '../src/ui/ChartViewPlacements.js';
import { rowsToCsv, rowsToTsv } from '../src/ui/table-sort.js';
import type { TableSelection } from '../src/ui/table-selection.js';

const t = chartViewMessages.en;

/** A wheel selection on the Sun, with every body selectable, as the on-screen table receives it (#418). */
const SELECTION: TableSelection = {
  selectedKey: 'body:sun',
  onToggle: () => undefined,
  selectableBodies: new Set(['sun', 'moon', 'saturn']),
};

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

describe('the Aspects table export text (#898)', () => {
  it('gives the exact copy (TSV) text for the PDF-shaped table', () => {
    expect(rowsToTsv(aspectColumns(t, 'en'), ASPECT_ROWS)).toBe(
      [
        'Body A\tAspect\tBody B\tOrb\tState\tFamily',
        'Sun\tTrine\tMoon\t1°12′\tApplying\tH3',
        'Sun\tSquare\tSaturn\t2°36′\tSeparating\tH4',
      ].join('\n'),
    );
  });

  it('gives the exact CSV text for the PDF-shaped table', () => {
    expect(rowsToCsv(aspectColumns(t, 'en'), ASPECT_ROWS)).toBe(
      [
        'Body A,Aspect,Body B,Orb,State,Family',
        'Sun,Trine,Moon,1°12′,Applying,H3',
        'Sun,Square,Saturn,2°36′,Separating,H4',
      ].join('\r\n'),
    );
  });

  it('keeps Copy and CSV identical with a wheel selection (#957)', () => {
    const withSelection = aspectColumns(t, 'en', SELECTION);
    expect(withSelection.some((column) => column.key === 'select')).toBe(true);
    expect(rowsToTsv(withSelection, ASPECT_ROWS)).toBe(rowsToTsv(aspectColumns(t, 'en'), ASPECT_ROWS));
    expect(rowsToCsv(withSelection, ASPECT_ROWS)).toBe(rowsToCsv(aspectColumns(t, 'en'), ASPECT_ROWS));
  });
});

describe('the Placements (Positions) table export text (#898)', () => {
  it('gives the exact copy (TSV) text for the PDF-shaped table', () => {
    expect(rowsToTsv(positionColumns(t, 'en', 'drawn'), POSITION_ROWS)).toBe(
      [
        'Symbol\tBody\tSign\tDeg\tMin\tSec\tHouse\tSpeed\tRx\tAnaretic\tOOB',
        '☉\tSun\tCapricorn\t10\t22\t12\t4\t0.9856\t\t\t',
        '☽\tMoon\tLibra\t13\t19\t12\t1\t-12.5000\t℞\t\t',
      ].join('\n'),
    );
  });

  it('gives the exact CSV text for the PDF-shaped table', () => {
    expect(rowsToCsv(positionColumns(t, 'en', 'drawn'), POSITION_ROWS)).toBe(
      [
        'Symbol,Body,Sign,Deg,Min,Sec,House,Speed,Rx,Anaretic,OOB',
        '☉,Sun,Capricorn,10,22,12,4,0.9856,,,',
        '☽,Moon,Libra,13,19,12,1,-12.5000,℞,,',
      ].join('\r\n'),
    );
  });

  it('keeps Copy and CSV identical with a wheel selection (#957)', () => {
    const withSelection = positionColumns(t, 'en', 'drawn', SELECTION);
    expect(withSelection.some((column) => column.key === 'select')).toBe(true);
    expect(withSelection.some((column) => column.key === 'selectSign')).toBe(true);
    expect(rowsToTsv(withSelection, POSITION_ROWS)).toBe(rowsToTsv(positionColumns(t, 'en', 'drawn'), POSITION_ROWS));
    expect(rowsToCsv(withSelection, POSITION_ROWS)).toBe(rowsToCsv(positionColumns(t, 'en', 'drawn'), POSITION_ROWS));
  });
});
