/**
 * The sign-ruler context for one selected sign (#1998): the sign, the houses whose cusp lies in it,
 * its ruler or rulers with their placement and aspects, and the bodies standing in it, so a model
 * can synthesize how the whole sign operates in this chart.
 *
 * Conventions, stated rather than picked silently:
 *
 * - **Cusp houses** are the houses whose cusp lies in the sign, as cast with the chart's own house
 *   system. Source: Lilly, *Christian Astrology* (1647), p. 49: a house's significator is the lord
 *   of the sign on its cusp (repo copy `docs/references/text/lilly-christian-astrology-houlding-1647.txt`).
 *   Whole Sign and Equal give exactly one; a quadrant system can give none (an intercepted sign,
 *   which then names the house it sits in) or two.
 * - **Rulers follow the reader's choice** (`rulership.ts`, #426) through `rulersOf`: one under
 *   Modern or Traditional (the setting's ruler only, decision O1), two under Both for Scorpio,
 *   Aquarius and Pisces, traditional first. Each says whether it is the `shared` ruler (both
 *   schemes agree), or the `traditional` or `modern` one.
 * - **Each ruler's placement and aspects** are exactly what the focus payload says for that planet
 *   (`buildFocusObjectContext`), so the two payloads never disagree.
 * - **Occupants** are the bodies in the sign, limited to `occupantKeys` when given (the selection
 *   inspector's list, decision O4), without their own aspects (decision O2).
 * - A chart with no usable houses (no birth time) leaves every house field empty (`[]`, `null`,
 *   `false`); the sign-level facts remain.
 */
/**
 * @module interpretation/sign-context
 * @purpose Builds the de-identified sign-ruler context (cusp houses, ruler placement and aspects, bodies in the sign) that a Tier-2 "sign" request sends to the model.
 * @conventions Cusp houses are those whose cusp lies in the sign (Lilly 1647 p. 49); rulers come from `rulersOf` under the reader's rulership choice; each ruler's placement and aspects reuse `buildFocusObjectContext`; occupants follow the caller's `occupantKeys` (the inspector's list) and carry no aspects; no houses means empty house fields. Natal only.
 * @exports buildSignContext
 */
import { bodyById } from '../astrology/bodies.js';
import { rulerOf } from '../astrology/dignities.js';
import { houseOf } from '../astrology/emphasis.js';
import { rulersOf, type RulershipChoice } from '../astrology/rulership.js';
import { SIGNS } from '../astrology/signs.js';
import { housesAreDefined, type ChartData } from '../domain/chart-compute.js';
import { buildFocusObjectContext } from './focus-context.js';
import { HOUSE_COUNT } from './focus-context-schema.js';
import type { SignContext, SignOccupant, SignRuler, SignRulerScheme } from './sign-context-schema.js';

function norm360(degrees: number): number {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/** The houses (1-based) whose cusp lies in `sign`; none without houses. */
function cuspHousesIn(chart: ChartData, sign: number): readonly number[] {
  if (!housesAreDefined(chart.houses)) return [];
  const houses: number[] = [];
  for (let house = 1; house <= HOUSE_COUNT; house++) {
    const cusp = chart.houses.cusps[house];
    if (cusp !== undefined && Math.floor(norm360(cusp) / 30) === sign) houses.push(house);
  }
  return houses;
}

/** Which scheme a ruler of `sign` belongs to under `rulership`, given how many rulers there are. */
function schemeOf(sign: number, rulership: RulershipChoice, index: number, count: number): SignRulerScheme {
  if (rulerOf(sign, 'traditional') === rulerOf(sign, 'modern')) return 'shared';
  if (rulership === 'both') return count > 1 && index === 1 ? 'modern' : 'traditional';
  return rulership;
}

/**
 * The context for the sign at `signIndex` (0 = Aries) in `natal`, or `undefined` when the index is
 * out of range or a ruler is not among the chart's bodies. `occupantKeys`, when given, limits and
 * orders the occupants (the inspector's `bodiesInSign`); without it, every body in the sign is listed.
 */
export function buildSignContext(
  natal: ChartData,
  signIndex: number,
  rulership: RulershipChoice,
  occupantKeys?: readonly string[],
): SignContext | undefined {
  const sign = SIGNS[signIndex];
  if (sign === undefined) return undefined;

  const rulerIds = rulersOf(signIndex, rulership);
  const rulers: SignRuler[] = [];
  for (const [index, id] of rulerIds.entries()) {
    const key = bodyById(id)?.key;
    const focus = key === undefined ? undefined : buildFocusObjectContext(natal, key, undefined, rulership);
    if (focus === undefined) return undefined;
    rulers.push({
      scheme: schemeOf(signIndex, rulership, index, rulerIds.length),
      placement: focus.focus_object,
      aspects: focus.aspects,
    });
  }

  const inSign = natal.positions
    .filter((position) => Math.floor(norm360(position.longitude) / 30) === signIndex)
    .map((position) => bodyById(position.body)?.key)
    .filter((key): key is string => key !== undefined);
  const keys = occupantKeys === undefined ? inSign : occupantKeys.filter((key) => inSign.includes(key));
  const occupants: SignOccupant[] = [];
  for (const key of new Set(keys)) {
    const focus = buildFocusObjectContext(natal, key, undefined, rulership)?.focus_object;
    if (focus === undefined) continue;
    occupants.push({
      key,
      house: focus.house,
      rules_houses: focus.rules_houses,
      is_chart_ruler: focus.is_chart_ruler,
      on_angle: focus.on_angle,
      angle: focus.angle,
    });
  }

  const cuspHouses = cuspHousesIn(natal, signIndex);
  // A sign with no cusp in it, in a chart with houses, lies wholly inside one house: any point of it names that house.
  const intercepted =
    cuspHouses.length === 0 && housesAreDefined(natal.houses) ? houseOf(signIndex * 30 + 15, natal.houses.cusps) : null;

  return {
    perspective: 'natal',
    rulership,
    sign: sign.name,
    cusp_houses: cuspHouses,
    intercepted_in_house: intercepted,
    rulers,
    occupants,
  };
}
