/**
 * Column alignment for the data tables (#513): a column states its own, else it follows its data — numbers line up
 * at the end, everything else at the start — so no table has to remember to say so.
 */
import { describe, expect, it } from 'vitest';
import { columnAlign, type TableColumn } from '../src/ui/table-sort.js';

interface Row {
  readonly name: string;
  readonly degree: number;
  readonly mixed: string | number;
  readonly flag: boolean;
}
const ROWS: readonly Row[] = [
  { name: 'Sun', degree: 10, mixed: 1, flag: true },
  { name: 'Moon', degree: 3, mixed: 'x', flag: false },
];
const column = (partial: Partial<TableColumn<Row>> & Pick<TableColumn<Row>, 'valueOf'>): TableColumn<Row> => ({
  key: 'k',
  label: 'K',
  ...partial,
});

describe('columnAlign', () => {
  it('lines an all-numeric column up at the end and text at the start', () => {
    expect(columnAlign(column({ valueOf: (row) => row.degree }), ROWS)).toBe('end');
    expect(columnAlign(column({ valueOf: (row) => row.name }), ROWS)).toBe('start');
  });

  it('treats a column that is only sometimes a number, or a flag, as text', () => {
    expect(columnAlign(column({ valueOf: (row) => row.mixed }), ROWS)).toBe('start');
    expect(columnAlign(column({ valueOf: (row) => row.flag }), ROWS)).toBe('start');
  });

  it('defaults an empty table to the start', () => {
    expect(columnAlign(column({ valueOf: (row) => row.degree }), [])).toBe('start');
  });

  it('obeys a column that says how it lines up', () => {
    expect(columnAlign(column({ align: 'center', valueOf: (row) => row.flag }), ROWS)).toBe('center');
    expect(columnAlign(column({ align: 'start', valueOf: (row) => row.degree }), ROWS)).toBe('start');
  });
});
