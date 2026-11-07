/**
 * @module ui/position-column
 * @purpose The one merged Position column of the timing tables (#1234, #1235, #1236): a sign and the degrees and minutes within it, in a single sortable column.
 * @conventions Shows `Gemini 26°43′` through `formatSignDegree` (degrees and minutes, no seconds: owner decision 2026-11-06, #654 stands) and the sign's display name in the interface language; sorts by ecliptic longitude. A row supplies its sign name and longitude; the caller supplies the localised header.
 * @exports SignDegreeRow, signDegreeColumn
 */
import { signDisplayName } from './astro-names.messages.js';
import { formatSignDegree } from './format.js';
import type { Locale } from '../interpretation/schema.js';
import type { TableColumn } from './table-sort.js';

/** What a row needs to show its position: the sign it is in and its ecliptic longitude. */
export interface SignDegreeRow {
  readonly sign: string;
  readonly longitude: number;
}

/** One column for a position: the sign and the degree and minute within it, sorted by longitude. */
export function signDegreeColumn<Row extends SignDegreeRow>(label: string, locale: Locale): TableColumn<Row> {
  return {
    key: 'position',
    label,
    valueOf: (row) => row.longitude,
    render: (row) => `${signDisplayName(row.sign, locale)} ${formatSignDegree(row.longitude)}`,
  };
}
