/**
 * Which interpretation entries belong to a selection on the chart wheel (#415).
 *
 * Clicking a planet, a sign or an aspect line on the wheel (#400, #412) isolates it; this says which
 * of the chart's placements to show the written text for. It selects from `derivePlacements` — the
 * exact set the Interpretation tab's report is built from — and orders it by the same salience, so
 * the wheel can never say something the report doesn't, or say it in a different order.
 *
 * - **A planet:** its sign, its house, its dignity if it has one, every aspect it is part of, and
 *   (#405/#484) its own degree-symbol — appended last, unranked, since `rules.ts` has nothing to
 *   weigh a bare degree against.
 * - **A sign:** each planet in that sign, and the house cusp(s) that fall in it. (A sign has no entry
 *   of its own: what is written is about placements *in* it.)
 * - **An aspect line:** that one pair.
 */
/**
 * @module interpretation/selection
 * @purpose Determines which interpretation entries belong to a wheel selection (a clicked planet, sign, or aspect line), so the wheel's shown text matches the Interpretation tab's report exactly.
 * @conventions Selects from the same derivePlacements/rankPlacements the report is built from, ordered by the same salience, so the wheel can never show text the report doesn't or in a different order. Selection keys are parsed from the wheel's own `body:<id>`/`sign:<name>`/`aspect:<idA>|<idB>` string format.
 * @exports WheelSelection, parseSelectionKey, selectionPlacements
 */
import { bodyByKey } from '../astrology/bodies.js';
import { degreeSymbolNumber, SIGNS } from '../astrology/signs.js';
import { parseBodyId } from '../chart/body-id.js';
import type { ChartData } from '../domain/chart-compute.js';
import { derivePlacements, rankPlacements, type SalientPlacement } from './rules.js';
import { placementKey } from './schema.js';

export type WheelSelection =
  | { readonly kind: 'body'; readonly key: string; readonly ring: number }
  | { readonly kind: 'sign'; readonly signIndex: number }
  | {
      readonly kind: 'aspect';
      readonly bodyA: string;
      readonly ringA: number;
      readonly bodyB: string;
      readonly ringB: number;
    };

/**
 * Reads the wheel's selection key: `body:<id>`, `sign:<lowercase sign name>` or `aspect:<idA>|<idB>`,
 * where an id is a body key with an optional ring (`sun`, or `sun@1` — see `chart/body-id.ts`; a
 * bare key is ring 0). `undefined` for anything else, including a sign that does not exist.
 */
export function parseSelectionKey(key: string): WheelSelection | undefined {
  const colon = key.indexOf(':');
  if (colon === -1) return undefined;
  const kind = key.slice(0, colon);
  const value = key.slice(colon + 1);
  if (kind === 'body') {
    const { key: bodyKey, ring } = parseBodyId(value);
    return bodyKey === '' ? undefined : { kind: 'body', key: bodyKey, ring };
  }
  if (kind === 'sign') {
    const signIndex = SIGNS.findIndex((sign) => sign.name.toLowerCase() === value);
    return signIndex === -1 ? undefined : { kind: 'sign', signIndex };
  }
  if (kind === 'aspect') {
    const [idA, idB] = value.split('|');
    if (idA === undefined || idB === undefined) return undefined;
    const a = parseBodyId(idA);
    const b = parseBodyId(idB);
    return a.key === '' || b.key === ''
      ? undefined
      : { kind: 'aspect', bodyA: a.key, ringA: a.ring, bodyB: b.key, ringB: b.ring };
  }
  return undefined;
}

function matches(item: SalientPlacement, selection: WheelSelection): boolean {
  const placement = item.placement;
  switch (selection.kind) {
    case 'body':
      switch (placement.category) {
        case 'planet-in-sign':
        case 'planet-in-house':
        case 'dignity-state':
          return placement.body === selection.key;
        case 'aspect-pair':
          return placement.bodyA === selection.key || placement.bodyB === selection.key;
        default:
          return false;
      }
    case 'sign':
      return (
        (placement.category === 'planet-in-sign' || placement.category === 'sign-on-cusp') &&
        placement.sign === selection.signIndex
      );
    case 'aspect':
      return (
        placement.category === 'aspect-pair' &&
        ((placement.bodyA === selection.bodyA && placement.bodyB === selection.bodyB) ||
          (placement.bodyA === selection.bodyB && placement.bodyB === selection.bodyA))
      );
  }
}

/** The order kinds of placement are shown in: what a planet *is* before how it relates. */
const CATEGORY_ORDER: readonly string[] = [
  'planet-in-sign',
  'planet-in-house',
  'dignity-state',
  'sign-on-cusp',
  'aspect-pair',
];

function categoryRank(item: SalientPlacement): number {
  const index = CATEGORY_ORDER.indexOf(item.placement.category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

/**
 * A clicked body's own degree-symbol (#405/#484), appended after everything `rules.ts` ranks —
 * never submitted to that ranking itself. `degree-symbol` has no dignity/sect/angularity/aspect
 * field for `rules.ts`'s weighting to key off (it is a bare degree, not a chart-relative fact),
 * so it is built directly here with `salience: 0` and no factors, the same "enumerated, not
 * selected" shape `report.ts`'s own degree-symbol paragraphs use. `undefined` when the clicked
 * key is not a real body (the Ascendant/Midheaven are angles, not wheel-selectable bodies, so
 * this never needs to run for them).
 */
function degreeSymbolPlacement(chart: ChartData, bodyKey: string): SalientPlacement | undefined {
  const body = bodyByKey(bodyKey);
  if (body === undefined) return undefined;
  const position = chart.positions.find((candidate) => candidate.body === body.id);
  if (position === undefined) return undefined;
  const placement = { category: 'degree-symbol' as const, degree: degreeSymbolNumber(position.longitude) };
  return { placement, key: placementKey(placement), salience: 0, factors: [] };
}

/** The chart's placements that belong to `selection`: basics first, then aspects, then (for a body) its degree-symbol last; most salient first within each. */
export function selectionPlacements(chart: ChartData, selection: WheelSelection): readonly SalientPlacement[] {
  // `rankPlacements` already orders by salience, and `sort` is stable, so within a kind that order holds.
  const ranked = rankPlacements(derivePlacements(chart))
    .filter((item) => matches(item, selection))
    .sort((a, b) => categoryRank(a) - categoryRank(b));
  if (selection.kind !== 'body') return ranked;
  const degreeSymbol = degreeSymbolPlacement(chart, selection.key);
  return degreeSymbol === undefined ? ranked : [...ranked, degreeSymbol];
}
