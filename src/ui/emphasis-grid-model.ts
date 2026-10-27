/**
 * @module ui/emphasis-grid-model
 * @purpose Arranges the chart's bodies into the on-screen element x modality grid (#821): twelve cells plus row and column totals.
 * @conventions Pure. Totals come from `elementBalance`/`modalityBalance` as the sheet export's drawing does, so weights apply to the margins only. The export drawing (`chart/emphasis-grid`) is not used or changed here.
 * @exports ELEMENT_ROWS, MODALITY_COLUMNS, EmphasisGridCell, EmphasisGridRow, EmphasisGridModel, buildEmphasisGridModel, formatEmphasisTotal
 */
import { formatFixed } from './format.js';
import { elementBalance, modalityBalance } from '../astrology/emphasis.js';
import { signOf, type Element, type Modality } from '../astrology/signs.js';
import type { BodyId, Degrees } from '../ephemeris/types.js';
import type { EmphasisGridInput } from '../chart/emphasis-grid.js';

export const ELEMENT_ROWS: readonly Element[] = ['fire', 'earth', 'air', 'water'];
export const MODALITY_COLUMNS: readonly Modality[] = ['cardinal', 'fixed', 'mutable'];

export interface EmphasisGridCell {
  readonly modality: Modality;
  /** `bodyGlyph` keys of the bodies in this cell, in input order. */
  readonly bodyKeys: readonly string[];
}

export interface EmphasisGridRow {
  readonly element: Element;
  readonly cells: readonly EmphasisGridCell[];
  readonly total: number;
}

export interface EmphasisGridModel {
  readonly rows: readonly EmphasisGridRow[];
  readonly columnTotals: Readonly<Record<Modality, number>>;
}

/** A total without a pointless `.0` on whole numbers, as the sheet's drawing writes it. */
export function formatEmphasisTotal(value: number): string {
  return Number.isInteger(value) ? String(value) : formatFixed(value, 1);
}

export function buildEmphasisGridModel(input: EmphasisGridInput): EmphasisGridModel {
  const positions = new Map<BodyId, Degrees>(input.bodies.map((body) => [body.body, body.longitude]));
  const elements = elementBalance(positions, input.weights);
  const modalities = modalityBalance(positions, input.weights);
  const rows = ELEMENT_ROWS.map((element): EmphasisGridRow => ({
    element,
    cells: MODALITY_COLUMNS.map((modality): EmphasisGridCell => ({
      modality,
      bodyKeys: input.bodies
        .filter((body) => {
          const sign = signOf(body.longitude);
          return sign.element === element && sign.modality === modality;
        })
        .map((body) => body.key),
    })),
    total: elements[element],
  }));
  return { rows, columnTotals: modalities };
}
