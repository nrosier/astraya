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
 * - **A house cusp:** the sign on it, then each planet in that house.
 * - **A derived point** (Part of Fortune or Spirit): the point in its sign, then in its house.
 * - **An aspect line:** that one pair.
 */
/**
 * @module interpretation/selection
 * @purpose Determines which interpretation entries belong to a wheel selection (a clicked planet, sign, house cusp, or aspect line), so the wheel's shown text matches the Interpretation tab's report exactly.
 * @conventions Selects from the same derivePlacements/rankPlacements the report is built from, ordered by the same salience, so the wheel can never show text the report doesn't or in a different order. Selection keys are parsed from the wheel's own `body:<id>`/`sign:<name>`/`house:<n>`/`derived:<point>`/`aspect:<idA>|<idB>` string format.
 * @exports WheelSelection, parseSelectionKey, selectionPlacements
 */
import { bodyByKey } from '../astrology/bodies.js';
import { isDerivedPointKey, type DerivedPointKey } from '../astrology/derived-points.js';
import { degreeSymbolNumber, SIGNS } from '../astrology/signs.js';
import { parseBodyId } from '../chart/body-id.js';
import type { ChartData } from '../domain/chart-compute.js';
import { derivedPointPlacementFacts } from '../domain/derived-point-position.js';
import { derivePlacements, rankPlacements, type SalientPlacement } from './rules.js';
import { placementKey, type CorpusPlacement } from './schema.js';

export type WheelSelection =
  | { readonly kind: 'body'; readonly key: string; readonly ring: number }
  | { readonly kind: 'sign'; readonly signIndex: number }
  | { readonly kind: 'house'; readonly house: number }
  | { readonly kind: 'derived'; readonly point: DerivedPointKey }
  | {
      readonly kind: 'aspect';
      readonly bodyA: string;
      readonly ringA: number;
      readonly bodyB: string;
      readonly ringB: number;
    };

/**
 * Reads the wheel's selection key: `body:<id>`, `sign:<lowercase sign name>`, `house:<1-12>` (a house's
 * cusp) or `aspect:<idA>|<idB>`,
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
  if (kind === 'derived') {
    return isDerivedPointKey(value) ? { kind: 'derived', point: value } : undefined;
  }
  if (kind === 'house') {
    const house = Number(value);
    return Number.isInteger(house) && house >= 1 && house <= 12 ? { kind: 'house', house } : undefined;
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
    case 'derived':
      // A derived point's placements are built from its own position, never filtered out of the chart's set.
      return false;
    case 'house':
      return (
        (placement.category === 'sign-on-cusp' || placement.category === 'planet-in-house') &&
        placement.house === selection.house
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

/** A house reads cusp first, then who is in it. */
const HOUSE_CATEGORY_ORDER: readonly string[] = ['sign-on-cusp', 'planet-in-house'];

function categoryRank(item: SalientPlacement, selection: WheelSelection): number {
  const order = selection.kind === 'house' ? HOUSE_CATEGORY_ORDER : CATEGORY_ORDER;
  const index = order.indexOf(item.placement.category);
  return index === -1 ? order.length : index;
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

/**
 * A derived point's meaning (#511): where it falls, as a sign entry and then, when the chart has houses, a
 * house entry. Built from the point's own position rather than ranked out of `derivePlacements`, which
 * covers bodies only; `salience: 0` and no factors, the same "enumerated, not selected" shape the
 * degree-symbol entry uses.
 */
function derivedPointPlacements(chart: ChartData, point: DerivedPointKey): readonly SalientPlacement[] {
  const facts = derivedPointPlacementFacts(chart, point);
  const placements: CorpusPlacement[] = [{ category: 'derived-point-in-sign', point, sign: facts.sign }];
  if (facts.house !== undefined) placements.push({ category: 'derived-point-in-house', point, house: facts.house });
  return placements.map((placement) => ({ placement, key: placementKey(placement), salience: 0, factors: [] }));
}

/** The chart's placements that belong to `selection`: basics first, then aspects, then (for a body) its degree-symbol last; most salient first within each. */
export function selectionPlacements(chart: ChartData, selection: WheelSelection): readonly SalientPlacement[] {
  if (selection.kind === 'derived') return derivedPointPlacements(chart, selection.point);
  // `rankPlacements` already orders by salience, and `sort` is stable, so within a kind that order holds.
  const ranked = rankPlacements(derivePlacements(chart))
    .filter((item) => matches(item, selection))
    .sort((a, b) => categoryRank(a, selection) - categoryRank(b, selection));
  if (selection.kind !== 'body') return ranked;
  const degreeSymbol = degreeSymbolPlacement(chart, selection.key);
  return degreeSymbol === undefined ? ranked : [...ranked, degreeSymbol];
}
