/**
 * #1357/#1358 — Forecast daily tables: the Orb column and the exact-today first column are left-aligned
 * (`align: 'start'`), and the exact-today date column may wrap so "... UT" is never cut off. Asserted on the
 * exported column factories that the screen and the PDF export share.
 */
import { describe, expect, it } from 'vitest';
import { contactColumns, exactEventColumns } from '../src/ui/PeriodicTransitView.js';
import { periodicTransitViewMessages } from '../src/ui/PeriodicTransitView.messages.js';
import { columnAlign, type TableColumn } from '../src/ui/table-sort.js';

const t = periodicTransitViewMessages.en;

function columnByKey<T>(columns: readonly TableColumn<T>[], key: string): TableColumn<T> {
  const column = columns.find((candidate) => candidate.key === key);
  if (column === undefined) throw new Error(`missing column ${key}`);
  return column;
}

describe('forecast daily table alignment (#1357/#1358)', () => {
  it('left-aligns the Orb column even though its values are all numbers', () => {
    const rows = [
      { key: 'a', sentence: 's', orb: 1.25, applying: true },
      { key: 'b', sentence: 's', orb: 0.5, applying: false },
    ];
    const orb = columnByKey(contactColumns(t), 'orb');
    expect(orb.align).toBe('start');
    expect(columnAlign(orb, rows)).toBe('start');
  });

  it('left-aligns the exact-today date column and lets its text wrap', () => {
    const rows = [{ key: 'a', jd: 2460000.5, date: '2023-02-25 00:00 UT', sentence: 's', retrograde: false }];
    const date = columnByKey(exactEventColumns(t), 'jd');
    expect(date.align).toBe('start');
    expect(date.wrapText).toBe(true);
    expect(columnAlign(date, rows)).toBe('start');
  });
});
