/**
 * CSV import and export of a person's life events (#1439): date, time, category, description.
 */
/**
 * @module life-events-csv
 * @purpose Parses and serialises the life-events CSV (columns date, time, category, description), the only exchange format of the first version.
 * @conventions Pure and DOM-free; parsing is atomic, so the first bad row rejects the whole file with a machine-readable error (code plus 1-based line) that the UI turns into text in the reader's language; export writes exactly the columns import reads, in `sortLifeEvents` order, with CRLF line ends and RFC 4180 quoting; a description starting with `=`, `+`, `-` or `@` is written with a leading apostrophe so a spreadsheet does not run it as a formula, and import removes that apostrophe again; a time is optional, a category is optional and must be one of `LIFE_EVENT_CATEGORIES`; the 100-event cap is checked on the file alone, the caller checks it against the events already stored.
 * @exports LIFE_EVENT_CSV_HEADER, LifeEventCsvEntry, LifeEventCsvError, LifeEventCsvResult, parseLifeEventsCsv, serialiseLifeEvents
 */
import {
  LIFE_EVENT_LABEL_MAX_CHARACTERS,
  LIFE_EVENTS_MAX,
  isLifeEventCategory,
  readLifeEvents,
  sortLifeEvents,
  type LifeEvent,
  type LifeEventCategory,
} from './life-events.js';

/** The header row, in column order. */
export const LIFE_EVENT_CSV_HEADER = ['date', 'time', 'category', 'description'] as const;

/** One imported row: a life event that has no id yet. */
export interface LifeEventCsvEntry {
  readonly date: string;
  readonly time?: string | undefined;
  readonly category?: LifeEventCategory | undefined;
  readonly label: string;
}

export interface LifeEventCsvError {
  readonly code: 'empty' | 'header' | 'columns' | 'quote' | 'date' | 'time' | 'category' | 'description' | 'tooMany';
  /** 1-based line of the offending record (the header is line 1); 0 when the error is about the whole file. */
  readonly line: number;
}

export type LifeEventCsvResult =
  | { readonly ok: true; readonly entries: readonly LifeEventCsvEntry[] }
  | { readonly ok: false; readonly error: LifeEventCsvError };

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const FORMULA_START = /^[=+\-@\t\r]/;

interface CsvRow {
  readonly line: number;
  readonly cells: readonly string[];
}

/** Splits CSV text into records; undefined when a quoted cell is never closed. */
function tokenise(text: string): readonly CsvRow[] | undefined {
  const records: CsvRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let touched = false;
  const endRecord = (): void => {
    cells.push(cell);
    if (touched || cells.length > 1 || cells[0] !== '') records.push({ line: recordLine, cells });
    cells = [];
    cell = '';
    touched = false;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (quoted) {
      if (char === '"') {
        if (text.charAt(index + 1) === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else {
        if (char === '\n') line += 1;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === '') {
      quoted = true;
      touched = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text.charAt(index + 1) === '\n') index += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else cell += char;
  }
  if (quoted) return undefined;
  if (cell !== '' || cells.length > 0 || touched) endRecord();
  return records;
}

function fail(code: LifeEventCsvError['code'], line: number): LifeEventCsvResult {
  return { ok: false, error: { code, line } };
}

/** Reads the CSV text; the first bad row rejects the whole file. */
export function parseLifeEventsCsv(input: string): LifeEventCsvResult {
  const text = input.startsWith('﻿') ? input.slice(1) : input;
  const records = tokenise(text);
  if (records === undefined) return fail('quote', 0);
  const [header, ...rows] = records;
  if (header === undefined) return fail('empty', 0);
  const names = header.cells.map((name) => name.trim().toLowerCase());
  if (
    names.length !== LIFE_EVENT_CSV_HEADER.length ||
    names.some((name, index) => name !== LIFE_EVENT_CSV_HEADER[index])
  ) {
    return fail('header', header.line);
  }
  if (rows.length === 0) return fail('empty', 0);
  if (rows.length > LIFE_EVENTS_MAX) return fail('tooMany', 0);
  const entries: LifeEventCsvEntry[] = [];
  for (const row of rows) {
    if (row.cells.length !== LIFE_EVENT_CSV_HEADER.length) return fail('columns', row.line);
    const [date = '', time = '', category = '', description = ''] = row.cells.map((cell) => cell.trim());
    if (readLifeEvents([{ id: 'x', date, label: 'x' }]) === undefined) return fail('date', row.line);
    if (time !== '' && !TIME_PATTERN.test(time)) return fail('time', row.line);
    const lowered = category.toLowerCase();
    if (lowered !== '' && !isLifeEventCategory(lowered)) return fail('category', row.line);
    const label =
      description.startsWith("'") && FORMULA_START.test(description.slice(1)) ? description.slice(1) : description;
    if (label === '' || Array.from(label).length > LIFE_EVENT_LABEL_MAX_CHARACTERS)
      return fail('description', row.line);
    entries.push({
      date,
      ...(time === '' ? {} : { time }),
      ...(isLifeEventCategory(lowered) ? { category: lowered } : {}),
      label,
    });
  }
  return { ok: true, entries };
}

function quoteCell(value: string): string {
  const guarded = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]|^\s|\s$/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

/** The events as CSV text with the header row, in display order. */
export function serialiseLifeEvents(events: readonly LifeEvent[]): string {
  const lines = [LIFE_EVENT_CSV_HEADER.join(',')];
  for (const event of sortLifeEvents(events)) {
    lines.push([event.date, event.time ?? '', event.category ?? '', quoteCell(event.label)].join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
