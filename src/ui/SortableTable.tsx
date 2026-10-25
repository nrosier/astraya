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
 * @exports SortableTable
 */
import { useId, useState } from 'react';
import { downloadText } from './download.js';
import { astroGlossaryMessages, type GlossaryTermId } from './astro-glossary.messages.js';
import { GlossaryTerm } from './GlossaryTerm.js';
import { useMessages } from './messages.js';
import { Tooltip } from './primitives/Tooltip.js';
import { sortableTableMessages } from './SortableTable.messages.js';
import {
  columnAlign,
  rowsToCsv,
  rowsToTsv,
  sortRows,
  toggleSort,
  type SortState,
  type TableColumn,
} from './table-sort.js';

/** Past this many rows a table scrolls inside its own frame, so its header can stay in view while the rows pass. */
const TALL_TABLE_ROWS = 12;

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
  glossaryTerms,
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
  /** Column keys whose header names a glossary term (#801): a help trigger beside the label opens the definition. On screen only. */
  readonly glossaryTerms?: Readonly<Record<string, GlossaryTermId>> | undefined;
}): React.JSX.Element {
  const t = useMessages(sortableTableMessages);
  const glossary = useMessages(astroGlossaryMessages);
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
                const term = glossaryTerms?.[column.key];
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
                      {term !== undefined && (
                        <GlossaryTerm id={term} label={t.aboutColumn(glossary[term].name)}>
                          ?
                        </GlossaryTerm>
                      )}
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
                      {column.renderCell
                        ? column.renderCell(row)
                        : column.render
                          ? column.render(row)
                          : String(column.valueOf(row))}
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
