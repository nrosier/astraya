/**
 * What a table needs to be linked to the wheel's selection (#418, #511): the selection itself, how to toggle it, and
 * the "show on the chart" column every linked table carries.
 */
/**
 * @module ui/table-selection
 * @purpose The per-table side of the wheel selection contract: the `TableSelection` handed to a table, the selection key of each kind of row, and the shared "Show on the chart" button column.
 * @conventions Keys are built by `interpretation/selection-key.ts`, never by hand, so a table row, a wheel click and the inspector name the same selection the same way; the button is a real `<button>` with `aria-pressed`, so the keyboard reaches the wheel's selection too.
 * @exports TableSelection, bodySelectionKey, signSelectionKey, derivedSelectionKey, houseSelectionKey, aspectSelectionKey, selectColumn
 */
import { bodyId } from '../chart/body-id.js';
import type { AspectRow } from '../domain/chart-tables.js';
import { selectionKey } from '../interpretation/selection-key.js';
import type { chartViewMessages } from './ChartView.messages.js';
import type { TableColumn } from './table-sort.js';

/**
 * What a table needs to be linked to the wheel (#418): the wheel's current selection, how to toggle one, and
 * which bodies the wheel actually draws (an Ascendant row has no body symbol to select). Absent when the
 * table stands alone, as in the PDF export.
 */
export interface TableSelection {
  readonly selectedKey: string | undefined;
  readonly onToggle: (key: string) => void;
  /** Selects `key` and opens the Wheel view on it (#815); absent where a table has no wheel to go to. */
  readonly onShowOnWheel?: ((key: string) => void) | undefined;
  readonly selectableBodies: ReadonlySet<string>;
}

/** The wheel's selection key for a body, or an aspect between two. */
export const bodySelectionKey = (bodyKey: string): string => selectionKey.body(bodyId(bodyKey, 0));
/** The wheel's selection key for a sign: its lowercase name, as `data-sign` carries it. */
export const signSelectionKey = (signName: string): string => selectionKey.sign(signName);
/** The selection key for a derived point (#511): not drawn on the wheel, so only a table or a link makes it. */
export const derivedSelectionKey = (pointKey: string | undefined): string | undefined =>
  pointKey === undefined ? undefined : selectionKey.derived(pointKey);
/** The wheel's selection key for a house's cusp (#511). */
export const houseSelectionKey = (house: number): string => selectionKey.house(house);
export const aspectSelectionKey = (row: AspectRow): string =>
  selectionKey.aspect(bodyId(row.bodyAKey, 0), bodyId(row.bodyBKey, 0));

/** The column of "show on the chart" buttons: a real button per row, so the keyboard reaches the wheel's selection too. */
export function selectColumn<T>(
  t: typeof chartViewMessages.en,
  selection: TableSelection,
  keyOf: (row: T) => string | undefined,
  nameOf: (row: T) => string,
  labels: { readonly key: string; readonly column: string; readonly button: string } = {
    key: 'select',
    column: t.showOnChartColumn,
    button: t.showOnChartButton,
  },
  /** When true the button opens the Wheel view on the row's selection instead of toggling it (#815). */
  opensWheel = false,
): TableColumn<T> {
  return {
    key: labels.key,
    label: labels.column,
    // Its values are only a sort key (selected first); the cells are buttons, which read best from the start.
    align: 'start',
    valueOf: (row) => (keyOf(row) !== undefined && keyOf(row) === selection.selectedKey ? 0 : 1),
    renderCell: (row) => {
      const key = keyOf(row);
      if (key === undefined) return null;
      const show = opensWheel ? selection.onShowOnWheel : undefined;
      if (show !== undefined) {
        return (
          <button
            type="button"
            className="quiet"
            aria-label={t.showOnWheel(nameOf(row))}
            onClick={() => {
              show(key);
            }}
          >
            {labels.button}
          </button>
        );
      }
      return (
        <button
          type="button"
          className="quiet"
          aria-pressed={selection.selectedKey === key}
          aria-label={t.showOnChart(nameOf(row))}
          onClick={() => {
            selection.onToggle(key);
          }}
        >
          {labels.button}
        </button>
      );
    },
  };
}
