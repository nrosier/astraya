/**
 * @module ui/ConsultationTransitTable
 * @purpose The consultation's transit table (#800): Aspect, Orb, State and Next exact date, as a SortableTable.
 * @conventions Presentational; the caller words every cell (and owns the en/nl text). Columns are not sortable, so the ranked order stays. The shared data-table frame scrolls sideways on a phone instead of restacking. A row without a next exact pass shows an em dash with the accessible name `noPass` (D-800b).
 * @exports ConsultationTransitTable, TransitTableRow, TransitTableLabels
 */
import { AspectState } from './ChartViewAspects.js';
import { SortableTable } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';

export interface TransitTableRow {
  readonly key: string;
  readonly aspect: string;
  readonly orb: string;
  readonly state: string;
  readonly applying: boolean;
  /** The next exact date as `YYYY-MM-DD`; `undefined` once every exact pass is behind or none is known. */
  readonly nextExact: string | undefined;
}

export interface TransitTableLabels {
  readonly aspect: string;
  readonly orb: string;
  readonly state: string;
  readonly nextExact: string;
  /** Accessible name of the em dash shown when there is no further exact pass. */
  readonly noPass: string;
}

export function ConsultationTransitTable({
  caption,
  labels,
  rows,
}: {
  readonly caption: string;
  readonly labels: TransitTableLabels;
  readonly rows: readonly TransitTableRow[];
}): React.JSX.Element {
  const columns: readonly TableColumn<TransitTableRow>[] = [
    { key: 'aspect', label: labels.aspect, valueOf: (row) => row.aspect, sortable: false },
    { key: 'orb', label: labels.orb, valueOf: (row) => row.orb, align: 'end', sortable: false },
    {
      key: 'state',
      label: labels.state,
      valueOf: (row) => row.state,
      renderCell: (row) => <AspectState applying={row.applying} label={row.state} />,
      sortable: false,
    },
    {
      key: 'next',
      label: labels.nextExact,
      valueOf: (row) => row.nextExact ?? '',
      renderCell: (row) =>
        row.nextExact === undefined ? (
          <span className="consultation-dash" role="img" aria-label={labels.noPass}>
            —
          </span>
        ) : (
          <time className="consultation-date" dateTime={row.nextExact}>
            {row.nextExact}
          </time>
        ),
      sortable: false,
    },
  ];
  return <SortableTable caption={caption} columns={columns} rows={rows} getRowKey={(row) => row.key} />;
}
