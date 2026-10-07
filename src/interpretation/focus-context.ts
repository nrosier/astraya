/**
 * The enriched context for one selected placement (#424): everything a model needs to explain the
 * tensions of *that* planet — its sign, house, dispositor, the houses it rules, and each aspect it
 * makes, with the other planet's sign, house and rulerships — as a small structured payload, and
 * the closed-set validator the server runs on it before it reaches a prompt.
 *
 * Conventions, stated rather than picked silently:
 *
 * - **Rulers follow the reader's choice** (`rulership.ts`, #426): modern by default (Pluto rules
 *   Scorpio, Uranus Aquarius, Neptune Pisces), traditional, or both as co-rulers. The payload says
 *   which (`rulership`) so the model reads it the same way, and it applies to the dispositor, the
 *   chart ruler and the house rulerships alike. Under Both a planet is the chart ruler or rules a
 *   house if it is either co-ruler, and `co_dispositor` names the second ruler of its sign.
 * - **A planet rules a house when it rules the sign on that house's cusp** (the cusps the chart
 *   was cast with). A sign that sits inside a house without touching a cusp (an intercepted sign)
 *   gives its ruler nothing extra, and a planet can rule none, one or several houses.
 * - **The chart ruler** is the ruler of the sign the Ascendant is in.
 * - **On an angle** means within `ANGLE_ORB_DEG` of the Ascendant, Midheaven, Descendant (the
 *   Ascendant's opposite) or Imum Coeli (the Midheaven's opposite), by ecliptic longitude.
 * - **Aspects** are the chart's own, as calculated with its orb settings, so the payload matches
 *   what the wheel and the tables show; tightest first.
 * - A chart with no usable houses (no birth time) has no house, no house rulerships, no chart
 *   ruler and no angle: those fields are `null`, `[]` or `false`, and the sign-level facts remain.
 *
 * Only the selected object's own data is sent — not the whole chart — and nothing that identifies
 * anyone: no name, date, time or place.
 */
/**
 * @module interpretation/focus-context
 * @purpose Builds the enriched, de-identified context for one selected placement (sign, house, dispositor, ruled houses, aspects) that a Tier-2 "focus" request sends to the model.
 * @conventions Rulers follow the reader's rulership choice (modern/traditional/both). A planet rules a house when it rules the sign on that house's cusp (intercepted signs give nothing extra). "On an angle" means within ANGLE_ORB_DEG of ASC/MC/DSC/IC by ecliptic longitude. Aspects are the chart's own, computed with its own orb settings, tightest first. A chart with no usable houses (no birth time) leaves house/ruler/angle fields null/[]/false rather than guessing. Only the selected object's own data is included — no name, date, time or place.
 * @exports ANGLE_ORB_DEG, FocusTransit, buildFocusObjectContext (plus re-exports from focus-context-schema.ts)
 */
import type { Aspect } from '../astrology/aspects.js';
import { bodyById, bodyByKey } from '../astrology/bodies.js';
import { DEFAULT_RULERSHIP_CHOICE, rulersOf, type RulershipChoice } from '../astrology/rulership.js';
import { houseOf } from '../astrology/emphasis.js';
import { SIGNS } from '../astrology/signs.js';
import { housesAreDefined, type ChartData } from '../domain/chart-compute.js';
import type { Degrees } from '../ephemeris/types.js';
import {
  MAX_FOCUS_ASPECTS,
  roundOrb,
  type FocusAngle,
  type FocusAspect,
  type FocusContext,
} from './focus-context-schema.js';

export * from './focus-context-schema.js';

export const ANGLE_ORB_DEG = 5;
const HOUSE_COUNT = 12;

/** A transiting planet's own chart and its contacts to the natal chart, for a transit-view selection. */
export interface FocusTransit {
  readonly chart: ChartData;
  /** Contacts from the transiting bodies (`bodyA`) to the natal ones (`bodyB`). */
  readonly contacts: readonly Aspect[];
}

function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

function separation(a: Degrees, b: Degrees): Degrees {
  const diff = norm360(a - b);
  return diff > 180 ? 360 - diff : diff;
}

function signNameOf(longitude: Degrees): string {
  return SIGNS[Math.floor(norm360(longitude) / 30)]?.name ?? '';
}

function keyOfBody(id: number): string {
  return bodyById(id)?.key ?? '';
}

/** The houses (1-based) whose cusp is in a sign `bodyKey` rules. */
function housesRuledBy(bodyKey: string, chart: ChartData, rulership: RulershipChoice): readonly number[] {
  if (!housesAreDefined(chart.houses)) return [];
  const ruled: number[] = [];
  for (let house = 1; house <= HOUSE_COUNT; house++) {
    const cusp = chart.houses.cusps[house];
    if (cusp === undefined) continue;
    if (rulerKeys(Math.floor(norm360(cusp) / 30), rulership).includes(bodyKey)) ruled.push(house);
  }
  return ruled;
}

/** The keys of the planets ruling `sign` under `rulership`: one, or the two co-rulers under Both. */
function rulerKeys(sign: number, rulership: RulershipChoice): readonly string[] {
  return rulersOf(sign, rulership).map(keyOfBody);
}

/** The keys of the planets ruling the Ascendant's sign; none when there is no Ascendant. */
function chartRulerKeys(chart: ChartData, rulership: RulershipChoice): readonly string[] {
  if (!housesAreDefined(chart.houses)) return [];
  return rulerKeys(Math.floor(norm360(chart.houses.ascendant) / 30), rulership);
}

function angleOf(longitude: Degrees, chart: ChartData): FocusAngle | null {
  if (!housesAreDefined(chart.houses)) return null;
  const candidates: readonly (readonly [FocusAngle, Degrees])[] = [
    ['asc', chart.houses.ascendant],
    ['mc', chart.houses.midheaven],
    ['dsc', norm360(chart.houses.ascendant + 180)],
    ['ic', norm360(chart.houses.midheaven + 180)],
  ];
  let closest: { angle: FocusAngle; distance: Degrees } | undefined;
  for (const [angle, at] of candidates) {
    const distance = separation(longitude, at);
    if (distance <= ANGLE_ORB_DEG && (closest === undefined || distance < closest.distance)) {
      closest = { angle, distance };
    }
  }
  return closest?.angle ?? null;
}

function houseIn(longitude: Degrees, chart: ChartData): number | null {
  return housesAreDefined(chart.houses) ? houseOf(longitude, chart.houses.cusps) : null;
}

function longitudeOf(chart: ChartData, bodyKey: string): Degrees | undefined {
  const body = bodyByKey(bodyKey);
  return body === undefined ? undefined : chart.positions.find((position) => position.body === body.id)?.longitude;
}

/**
 * The context for `focusBodyKey`, or `undefined` when the chart has no such body. `natal` supplies
 * the houses, the chart ruler and the angles; with `transit`, the focus is the *transiting* planet:
 * its sign comes from the transit chart, its house and angle from where it falls in the natal chart,
 * and its aspects are its contacts to natal planets.
 */
export function buildFocusObjectContext(
  natal: ChartData,
  focusBodyKey: string,
  transit?: FocusTransit,
  rulership: RulershipChoice = DEFAULT_RULERSHIP_CHOICE,
): FocusContext | undefined {
  const focusChart = transit?.chart ?? natal;
  const focusLongitude = longitudeOf(focusChart, focusBodyKey);
  const focusBody = bodyByKey(focusBodyKey);
  if (focusLongitude === undefined || focusBody === undefined) return undefined;

  const chartRulers = chartRulerKeys(natal, rulership);
  const angle = angleOf(focusLongitude, natal);
  const sign = Math.floor(norm360(focusLongitude) / 30);

  const aspects: FocusAspect[] = [];
  const source: readonly Aspect[] = transit === undefined ? natal.aspects : transit.contacts;
  for (const aspect of source) {
    // Natal: the focus is either end. Transit: the focus is the transiting end, the target the natal one.
    const targetId =
      transit === undefined
        ? aspect.bodyA === focusBody.id
          ? aspect.bodyB
          : aspect.bodyB === focusBody.id
            ? aspect.bodyA
            : undefined
        : aspect.bodyA === focusBody.id
          ? aspect.bodyB
          : undefined;
    if (targetId === undefined) continue;
    const targetKey = keyOfBody(targetId);
    const targetLongitude = longitudeOf(natal, targetKey);
    if (targetLongitude === undefined) continue;
    aspects.push({
      target_key: targetKey,
      target_sign: signNameOf(targetLongitude),
      target_house: houseIn(targetLongitude, natal),
      target_rules_houses: housesRuledBy(targetKey, natal, rulership),
      aspect: aspect.aspect.key,
      orb: roundOrb(aspect.orb),
      state: aspect.applying ? 'applying' : 'separating',
      is_target_chart_ruler: chartRulers.includes(targetKey),
      is_target_luminary: targetKey === 'sun' || targetKey === 'moon',
    });
  }
  aspects.sort((a, b) => a.orb - b.orb);

  return {
    perspective: transit === undefined ? 'natal' : 'transit',
    rulership,
    focus_object: {
      key: focusBodyKey,
      sign: SIGNS[sign]?.name ?? '',
      house: houseIn(focusLongitude, natal),
      rules_houses: housesRuledBy(focusBodyKey, natal, rulership),
      is_chart_ruler: chartRulers.includes(focusBodyKey),
      on_angle: angle !== null,
      angle,
      dispositor: rulerKeys(sign, rulership)[0] ?? '',
      co_dispositor: rulerKeys(sign, rulership)[1] ?? null,
    },
    // Tightest first, and never more than the server accepts (a "show all" transit filter can hold many).
    aspects: aspects.slice(0, MAX_FOCUS_ASPECTS),
  };
}
