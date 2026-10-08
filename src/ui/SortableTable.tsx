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
import { useMessages } from './messages.js';
import { sortableTableMessages } from './SortableTable.messages.js';
import { rowsToCsv, rowsToTsv, sortRows, toggleSort, type SortState, type TableColumn } from './table-sort.js';

export function SortableTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  downloadFilename,
  selectedRowKey,
}: {
  readonly caption: string;
  readonly columns: readonly TableColumn<T>[];
  readonly rows: readonly T[];
  readonly getRowKey: (row: T) => string;
  /** Filename for this table's CSV download (#68), already derived from the person and chart. */
  readonly downloadFilename: string;
  /** The row to mark as selected (#418): highlighted, and exposed to assistive technology as the current row. */
  readonly selectedRowKey?: string | undefined;
}): React.JSX.Element {
  const t = useMessages(sortableTableMessages);
  const [sort, setSort] = useState<SortState>();
  const [copied, setCopied] = useState(false);
  const sorted = sortRows(rows, columns, sort);
  // The heading is a sibling of <table>, not a <caption> inside it (so the Copy/Download
  // buttons can sit next to it without ending up inside the table's accessibility tree) —
  // aria-labelledby recovers the same table/heading association a real <caption> gives (#69).
  const captionId = useId();
  // Shared prefix for the sr-only tooltip-description spans (#456) — one id per column, derived
  // from this plus the column key, so each gets a stable, unique id without a useId() call per
  // column (columns.map runs every render; useId() must be called the same number of times).
  const tooltipIdPrefix = useId();

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
    downloadText(downloadFilename, rowsToCsv(columns, sorted), 'text/csv;charset=utf-8');
  };

  return (
    <section className="data-table">
      <div className="data-table-head">
        <h3 id={captionId}>{caption}</h3>
        <div className="data-table-actions">
          <button type="button" className="quiet" onClick={copy}>
            {copied ? t.copied : t.copy}
          </button>
          <button type="button" className="quiet" onClick={download}>
            {t.downloadCsv}
          </button>
        </div>
      </div>
      <div className="data-table-scroll">
        <table aria-labelledby={captionId}>
          <thead>
            <tr>
              {columns.map((column) => {
                // `title` alone only reaches a mouse-hover user (#456): it isn't reliably shown on
                // keyboard focus and isn't reliably announced by screen readers either. Pairing it
                // with `aria-describedby` onto a `.sr-only` span exposes the same text as an
                // accessible description regardless of input method — same shape as AppNav.tsx's
                // disabled-tab fix, except here the tooltip is a *description* of an otherwise
                // unchanged button name, not a replacement for it, so aria-describedby rather than
                // aria-label.
                const tooltipId = column.labelTooltip ? `${tooltipIdPrefix}-${column.key}` : undefined;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      sort?.column === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                  >
                    <button
                      type="button"
                      aria-describedby={tooltipId}
                      onClick={() => {
                        setSort((current) => toggleSort(current, column.key));
                      }}
                    >
                      {column.labelTooltip ? (
                        <span title={column.labelTooltip} style={{ cursor: 'help' }}>
                          {column.label}
                        </span>
                      ) : (
                        column.label
                      )}
                      {sort?.column === column.key && (
                        <span aria-hidden="true">{sort.direction === 'asc' ? ' ▲' : ' ▼'}</span>
                      )}
                    </button>
                    {tooltipId && (
                      <span id={tooltipId} className="sr-only">
                        {column.labelTooltip}
                      </span>
                    )}
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
                    <td key={column.key} className={column.wrapText ? 'data-table-cell-wrap' : undefined}>
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
