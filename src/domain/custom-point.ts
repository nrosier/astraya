/**
 * User-defined points (#566): a named point computed from a user-typed formula over this
 * chart's own bodies and angles — "Sun + Moon - Ascendant", matching the Lot of Fortune's own
 * day-formula shape (`arabic-parts.ts`'s `LotFormula.dayFormula`, shown there only as display
 * text, never parsed). `astrology/formula-parser.ts` is the safe parser/evaluator this builds
 * on; this module is only the "which identifier names does a chart actually have, and what are
 * their longitudes" half — the parser itself has no opinion on chart vocabulary.
 *
 * Deliberately the computational core only: parsing, identifier resolution, and the resulting
 * longitude. No persistence, no UI for naming/saving a formula, and no wiring into
 * `ChartData`'s own aspect/wheel/speed machinery (that would mean threading a new dynamic field
 * through `chart-compute.ts` the way `partOfFortune`/`partOfSpirit` already are, baked in at
 * natal-computation time — a materially bigger change than this pass, left for a follow-up once
 * there is a real UI/storage story to wire it into).
 */
/**
 * @module domain/custom-point
 * @purpose Resolves a chart's bodies/angles by name and evaluates a user-typed formula against them, as the computational core of user-defined points.
 * @conventions Identifier names are the same lowercase body keys `bodies.ts` already uses (`sun`, `moon`, …) plus `ascendant`/`midheaven`/`vertex`/`partoffortune`/`partofspirit` for the angles/lots `ChartData` carries directly (not in `positions`) — case-insensitive, matching how a user is likely to type a formula, not an enforced style. No wiring into ChartData's own aspect/wheel/speed pipeline — see the module's own header for why.
 * @exports resolveChartIdentifier, customPointLongitude
 */
import { bodyByKey } from '../astrology/bodies.js';
import { evaluateFormula, FormulaError, type IdentifierResolver } from '../astrology/formula-parser.js';
import type { Degrees } from '../ephemeris/types.js';
import type { ChartData } from './chart-compute.js';

// A `Map`, not a plain object literal: an object literal's lookup falls through the prototype
// chain, so a user-typed name like "__proto__"/"constructor" would silently resolve to a
// built-in object instead of `undefined` — a real footgun for a resolver keyed by untrusted
// input. `Map.get` has no such fallthrough.
const ANGLE_RESOLVERS: ReadonlyMap<string, (data: ChartData) => Degrees> = new Map([
  ['ascendant', (data: ChartData) => data.houses.ascendant],
  ['asc', (data: ChartData) => data.houses.ascendant],
  ['midheaven', (data: ChartData) => data.houses.midheaven],
  ['mc', (data: ChartData) => data.houses.midheaven],
  ['vertex', (data: ChartData) => data.houses.vertex],
  ['partoffortune', (data: ChartData) => data.partOfFortune],
  ['fortune', (data: ChartData) => data.partOfFortune],
  ['partofspirit', (data: ChartData) => data.partOfSpirit],
  ['spirit', (data: ChartData) => data.partOfSpirit],
]);

/**
 * Resolves one identifier name (a body key or an angle/lot name, case-insensitive) to its
 * longitude in `data`, or `undefined` if the name is unrecognised or that body isn't present in
 * this chart's own position list (e.g. a modern point hidden by the active visibility policy).
 */
export function resolveChartIdentifier(data: ChartData, name: string): Degrees | undefined {
  const lower = name.toLowerCase();
  const angle = ANGLE_RESOLVERS.get(lower);
  if (angle !== undefined) return angle(data);
  const body = bodyByKey(lower);
  if (body === undefined) return undefined;
  return data.positions.find((position) => position.body === body.id)?.longitude;
}

/** Evaluates `formula` against `data`'s own bodies/angles, wrapped into [0, 360). Throws `FormulaError` on any parse or unresolved-name failure — the caller decides how to surface that to a user. */
export function customPointLongitude(data: ChartData, formula: string): Degrees {
  const resolve: IdentifierResolver = (name) => resolveChartIdentifier(data, name);
  return evaluateFormula(formula, resolve);
}

export { FormulaError };
