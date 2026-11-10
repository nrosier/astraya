/**
 * Computes a composite (midpoint) chart from two people's natal charts (#169).
 *
 * A composite chart is a synthetic third chart, not a comparison between two existing ones —
 * that's synastry, #172. Every body's composite position is the near-arc midpoint (#30's
 * `midpointOf`: half of the *shorter* arc, Ebertin's convention, not the naive `(a+b)/2`)
 * between that body's longitude in each natal chart.
 *
 * Composite houses use the classic "midpoint of cusps" method: every cusp, the Ascendant, MC
 * and every other angle is the near-arc midpoint of the corresponding angle in each natal
 * chart's own `HousePositions` — arithmetic only, no ephemeris call, in the same shape
 * `progressions.ts`'s `shiftHouses` already uses to build a new `HousePositions` by
 * transforming an existing one rather than recomputing from a Julian day.
 *
 * Anchored cusps (#1402): when the two charts' cusps are nearly opposite, independent short-arc
 * midpoints can jump to either side of the circle and the composite houses run backwards. In
 * that case (and only then — a composite whose independent midpoints are already in zodiacal
 * order is untouched) the composite is anchored on the 1st or 10th cusp, whichever pair is
 * farther from exactly opposite; the anchor is that pair's near-arc midpoint, and every other
 * cusp is the anchor plus the average of its two forward offsets from the anchor cusp in each
 * chart. Forward offsets increase through the houses, so their average does too. Source: Solar
 * Fire Deluxe v6 manual, pp. 255-256 (owner decision recorded on #1402). The time/space-midpoint
 * "Davison" method — averaging the two birth moments and places into one real moment and asking
 * the ephemeris for its houses — is a different technique and lives in `davison.ts` (#1406);
 * there is no single Julian day here to hand `provider.houses`.
 *
 * Every other field (the composite's own aspects, dignities, sect, and the two Arabic parts) is
 * then computed fresh from the composite's midpoint positions and houses, exactly as
 * `computeChartDataAtJd` computes them for a real chart — a composite is not a comparison, so
 * it needs the single-chart `findAspects`, not the cross-chart engine synastry/transit use.
 */
/**
 * @module composite
 * @purpose Computes a composite (midpoint) chart — a synthetic third chart derived from two people's natal charts — distinct from synastry's comparison of two existing charts (#169).
 * @conventions Every body's position is the near-arc midpoint (`midpointOf`, Ebertin's convention: half the shorter arc, not the naive average); houses use the "midpoint of cusps" method (anchored on the 1st/10th cusp when that would put cusps out of zodiacal order, Solar Fire manual pp. 255-256, #1402), since there is no single real Julian day to ask the ephemeris for houses (the Davison time/space-midpoint chart is `davison.ts`, #1406); the composite's own aspects/dignities/sect/parts are computed fresh via the single-chart engine.
 * @exports computeComposite, CompositeData
 */
import { DEFAULT_ORB_CONFIG, findAspects, subjectsFrom, type Aspect } from '../astrology/aspects.js';
import { bodyByKey, bodyById, type BodyCategory } from '../astrology/bodies.js';
import type { EssentialDignities } from '../astrology/dignities.js';
import { DEFAULT_RULERSHIP_CHOICE, essentialDignitiesFor } from '../astrology/rulership.js';
import { partOfFortune, partOfSpirit } from '../astrology/arabic-parts.js';
import { midpointOf } from '../astrology/midpoints.js';
import { sectOf, type Sect } from '../astrology/sect.js';
import {
  computeChartData,
  isAspectParticipant,
  type ChartCalculationOptions,
  type ChartData,
} from './chart-compute.js';
import type { BodyId, BodyPosition, Degrees, EphemerisProvider, HousePositions } from '../ephemeris/types.js';
import type { BirthMomentInput } from '../time/types.js';

function categoryOf(body: BodyId): BodyCategory {
  const definition = bodyById(body);
  if (definition === undefined) throw new Error(`unreachable: ${String(body)} is always one of BODIES`);
  return definition.category;
}

const TOLERANCE = 1e-9;

function forwardArc(from: Degrees, to: Degrees): Degrees {
  return (((to - from) % 360) + 360) % 360;
}

/** True when cusps 1..12 each follow the previous one forward and wrap the circle exactly once. */
function cuspsInZodiacalOrder(cusps: readonly Degrees[]): boolean {
  let total = 0;
  for (let index = 1; index <= 12; index += 1) {
    const cusp = cusps[index];
    const next = cusps[index === 12 ? 1 : index + 1];
    if (cusp === undefined || next === undefined) return true;
    total += forwardArc(cusp, next);
  }
  return Math.abs(total - 360) < TOLERANCE;
}

/** Cusps anchored on the 1st or 10th cusp pair (the one farther from opposite) — see this module's doc comment. */
function anchoredCusps(a: readonly Degrees[], b: readonly Degrees[], fallback: readonly Degrees[]): readonly Degrees[] {
  const distanceFromOpposite = (index: number): number => {
    const x = a[index];
    const y = b[index];
    return x === undefined || y === undefined ? 0 : Math.abs(forwardArc(x, y) - 180);
  };
  const anchorIndex = distanceFromOpposite(10) > distanceFromOpposite(1) ? 10 : 1;
  const anchorA = a[anchorIndex];
  const anchorB = b[anchorIndex];
  if (anchorA === undefined || anchorB === undefined) return fallback;
  const anchor = midpointOf(anchorA, anchorB);
  return fallback.map((cusp, index) => {
    const cuspA = a[index];
    const cuspB = b[index];
    if (index === 0 || cuspA === undefined || cuspB === undefined) return cusp;
    return (anchor + (forwardArc(anchorA, cuspA) + forwardArc(anchorB, cuspB)) / 2) % 360;
  });
}

/** Near-arc midpoint of every corresponding field in two `HousePositions` — see this module's doc comment. */
function midpointHouses(a: HousePositions, b: HousePositions): HousePositions {
  const independent = a.cusps.map((cusp, index) => {
    const other = b.cusps[index];
    return other === undefined ? cusp : midpointOf(cusp, other);
  });
  return {
    cusps: cuspsInZodiacalOrder(independent) ? independent : anchoredCusps(a.cusps, b.cusps, independent),
    ascendant: midpointOf(a.ascendant, b.ascendant),
    midheaven: midpointOf(a.midheaven, b.midheaven),
    armc: midpointOf(a.armc, b.armc),
    vertex: midpointOf(a.vertex, b.vertex),
    equatorialAscendant: midpointOf(a.equatorialAscendant, b.equatorialAscendant),
    coAscendantKoch: midpointOf(a.coAscendantKoch, b.coAscendantKoch),
    coAscendantMunkasey: midpointOf(a.coAscendantMunkasey, b.coAscendantMunkasey),
    polarAscendant: midpointOf(a.polarAscendant, b.polarAscendant),
    system: a.system,
  };
}

/**
 * Near-arc midpoint of every field in two `BodyPosition`s for the same body. Longitude uses the
 * near-arc convention (`midpointOf`); latitude, distance and every speed are plain, non-circular
 * averages. `retrograde` is re-derived from the composite's own midpoint speed rather than
 * averaged as a boolean, since "half-retrograde" is meaningless.
 */
function midpointPosition(a: BodyPosition, b: BodyPosition): BodyPosition {
  const longitudeSpeed = (a.longitudeSpeed + b.longitudeSpeed) / 2;
  return {
    body: a.body,
    longitude: midpointOf(a.longitude, b.longitude),
    latitude: (a.latitude + b.latitude) / 2,
    distance: (a.distance + b.distance) / 2,
    longitudeSpeed,
    latitudeSpeed: (a.latitudeSpeed + b.latitudeSpeed) / 2,
    distanceSpeed: (a.distanceSpeed + b.distanceSpeed) / 2,
    retrograde: longitudeSpeed < 0,
  };
}

export interface CompositeData {
  readonly chartA: ChartData;
  readonly chartB: ChartData;
  /**
   * The synthetic composite chart itself: midpoint positions, midpoint-of-cusps houses, and its
   * own aspects, dignities, sect and Arabic parts, computed fresh from those.
   */
  readonly composite: ChartData;
}

/** `provider` must already be initialized. Both moments are resolved and computed independently. */
export async function computeComposite(
  momentA: BirthMomentInput,
  momentB: BirthMomentInput,
  provider: EphemerisProvider,
  options: ChartCalculationOptions = {},
): Promise<CompositeData> {
  const [chartA, chartB] = await Promise.all([
    computeChartData(momentA, provider, options),
    computeChartData(momentB, provider, options),
  ]);

  const positionsByBodyB = new Map(chartB.positions.map((position) => [position.body, position]));
  const positions: BodyPosition[] = [];
  for (const positionA of chartA.positions) {
    const positionB = positionsByBodyB.get(positionA.body);
    if (positionB === undefined) continue;
    positions.push(midpointPosition(positionA, positionB));
  }

  const houses = midpointHouses(chartA.houses, chartB.houses);

  const eligiblePositions = positions.filter((position) => isAspectParticipant(position.body, options.aspectsTo));
  const aspects: readonly Aspect[] = findAspects(
    subjectsFrom(eligiblePositions, categoryOf),
    options.orbConfig ?? DEFAULT_ORB_CONFIG,
  );

  const dignities = new Map<BodyId, EssentialDignities>(
    positions.map((position) => [
      position.body,
      essentialDignitiesFor(position.body, position.longitude, options.rulership ?? DEFAULT_RULERSHIP_CHOICE),
    ]),
  );

  const sun = bodyByKey('sun');
  const moon = bodyByKey('moon');
  if (sun === undefined || moon === undefined) throw new Error('unreachable: sun/moon are always in BODIES');
  const positionByBody = new Map(positions.map((position) => [position.body, position]));
  const sunPosition = positionByBody.get(sun.id);
  const moonPosition = positionByBody.get(moon.id);
  if (sunPosition === undefined || moonPosition === undefined) {
    throw new Error('unreachable: both charts always carry a Sun and Moon position');
  }

  const sect: Sect = sectOf(sunPosition.longitude, houses.ascendant);

  const composite: ChartData = {
    positions,
    houses,
    aspects,
    dignities,
    sect,
    partOfFortune: partOfFortune(sect, houses.ascendant, sunPosition.longitude, moonPosition.longitude),
    partOfSpirit: partOfSpirit(sect, houses.ascendant, sunPosition.longitude, moonPosition.longitude),
  };

  return { chartA, chartB, composite };
}
