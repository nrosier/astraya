/**
 * Generic, domain-agnostic sorting and TSV serialization for `SortableTable` (#44).
 *
 * Kept free of any chart or astrology knowledge — a `TableColumn` is just a
 * key, a label and an accessor — so this same pair of helpers can back every
 * data table the app ever adds, not only this issue's five.
 */
/**
 * @module ui/table-sort
 * @purpose Generic, domain-agnostic column sorting plus TSV/CSV serialization backing SortableTable (#44) and every other data table in the app.
 * @conventions Deliberately free of any chart/astrology knowledge — a TableColumn is just a key, label, and value accessor, so the same pair of helpers backs every table the app adds; `render`/`renderCell` are display-only and never used for copy/CSV/TSV output, which always use `valueOf`/`render` text.
 * @exports SortDirection, SortState, toggleSort, CellValue, ColumnAlign, columnAlign, TableColumn, sortRows, cellText, rowsToTsv, rowsToCsv
 */

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  readonly column: string;
  readonly direction: SortDirection;
}

/** First click on a column sorts it ascending; a second click on the same column reverses it. */
export function toggleSort(current: SortState | undefined, column: string): SortState {
  if (current?.column !== column) return { column, direction: 'asc' };
  return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

import type { ReactNode } from 'react';
import type { GlossaryTermId } from './astro-glossary.messages.js';

export type CellValue = string | number | boolean;

/** How a column's cells and header line up: numbers read down a column when they share their right edge. */
export type ColumnAlign = 'start' | 'end' | 'center';

export interface TableColumn<T> {
  readonly key: string;
  readonly label: string;
  readonly valueOf: (row: T) => CellValue;
  /** Display text for the cell; defaults to `String(valueOf(row))` when omitted. Also what a copy or CSV export would use. */
  readonly render?: (row: T) => string;
  /**
   * What the cell shows on screen when it needs more than text (a button, #418). Never used for the
   * copied or downloaded table, which stay plain text from `render`/`valueOf`.
   */
  readonly renderCell?: (row: T) => ReactNode;
  /**
   * True for a column holding free-text prose (an interpretation sentence, #449) rather than the
   * short values every other column here has — the table's shared `white-space: nowrap` (right for
   * names/degrees/orbs, which benefit from staying on one line) is wrong for this one, which should
   * wrap within the column instead of forcing the whole table to scroll horizontally.
   */
  readonly wrapText?: boolean;
  /**
   * Alignment of the header and every cell. Omitted, it follows the data: a column whose values are all numbers
   * lines up at the end, anything else at the start (`columnAlign`). Set it only where that is wrong, e.g. a
   * column of check marks, which reads best centred.
   */
  readonly align?: ColumnAlign;
  /** False for a column of controls (row actions, a selection checkbox), whose header is a plain label, not a sort button. */
  readonly sortable?: boolean;
  /** Tooltip text for the column header (e.g., definition or hint). Shown on hover with cursor:help styling. */
  readonly labelTooltip?: string;
  /**
   * A glossary term the header names (#901): rendered as a `GlossaryTerm` beside the label, never inside the
   * sort button. Cell text stays plain, so a copy or CSV export is unchanged.
   */
  readonly labelTerm?: GlossaryTermId | undefined;
}

function comparable(value: CellValue): string | number {
  return typeof value === 'boolean' ? Number(value) : value;
}

/** Sorts `rows` by the column named in `sort`, or returns them unchanged if no sort is active. */
export function sortRows<T>(
  rows: readonly T[],
  columns: readonly TableColumn<T>[],
  sort: SortState | undefined,
): readonly T[] {
  if (sort === undefined) return rows;
  const column = columns.find((candidate) => candidate.key === sort.column);
  if (column === undefined) return rows;
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const valueA = comparable(column.valueOf(a));
    const valueB = comparable(column.valueOf(b));
    if (valueA < valueB) return -1 * factor;
    if (valueA > valueB) return 1 * factor;
    return 0;
  });
}

/** The text a cell shows as plain text: `render` when the column has one, else `valueOf`. Copy, CSV/TSV and the PDF (#664) all use it. */
export function cellText<T>(column: TableColumn<T>, row: T): string {
  return column.render ? column.render(row) : String(column.valueOf(row));
}

/** Tab-separated text of `rows` under `columns` — a header row plus one line per row, pasteable into a spreadsheet. */
export function rowsToTsv<T>(columns: readonly TableColumn<T>[], rows: readonly T[]): string {
  const header = columns.map((column) => column.label).join('\t');
  const lines = rows.map((row) => columns.map((column) => cellText(column, row)).join('\t'));
  return [header, ...lines].join('\n');
}

/** RFC 4180 quoting: only fields containing a comma, quote or newline are quoted, quotes doubled within them. */
function csvField(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** CSV text of `rows` under `columns` (#68), for a file download rather than the clipboard `rowsToTsv` serves. */
export function rowsToCsv<T>(columns: readonly TableColumn<T>[], rows: readonly T[]): string {
  const header = columns.map((column) => csvField(column.label)).join(',');
  const lines = rows.map((row) => columns.map((column) => csvField(cellText(column, row))).join(','));
  return [header, ...lines].join('\r\n');
}

/** The alignment a column is drawn with: its own, else the end for an all-numeric column and the start otherwise. */
export function columnAlign<T>(column: TableColumn<T>, rows: readonly T[]): ColumnAlign {
  if (column.align !== undefined) return column.align;
  if (rows.length === 0) return 'start';
  return rows.every((row) => typeof column.valueOf(row) === 'number') ? 'end' : 'start';
}
