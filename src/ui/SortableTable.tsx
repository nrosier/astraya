/**
 * A generic data table with sortable, clickable column headers, a Copy button (#44) and a
 * CSV download (#68).
 *
 * Thin wiring only: all the actual sorting and TSV/CSV-serialization logic lives in
 * `table-sort.ts`, which is plain and Vitest-testable. This component just holds the
 * current sort in state and renders it — the same "thin `.tsx`, tested `.ts`" split
 * `PersonForm.tsx`/`person-form.ts` already use, needed here too since the project has
 * no jsdom/`@testing-library/react` to test a component's rendered output directly.
 */
/**
 * @module SortableTable
 * @purpose Generic, reusable data table with sortable column headers, a Copy-to-clipboard button, and a CSV download, used across every tabular view in the app.
 * @conventions Thin wiring over table-sort.ts's sorting/serialization logic; uses SortableTable.messages.ts for en/nl text via useMessages().
 * @exports SortableTable, CsvExportTable, csvExportTable, useCsvExports
 */
import { useId, useState } from 'react';
import { downloadText } from './download.js';
import { type GlossaryTermId } from './astro-glossary.messages.js';
import { GlossaryTerm } from './GlossaryTerm.js';
import { useRegisterExports } from './export-registry.js';
import { useMessages } from './messages.js';
import { Tooltip } from './primitives/Tooltip.js';
import { sortableTableMessages } from './SortableTable.messages.js';
import {
  columnAlign,
  rowsToCsv,
  rowsToTsv,
  sortRows,
  toggleSort,
  type CellValue,
  type SortState,
  type TableColumn,
} from './table-sort.js';

/** Past this many rows a table scrolls inside its own frame, so its header can stay in view while the rows pass. */
const TALL_TABLE_ROWS = 12;

/** The mark an empty on-screen cell shows (#825). Not a message: every view already draws this same character. */
const EMPTY_CELL = '—';

/**
 * On-screen text for a plain-text cell (#825). An empty value (`''`, `null`, `undefined`) whose text is empty or the
 * dash draws the shared em dash. Other text stays as the view drew it, e.g. "Never seen" or a check mark. Copy, CSV and
 * PDF never reach this: they read `cellText` in `table-sort.ts`, which is unchanged.
 */
function screenText<T>(column: TableColumn<T>, row: T): string {
  const value = column.valueOf(row);
  if (isEmptyValue(value)) {
    const text = column.render ? column.render(row) : '';
    return text === '' || text === EMPTY_CELL ? EMPTY_CELL : text;
  }
  return column.render ? column.render(row) : String(value);
}

/** One table a screen offers as a CSV export in its page header (#887). */
export interface CsvExportTable {
  readonly key: string;
  readonly caption: string;
  readonly filename: string;
  readonly csv: () => string;
}

/** A header export for one table, built from its columns and rows in source order (not the on-screen sort). */
export function csvExportTable<T>(
  key: string,
  caption: string,
  filename: string,
  columns: readonly TableColumn<T>[],
  rows: readonly T[],
): CsvExportTable {
  return { key, caption, filename, csv: () => rowsToCsv(columns, rows) };
}

/**
 * Registers a screen's CSV tables as items of its page header's Export menu (#887). Pass `undefined` while the
 * screen has nothing to export. Call it before any early return, as with every hook.
 */
export function useCsvExports(tables: readonly CsvExportTable[] | undefined): void {
  const t = useMessages(sortableTableMessages);
  useRegisterExports(
    tables?.map((table) => ({
      key: table.key,
      label: t.csvLabel(table.caption),
      run: () => {
        downloadText(table.filename, table.csv(), 'text/csv;charset=utf-8');
      },
    })),
  );
}

/** True for a value that is absent rather than a real value: `''`, `null` or `undefined`. */
function isEmptyValue(value: CellValue | null | undefined): value is '' | null | undefined {
  return value === '' || value === null || value === undefined;
}

export function SortableTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  downloadFilename,
  selectedRowKey,
  wrap = false,
  headingLevel = 3,
  captionTerm,
}: {
  readonly caption: string;
  readonly columns: readonly TableColumn<T>[];
  readonly rows: readonly T[];
  readonly getRowKey: (row: T) => string;
  /**
   * Filename for this table's CSV download (#68), already derived from the person and chart. Omitted, the table
   * has no Copy or CSV buttons at all: for a table whose rows are not data to take away (a restore preview, an
   * account list), or whose screen already offers its own export.
   */
  readonly downloadFilename?: string | undefined;
  /** The row to mark as selected (#418): highlighted, and exposed to assistive technology as the current row. */
  readonly selectedRowKey?: string | undefined;
  /** True for a table of prose or controls (the admin tables, #428): cells wrap to the page width instead of scrolling sideways. */
  readonly wrap?: boolean;
  /** The caption's heading level: 2 where the page's own heading is an `h1`, so no level is skipped. */
  readonly headingLevel?: 2 | 3;
  /** A glossary term the caption names (#801): the caption text then opens that term's definition in place. On screen only. */
  readonly captionTerm?: GlossaryTermId | undefined;
}): React.JSX.Element {
  const t = useMessages(sortableTableMessages);
  const [sort, setSort] = useState<SortState>();
  const [copied, setCopied] = useState(false);
  const sorted = sortRows(rows, columns, sort);
  // The heading is a sibling of <table>, not a <caption> inside it (so the Copy/Download
  // buttons can sit next to it without ending up inside the table's accessibility tree) —
  // aria-labelledby recovers the same table/heading association a real <caption> gives (#69).
  const captionId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const aligns = new Map(columns.map((column) => [column.key, columnAlign(column, sorted)]));

  const copy = (): void => {
    void navigator.clipboard.writeText(rowsToTsv(columns, sorted)).then(
      () => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      },
      // A denied clipboard permission leaves the table exactly as it was; there is
      // nothing else to recover from, so this is deliberately silent.
      () => undefined,
    );
  };

  const download = (): void => {
    if (downloadFilename !== undefined)
      downloadText(downloadFilename, rowsToCsv(columns, sorted), 'text/csv;charset=utf-8');
  };

  return (
    <section className={wrap ? 'data-table data-table-wrap' : 'data-table'}>
      <div className="data-table-head">
        <Heading id={captionId}>
          {captionTerm === undefined ? caption : <GlossaryTerm id={captionTerm}>{caption}</GlossaryTerm>}
        </Heading>
        {downloadFilename !== undefined && (
          <div className="data-table-actions">
            <button type="button" className="quiet" onClick={copy}>
              {copied ? t.copied : t.copy}
            </button>
            <button type="button" className="quiet" onClick={download}>
              {t.downloadCsv}
            </button>
          </div>
        )}
      </div>
      <div
        className={sorted.length > TALL_TABLE_ROWS ? 'data-table-scroll data-table-scroll-tall' : 'data-table-scroll'}
      >
        <table aria-labelledby={captionId}>
          <thead>
            <tr>
              {columns.map((column) => {
                // A column's explanation is a real disclosure beside its sort button (#456, #508): the shared
                // Tooltip shows the same visible text on hover, click and keyboard focus, which a `title`
                // attribute does not reliably do for a keyboard user or a screen reader.
                return (
                  <th
                    key={column.key}
                    scope="col"
                    data-align={aligns.get(column.key)}
                    aria-sort={
                      sort?.column === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                  >
                    <span className="data-table-head-cell">
                      {column.sortable === false ? (
                        <span className="data-table-label">{column.label}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSort((current) => toggleSort(current, column.key));
                          }}
                        >
                          {column.label}
                          {sort?.column === column.key && (
                            <span aria-hidden="true">{sort.direction === 'asc' ? ' ▲' : ' ▼'}</span>
                          )}
                        </button>
                      )}
                      {column.labelTerm !== undefined && <GlossaryTerm id={column.labelTerm} />}
                      {column.labelTooltip !== undefined && (
                        <Tooltip
                          text={column.labelTooltip}
                          label={t.aboutColumn(column.label)}
                          className="data-table-help"
                        >
                          ?
                        </Tooltip>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const rowKey = getRowKey(row);
              const selected = selectedRowKey === rowKey;
              return (
                <tr
                  key={rowKey}
                  data-row-key={rowKey}
                  className={selected ? 'data-table-row-selected' : undefined}
                  aria-current={selected ? 'true' : undefined}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      data-align={aligns.get(column.key)}
                      className={column.wrapText ? 'data-table-cell-wrap' : undefined}
                    >
                      {column.renderCell ? column.renderCell(row) : screenText(column, row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
