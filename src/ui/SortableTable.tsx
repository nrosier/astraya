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
 * @purpose Generic, reusable data table with sortable column headers, resizable columns (#1301), a Copy-to-clipboard button, and a CSV download, used across every tabular view in the app.
 * @conventions Thin wiring over table-sort.ts's sorting/serialization logic; `memoizeRows` (#1440) re-renders a plain row only when its displayed text changes and table-column-width.ts's width arithmetic; uses SortableTable.messages.ts for en/nl text via useMessages(). Column widths are component state only (session-only, owner decision on #1301): never persisted, reset by the Reset action or a fresh mount.
 * @exports SortableTable, CsvExportTable, csvExportTable, useCsvExports
 */
import { memo, useId, useLayoutEffect, useRef, useState } from 'react';
import { downloadText } from './download.js';
import { type GlossaryTermId } from './astro-glossary.messages.js';
import { GlossaryTerm } from './GlossaryTerm.js';
import { useRegisterExports } from './export-registry.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { Tooltip } from './primitives/Tooltip.js';
import { sortableTableMessages } from './SortableTable.messages.js';
import { dragColumnWidth, keyboardColumnWidth, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from './table-column-width.js';
import {
  columnAlign,
  rowsToCsv,
  rowsToTsv,
  cellText,
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

/**
 * Two-way linking of a table's rows with a drawing of the same records (#1442). A row reports hover, focus and selection
 * and shows the hovered and selected state it is given back; `tint` gives a row its own colour (`--tech`) for the edge.
 */
export interface RowLinking<T> {
  readonly hoveredKey: string | undefined;
  readonly onHover: (key: string | undefined) => void;
  /** Click, or Enter or Space on the focused row. */
  readonly onSelect: (key: string) => void;
  readonly tint?: ((row: T) => string) | undefined;
}

interface MemoRowProps<T> {
  readonly row: T;
  readonly rowKey: string;
  readonly columns: readonly TableColumn<T>[];
  readonly aligns: ReadonlyMap<string, string | undefined>;
}

/** What a row shows: each cell's text, so two rows with the same text are the same row on screen. */
function shownCells<T>(columns: readonly TableColumn<T>[], row: T): string {
  return columns.map((column) => cellText(column, row)).join('\u0000');
}

/**
 * A plain body row that re-renders only when what it displays changes (#1440): a playback step hands the table new row
 * objects every time, but most rows show the same text as the step before. Only for a table that opts in with
 * `memoizeRows`, whose cells are fully described by their text.
 */
const MemoRow = memo(
  function MemoRow<T>({ row, rowKey, columns, aligns }: MemoRowProps<T>): React.JSX.Element {
    return (
      <tr data-row-key={rowKey}>
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
  },
  (previous, next) =>
    previous.rowKey === next.rowKey &&
    previous.columns.length === next.columns.length &&
    previous.columns.every((column, index) => column.key === next.columns[index]?.key) &&
    previous.columns.every((column) => previous.aligns.get(column.key) === next.aligns.get(column.key)) &&
    shownCells(previous.columns, previous.row) === shownCells(next.columns, next.row),
) as <T>(props: MemoRowProps<T>) => React.JSX.Element;

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
  linking,
  memoizeRows = false,
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
  /** Makes each row hoverable, focusable and selectable, to be linked with a drawing of the same records (#1442). */
  readonly linking?: RowLinking<T> | undefined;
  /** True for a table that redraws often with mostly unchanged rows (a playing animation, #1440): a row then re-renders only when its displayed text changes. Not with `linking`; a cell built by `renderCell` must be fully described by its `render` text. */
  readonly memoizeRows?: boolean;
}): React.JSX.Element {
  const t = useMessages(sortableTableMessages);
  const [sort, setSort] = useState<SortState>();
  const [copied, setCopied] = useState(false);
  // Column widths (#1301): empty until the first resize, then every column's measured width in px. They live in
  // state only, so they reset on each visit (owner decision on the issue); nothing is stored.
  const [widths, setWidths] = useState<Readonly<Record<string, number>>>({});
  const tableRef = useRef<HTMLTableElement>(null);
  const resized = Object.keys(widths).length > 0;
  const drag = useRef<{ startX: number; startWidth: number } | undefined>(undefined);

  /** Every column's current width, measured once so a fixed layout starts exactly where the automatic one was. */
  const measured = (): Record<string, number> => {
    if (resized) return { ...widths };
    const heads = tableRef.current?.querySelectorAll('thead th') ?? [];
    return Object.fromEntries(
      columns.map((column, index) => [column.key, Math.round(heads[index]?.getBoundingClientRect().width ?? 0)]),
    );
  };
  const setColumnWidth = (key: string, width: number): void => {
    setWidths({ ...measured(), [key]: width });
  };
  const widthOf = (key: string): number => widths[key] ?? 0;
  // The automatic layout's widths, read once the table is laid out, so a handle can always report its column's
  // current width (a focusable separator must carry a value) before anything has been resized.
  const [natural, setNatural] = useState<Readonly<Record<string, number>>>({});
  useLayoutEffect(() => {
    if (!resized) setNatural(measured());
    // Measuring needs only a change of columns or rows; `measured` is rebuilt every render.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [columns, rows, resized]);
  const currentWidth = (key: string): number => widths[key] ?? natural[key] ?? MIN_COLUMN_WIDTH;
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

  // Reset (#1301, owner decision): clears every column's width, which also reverts `resized` to false and
  // lets the natural, measured widths take over again on the next layout pass. Shown only once resized,
  // beside Copy/Download CSV, on every table this component renders — even one with no CSV download.
  const resetWidths = (): void => {
    setWidths({});
  };

  return (
    <section className={wrap ? 'data-table data-table-wrap' : 'data-table'}>
      <div className="data-table-head">
        <Heading id={captionId}>
          {captionTerm === undefined ? caption : <GlossaryTerm id={captionTerm}>{caption}</GlossaryTerm>}
        </Heading>
        {(downloadFilename !== undefined || resized) && (
          <div className="data-table-actions">
            {downloadFilename !== undefined && (
              <>
                <Button variant="quiet" onClick={copy}>
                  {copied ? t.copied : t.copy}
                </Button>
                <Button variant="quiet" onClick={download}>
                  {t.downloadCsv}
                </Button>
              </>
            )}
            {resized && (
              <Button variant="quiet" onClick={resetWidths}>
                {t.resetWidths}
              </Button>
            )}
          </div>
        )}
      </div>
      {/* A sideways-scrolling frame is a named region a keyboard can focus and scroll (#1076); the edge fade is its cue. */}
      <div
        className={sorted.length > TALL_TABLE_ROWS ? 'data-table-scroll data-table-scroll-tall' : 'data-table-scroll'}
        role="region"
        aria-labelledby={captionId}
        tabIndex={0}
      >
        <table
          ref={tableRef}
          aria-labelledby={captionId}
          className={resized ? 'data-table-resized' : undefined}
          style={resized ? { width: columns.reduce((sum, column) => sum + widthOf(column.key), 0) } : undefined}
        >
          {resized && (
            <colgroup>
              {columns.map((column) => (
                <col key={column.key} style={{ width: widthOf(column.key) }} />
              ))}
            </colgroup>
          )}
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
                        <Button
                          variant="plain"
                          onClick={() => {
                            setSort((current) => toggleSort(current, column.key));
                          }}
                        >
                          {column.label}
                          {sort?.column === column.key && (
                            <span aria-hidden="true">{sort.direction === 'asc' ? ' ▲' : ' ▼'}</span>
                          )}
                        </Button>
                      )}
                      {typeof column.labelHelp === 'string' && (
                        <GlossaryTerm
                          id={column.labelHelp}
                          label={t.aboutColumn(column.label)}
                          className="data-table-help primitive-tooltip-icon"
                        >
                          ?
                        </GlossaryTerm>
                      )}
                      {typeof column.labelHelp === 'object' && (
                        <Tooltip
                          text={column.labelHelp.text}
                          label={t.aboutColumn(column.label)}
                          className="data-table-help primitive-tooltip-icon"
                        >
                          ?
                        </Tooltip>
                      )}
                    </span>
                    <div
                      className="data-table-resize"
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={t.resizeColumn(column.label)}
                      aria-valuemin={MIN_COLUMN_WIDTH}
                      aria-valuemax={MAX_COLUMN_WIDTH}
                      aria-valuenow={currentWidth(column.key)}
                      aria-valuetext={t.columnWidth(currentWidth(column.key))}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        const next = keyboardColumnWidth(
                          measured()[column.key] ?? MIN_COLUMN_WIDTH,
                          event.key,
                          event.shiftKey,
                        );
                        if (next === undefined) return;
                        event.preventDefault();
                        setColumnWidth(column.key, next);
                      }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        drag.current = {
                          startX: event.clientX,
                          startWidth: measured()[column.key] ?? MIN_COLUMN_WIDTH,
                        };
                      }}
                      onPointerMove={(event) => {
                        if (drag.current === undefined) return;
                        setColumnWidth(
                          column.key,
                          dragColumnWidth(drag.current.startWidth, drag.current.startX, event.clientX),
                        );
                      }}
                      onPointerUp={(event) => {
                        drag.current = undefined;
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }}
                      onPointerCancel={() => {
                        drag.current = undefined;
                      }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const rowKey = getRowKey(row);
              if (memoizeRows && linking === undefined && selectedRowKey === undefined) {
                return <MemoRow key={rowKey} row={row} rowKey={rowKey} columns={columns} aligns={aligns} />;
              }
              const selected = selectedRowKey === rowKey;
              const linkedClass =
                linking === undefined
                  ? undefined
                  : `data-table-row-linked${linking.hoveredKey === rowKey ? ' data-table-row-hovered' : ''}`;
              const className = [selected ? 'data-table-row-selected' : undefined, linkedClass]
                .filter((value) => value !== undefined)
                .join(' ');
              return (
                <tr
                  key={rowKey}
                  data-row-key={rowKey}
                  className={className === '' ? undefined : className}
                  aria-current={selected ? 'true' : undefined}
                  {...(linking === undefined
                    ? {}
                    : {
                        tabIndex: 0,
                        style:
                          linking.tint === undefined
                            ? undefined
                            : ({ '--tech': linking.tint(row) } as React.CSSProperties),
                        onMouseEnter: () => {
                          linking.onHover(rowKey);
                        },
                        onMouseLeave: () => {
                          linking.onHover(undefined);
                        },
                        onFocus: () => {
                          linking.onHover(rowKey);
                        },
                        onBlur: () => {
                          linking.onHover(undefined);
                        },
                        onClick: () => {
                          linking.onSelect(rowKey);
                        },
                        onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                          // Only the row itself: Enter or Space on a control inside it keeps its own meaning.
                          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' '))
                            return;
                          event.preventDefault();
                          linking.onSelect(rowKey);
                        },
                      })}
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
