/**
 * Life events CSV (#1439): round trip through serialise and parse, and clear rejection of malformed files.
 */
import { describe, expect, it } from 'vitest';
import { LIFE_EVENT_CSV_HEADER, parseLifeEventsCsv, serialiseLifeEvents } from '../src/domain/life-events-csv.js';
import { LIFE_EVENTS_MAX, type LifeEvent } from '../src/domain/life-events.js';

function entries(text: string): readonly object[] {
  const result = parseLifeEventsCsv(text);
  if (!result.ok) throw new Error(`unexpected ${result.error.code}`);
  return result.entries;
}

describe('life events CSV', () => {
  it('has the four columns in order', () => {
    expect(LIFE_EVENT_CSV_HEADER).toEqual(['date', 'time', 'category', 'description']);
  });

  it('round-trips events with commas, quotes, newlines, formula starts, unicode and missing time or category', () => {
    const events: LifeEvent[] = [
      { id: 'a', date: '2001-05-04', time: '09:30', category: 'relocation', label: 'Moved, "abroad"' },
      { id: 'b', date: '1999-01-02', label: 'Line one\nline two' },
      { id: 'c', date: '2010-10-10', category: 'financial', label: '=SUM(A1)' },
      { id: 'd', date: '2011-11-11', category: 'other', label: '-5 degrees \u{1F52E}' },
      { id: 'e', date: '2012-12-12', label: "'quoted start" },
    ];
    const text = serialiseLifeEvents(events);
    expect(text.startsWith('date,time,category,description\r\n')).toBe(true);
    expect(text).toContain("'=SUM(A1)");
    const parsed = entries(text);
    const expected = [...events].sort((x, y) => x.date.localeCompare(y.date)).map(({ id: _id, ...rest }) => rest);
    expect(parsed).toEqual(expected);
  });

  it('accepts a BOM, LF line ends, a blank line and a mixed-case header', () => {
    expect(entries('﻿Date,Time,Category,Description\n2020-02-02,,Career,New job\n\n')).toEqual([
      { date: '2020-02-02', category: 'career', label: 'New job' },
    ]);
  });

  const header = 'date,time,category,description\n';
  const cases: readonly [string, string, string, number][] = [
    ['an empty file', '', 'empty', 0],
    ['a header only', header, 'empty', 0],
    ['a wrong header', 'when,time,category,description\n', 'header', 1],
    ['a short row', `${header}2020-01-01,,career\n`, 'columns', 2],
    ['an impossible date', `${header}2020-01-01,,,ok\n2023-02-30,,,bad\n`, 'date', 3],
    ['a bad time', `${header}2020-01-01,25:00,,ok\n`, 'time', 2],
    ['an unknown category', `${header}2020-01-01,,holiday,ok\n`, 'category', 2],
    ['an empty description', `${header}2020-01-01,,career,\n`, 'description', 2],
    ['an over-long description', `${header}2020-01-01,,,${'x'.repeat(201)}\n`, 'description', 2],
    ['an unterminated quote', `${header}2020-01-01,,,"open\n`, 'quote', 0],
  ];
  for (const [name, text, code, line] of cases) {
    it(`rejects ${name} with code ${code}`, () => {
      expect(parseLifeEventsCsv(text)).toEqual({ ok: false, error: { code, line } });
    });
  }

  it('rejects more than the cap in one file', () => {
    const rows = Array.from({ length: LIFE_EVENTS_MAX + 1 }, (_, index) => `2020-01-01,,,Event ${String(index)}`);
    expect(parseLifeEventsCsv(`${header}${rows.join('\n')}\n`)).toEqual({
      ok: false,
      error: { code: 'tooMany', line: 0 },
    });
  });
});
