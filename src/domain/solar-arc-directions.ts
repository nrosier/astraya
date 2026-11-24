/**
 * Computes a solar arc directions chart for a target date (#47).
 *
 * Mirrors `secondary-progression.ts`'s shape: a natal Julian day, one house
 * and one batch position call at birth, then the same shared arc applied to
 * every body and every angle — the whole point of the technique, versus
 * secondary progression's `'solarArc'` MC method which only ever rotates the
 * angles. Contacts to the fixed natal chart are found the same way any two
 * charts would be compared (`findCrossAspects`), and each contact found in
 * orb is also given its exact date, resolved against the real ephemeris
 * since the true solar arc is not perfectly linear in time.
 */
/**
 * @module solar-arc-directions
 * @purpose Computes a solar arc directions chart for a target date (#47): the natal Sun's own progressed arc applied uniformly to every body and angle.
 * @conventions Moving every house cusp and angle by the solar arc follows Tyl, *Solar Arcs* (2001): the Ascendant and Midheaven "arc the same in all House systems" (PDF 284). Mirrors `secondary-progression.ts`'s shape (natal Julian day, one house and one batch position call), but applies the shared solar arc to every body/angle rather than only rotating angles (secondary progression's `'solarArc'` MC method); contacts to the fixed natal chart use `findCrossAspects`, and each found contact is additionally resolved to its exact date against the real ephemeris since the arc is not perfectly linear in time. Both Suns are read in the requested zodiac. Arc kinds and multipliers (#1407) follow the Solar Fire Deluxe guide §12.4 (PDF pp. 78-80): the Ascendant (Vertex) arc is the distance moved by the secondary progressed Ascendant (Vertex), which Solar Fire derives from the progressed MC (§30.3.2.1). Of Solar Fire's five MC methods this fixes True Solar Arc in Longitude: natal MC plus the solar arc in longitude, converted to its ARMC with the progressed date's true obliquity and cast with `housesFromArmc` at the natal latitude (owner decision on #1407, 2026-11-23; obliquity per the astrologer review of PR #1936). That angle work is done in the tropical frame; in a sidereal chart the arc then differs from a sidereal measurement only by the ayanamsa's motion over the progressed days: about 0.14" per year of age for the solar arc, and about 0.14" x (1 + dAsc/dMC) per year for the Ascendant arc, where the Ascendant outruns the MC (astrologer review of PR #1939). The Ascendant and Vertex arcs are summed over quarter-day steps, so an arc past 180 degrees keeps its true size; inside the polar circles the Ascendant can jump within a step, and the arc then follows the shorter way round at that step. The multiplier is one of x1, x2, x0.5, x-1, x-2, x-0.5 (guide p. 80) and scales the arc before it is applied. Exact contact dates are solved for the solar arc only; for the Ascendant and Vertex arcs they are undefined. Converse (guide §12.4 p. 80, owner decision on #1407 Q1) evaluates the same arc on the day as many days before birth as the forward one is after it, so the arc is negative; it is separate from the x-1 multiplier and composes with it. "Converse" has more than one meaning: Carter (Symbolic Directions) applies it to moving points backwards by the same forward arc, which here is the x-1 multiplier, not this option (astrologer review of PR #1943).
 * @exports computeSolarArcDirections, SolarArcDirectionsData, SolarArcDirectionsOptions, DirectedContact, SolarArcKind, SolarArcMultiplier, SOLAR_ARC_KINDS, SOLAR_ARC_MULTIPLIERS, SOLAR_ARC_ACTIVE_ORB_DEG
 */
import { findCrossAspects, type Aspect, type OrbConfig } from '../astrology/aspects.js';
import { bodyIdsFor, type BodySetOptions, bodyByKey, bodyById, type BodyCategory } from '../astrology/bodies.js';
import {
  ageInYears,
  mcArc,
  progressedJulianDay,
  progressedSunDeclination,
  shiftHouses,
} from '../astrology/progressions.js';
import {
  arcsToExactness,
  directedSubjects,
  directPositions,
  findExactnessJd,
  fixedNatalSubjects,
  SOLAR_ARC_KINDS,
  SOLAR_ARC_MULTIPLIERS,
  type DirectedPosition,
  type SolarArcKind,
  type SolarArcMultiplier,
} from '../astrology/solar-arc-directions.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import {
  needsSunDeclination,
  type BodyId,
  type Degrees,
  type EphemerisProvider,
  type GeoPosition,
  type HousePositions,
  type HouseSystem,
  type JulianDayUT,
  type Zodiac,
} from '../ephemeris/types.js';
import type { BirthMomentInput } from '../time/types.js';

const SUN_ID: BodyId = ((): BodyId => {
  const sun = bodyByKey('sun');
  if (sun === undefined) throw new Error('unreachable: sun is always in BODIES');
  return sun.id;
})();

/** Placidus, matching `chart-compute.ts` and `secondary-progression.ts`'s default. */
const DEFAULT_HOUSE_SYSTEM: HouseSystem = 'P';

// The kinds and multipliers live in `astrology/solar-arc-directions.ts` so a screen can list them without importing this
// module's calculation; they are re-exported here, where they were first defined (#1407).
export { SOLAR_ARC_KINDS, SOLAR_ARC_MULTIPLIERS, type SolarArcKind, type SolarArcMultiplier };

export interface SolarArcDirectionsOptions extends BodySetOptions {
  /** The orbs the cross-chart aspects are found with (#590); the Extended settings' orbs when a chart is drawn from them. */
  readonly orbConfig?: OrbConfig;
  readonly houseSystem?: HouseSystem;
  readonly zodiac?: Zodiac;
  /** The arc that directs the chart; `solar` when omitted (#1407). */
  readonly arcKind?: SolarArcKind;
  /** Scales the arc before it is applied; 1 when omitted (#1407). */
  readonly arcMultiplier?: SolarArcMultiplier;
  /**
   * Converse (#1407; guide §12.4 p. 80: "done backwards in time from the time of the base chart"): the arc is the one
   * found the same number of days before birth, so the chart is directed backwards. A separate option from the x-1
   * multiplier, and it composes with it. For the other meaning of "converse" (Carter: back by the same forward arc),
   * use the x-1 multiplier instead.
   */
  readonly converse?: boolean;
}

/**
 * How far from exact a solar arc contact counts as active (#673): 1° of arc, about a year either side of the exact
 * date. The same window primary directions use by default (`primary-directions.ts`'s orb), so the two kinds of
 * direction read alike on one timeline.
 */
export const SOLAR_ARC_ACTIVE_ORB_DEG = 1;

export interface DirectedContact extends Aspect {
  /** The Julian day the contact becomes exact, or undefined if not within a 150-year search window. */
  readonly exactJd: JulianDayUT | undefined;
  /** When the arc comes within `SOLAR_ARC_ACTIVE_ORB_DEG` of exact (birth, if it already was); undefined with `exactJd`. */
  readonly activeFromJd: JulianDayUT | undefined;
  /** When the arc passes `SOLAR_ARC_ACTIVE_ORB_DEG` beyond exact; undefined past the search window. */
  readonly activeUntilJd: JulianDayUT | undefined;
}

export interface SolarArcDirectionsData {
  readonly natalJd: JulianDayUT;
  readonly progressedJd: JulianDayUT;
  readonly ageInYears: number;
  /** The arc applied to every point: the chosen kind's arc times the multiplier. */
  readonly arc: Degrees;
  readonly arcKind: SolarArcKind;
  readonly arcMultiplier: SolarArcMultiplier;
  readonly converse: boolean;
  readonly directedPositions: readonly DirectedPosition[];
  readonly houses: HousePositions;
  readonly contacts: readonly DirectedContact[];
}

function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/** A difference of two longitudes as the shorter signed arc, in (-180, 180]. */
function signedArc(degrees: Degrees): Degrees {
  const value = norm360(degrees);
  return value > 180 ? value - 360 : value;
}

/** Right ascension of an ecliptic point at latitude 0, for longitude `longitude` and obliquity `obliquity`. */
function rightAscensionOf(longitude: Degrees, obliquity: Degrees): Degrees {
  const lambda = (longitude * Math.PI) / 180;
  const epsilon = (obliquity * Math.PI) / 180;
  return norm360((Math.atan2(Math.sin(lambda) * Math.cos(epsilon), Math.cos(lambda)) * 180) / Math.PI);
}

/**
 * Longest step, in progressed days, between the samples an Ascendant or Vertex arc is summed over. A quarter day is
 * about three months of life; the angle moves far less than 180 degrees in that time, so each step's shorter arc is
 * its real motion and the sum keeps an arc past 180 degrees at its true size (astrologer review of PR #1939, finding 1).
 */
const ANGLE_ARC_STEP_DAYS = 0.25;

/** What the progressed Ascendant or Vertex is measured from: the natal MC, the natal angle and the natal Sun. */
interface NatalAngles {
  readonly midheaven: Degrees;
  readonly angle: Degrees;
  readonly sunLongitude: Degrees;
}

async function natalAngles(
  kind: 'ascendant' | 'vertex',
  provider: EphemerisProvider,
  natalJd: JulianDayUT,
  place: GeoPosition,
  houseSystem: HouseSystem,
): Promise<NatalAngles> {
  const [houses, sun] = await Promise.all([
    provider.houses(natalJd, place, houseSystem),
    provider.position(natalJd, SUN_ID),
  ]);
  return {
    midheaven: houses.midheaven,
    angle: kind === 'ascendant' ? houses.ascendant : houses.vertex,
    sunLongitude: sun.longitude,
  };
}

/**
 * The progressed Ascendant or Vertex at `progressedJd` (Solar Fire Deluxe guide §12.4 p. 78, §30.3.2.1), with the MC
 * progressed by True Solar Arc in Longitude: the natal MC plus the solar arc; its ARMC, with the progressed date's true
 * obliquity, gives the progressed angle through `housesFromArmc` at the natal latitude. Sunshine ('I' and 'i') also gets the
 * progressed Sun's tropical declination (#1935). Tropical frame (see the module conventions).
 */
async function progressedAngle(
  kind: 'ascendant' | 'vertex',
  provider: EphemerisProvider,
  natal: NatalAngles,
  progressedJd: JulianDayUT,
  place: GeoPosition,
  houseSystem: HouseSystem,
): Promise<Degrees> {
  const [sun, obliquity, sunDeclination] = await Promise.all([
    provider.position(progressedJd, SUN_ID),
    provider.obliquity(progressedJd),
    needsSunDeclination(houseSystem) ? progressedSunDeclination(provider, progressedJd) : Promise.resolve(undefined),
  ]);
  const progressedMc = norm360(natal.midheaven + signedArc(sun.longitude - natal.sunLongitude));
  const progressed = await provider.housesFromArmc(
    rightAscensionOf(progressedMc, obliquity),
    place.latitude,
    obliquity,
    houseSystem,
    sunDeclination,
  );
  return kind === 'ascendant' ? progressed.ascendant : progressed.vertex;
}

/**
 * The Ascendant or Vertex arc from birth to `progressedJd`, unwrapped: summed over steps of at most
 * `ANGLE_ARC_STEP_DAYS`, so an arc past 180 degrees keeps its true size and a half multiplier halves the real arc.
 * Also the arc's speed per progressed day at `progressedJd`, by a central difference over one progressed day.
 */
async function angleArc(
  kind: 'ascendant' | 'vertex',
  provider: EphemerisProvider,
  natalJd: JulianDayUT,
  progressedJd: JulianDayUT,
  place: GeoPosition,
  houseSystem: HouseSystem,
): Promise<{ readonly arc: Degrees; readonly speed: number }> {
  const natal = await natalAngles(kind, provider, natalJd, place, houseSystem);
  const at = (jd: JulianDayUT): Promise<Degrees> => progressedAngle(kind, provider, natal, jd, place, houseSystem);
  const span = progressedJd - natalJd;
  const steps = Math.max(1, Math.ceil(Math.abs(span) / ANGLE_ARC_STEP_DAYS));
  let arc = 0;
  let previous = natal.angle;
  for (let step = 1; step <= steps; step += 1) {
    const angle = await at(natalJd + (span * step) / steps);
    arc += signedArc(angle - previous);
    previous = angle;
  }
  const [before, after] = await Promise.all([at(progressedJd - 0.5), at(progressedJd + 0.5)]);
  return { arc, speed: signedArc(after - before) };
}

function categoryOf(body: BodyId): BodyCategory {
  const definition = bodyById(body);
  if (definition === undefined) throw new Error(`unreachable: ${String(body)} is always one of BODIES`);
  return definition.category;
}

/**
 * `provider` must already be initialized. `targetJd` is the moment being
 * directed *to* — see `computeSecondaryProgression`'s doc comment on the
 * same parameter for why a Julian day rather than a civil date.
 */
export async function computeSolarArcDirections(
  natalMoment: BirthMomentInput,
  targetJd: JulianDayUT,
  provider: EphemerisProvider,
  options: SolarArcDirectionsOptions = {},
): Promise<SolarArcDirectionsData> {
  const resolved = resolveMoment(natalMoment);
  const natalJd = await julianDayFor(provider, resolved);
  const place: GeoPosition = { ...natalMoment.coordinates, altitude: 0 };
  const houseSystem = options.houseSystem ?? DEFAULT_HOUSE_SYSTEM;
  const positionOptions = options.zodiac === undefined ? undefined : { zodiac: options.zodiac };

  const sun = bodyByKey('sun');
  if (sun === undefined) throw new Error('unreachable: sun is always in BODIES');
  const arcKind = options.arcKind ?? 'solar';
  const arcMultiplier = options.arcMultiplier ?? 1;
  if (!SOLAR_ARC_MULTIPLIERS.includes(arcMultiplier)) {
    throw new RangeError(
      `arc multiplier must be one of ${SOLAR_ARC_MULTIPLIERS.join(', ')}, got ${String(arcMultiplier)}`,
    );
  }

  const [natalHouses, natalPositions] = await Promise.all([
    provider.houses(natalJd, place, houseSystem, options.zodiac),
    provider.positions(natalJd, bodyIdsFor(options), positionOptions),
  ]);
  const natalSun = natalPositions.find((position) => position.body === sun.id);
  if (natalSun === undefined) throw new Error('unreachable: the ephemeris returned no position for the Sun');

  const converse = options.converse === true;
  const age = ageInYears(natalJd, targetJd);
  // Converse: the progressed day lies as many days before birth as the forward one lies after it (guide p. 80).
  const forwardJd = progressedJulianDay(natalJd, targetJd);
  const progressedJd = converse ? natalJd - (forwardJd - natalJd) : forwardJd;
  const [progressedSun] = await provider.positions(progressedJd, [sun.id], positionOptions);
  if (progressedSun === undefined) throw new Error('unreachable: the ephemeris returned no position for the Sun');
  const solarArc = mcArc('solarArc', age, natalSun.longitude, progressedSun.longitude);

  // The default (solar, x1, forward) keeps today's unwrapped arc exactly; any other choice works from the normalised
  // arc. Converse, the arc is negative: the Sun's position that many days before birth minus the natal Sun.
  let arc: Degrees;
  let arcSpeed: number;
  if (arcKind === 'solar') {
    const baseArc = converse ? -norm360(natalSun.longitude - progressedSun.longitude) : norm360(solarArc);
    arc = arcMultiplier === 1 && !converse ? solarArc : baseArc * arcMultiplier;
    // Going back in time as age grows, the converse arc moves the other way: the speed changes sign.
    arcSpeed = progressedSun.longitudeSpeed * arcMultiplier * (converse ? -1 : 1);
  } else {
    // The speed per progressed day decides whether a contact is applying or separating.
    const angle = await angleArc(arcKind, provider, natalJd, progressedJd, place, houseSystem);
    arc = angle.arc * arcMultiplier;
    arcSpeed = angle.speed * arcMultiplier * (converse ? -1 : 1);
  }

  const directed = directPositions(natalPositions, arc);
  const houses = shiftHouses(natalHouses, arc);

  const directedSide = directedSubjects(directed, categoryOf, arcSpeed);
  const natalSide = fixedNatalSubjects(natalPositions, categoryOf);
  const found = findCrossAspects(directedSide, natalSide, options.orbConfig);

  const natalLongitude = new Map<BodyId, Degrees>(
    natalPositions.map((position) => [position.body, position.longitude]),
  );
  const contacts = await Promise.all(
    found.map(async (contact): Promise<DirectedContact> => {
      const directedNatalLongitude = natalLongitude.get(contact.bodyA);
      const targetNatalLongitude = natalLongitude.get(contact.bodyB);
      if (directedNatalLongitude === undefined || targetNatalLongitude === undefined) {
        throw new Error('unreachable: every contact pairs bodies drawn from natalPositions');
      }
      // The Ascendant and Vertex arcs have no simple inverse in time, so their contacts carry no dates (#1407).
      if (arcKind !== 'solar')
        return { ...contact, exactJd: undefined, activeFromJd: undefined, activeUntilJd: undefined };
      const candidates = arcsToExactness(directedNatalLongitude, targetNatalLongitude, contact.aspect.angle);
      // Candidates are directed arcs in [0, 360). The solar arc that produces one is candidate / multiplier, taking the
      // candidate or the candidate - 360, whichever gives a solar arc of 0 or more. Of those, the one nearest today's
      // solar arc is the contact found; for x1 this is exactly the earlier rule. The arc is unwrapped and goes negative
      // once the progressed Sun passes 0 (#1498), hence the normalisation.
      // Converse, the directed arc is minus the Sun's motion before birth, so the sign flips (the search measures that
      // motion, which only grows with age, like the forward arc).
      const sign = converse ? -1 : 1;
      const wrappedArc = converse ? norm360(natalSun.longitude - progressedSun.longitude) : norm360(solarArc);
      const solarCandidates = candidates
        .flatMap((candidate) => [candidate / (sign * arcMultiplier), (candidate - 360) / (sign * arcMultiplier)])
        .filter((value) => value >= 0);
      const requiredArc = solarCandidates.reduce((closest, candidate) =>
        Math.abs(candidate - wrappedArc) < Math.abs(closest - wrappedArc) ? candidate : closest,
      );
      // The active orb is 1 degree of the directed arc, so 1/|multiplier| of the solar arc.
      const orb = SOLAR_ARC_ACTIVE_ORB_DEG / Math.abs(arcMultiplier);
      // Each bound found against the real ephemeris, like the exact date: the arc is not linear in time.
      const [exactJd, activeFromJd, activeUntilJd] = await Promise.all([
        findExactnessJd(provider, natalJd, natalSun.longitude, requiredArc, undefined, options.zodiac, converse),
        requiredArc - orb <= 0
          ? Promise.resolve(natalJd)
          : findExactnessJd(
              provider,
              natalJd,
              natalSun.longitude,
              requiredArc - orb,
              undefined,
              options.zodiac,
              converse,
            ),
        findExactnessJd(provider, natalJd, natalSun.longitude, requiredArc + orb, undefined, options.zodiac, converse),
      ]);
      return { ...contact, exactJd, activeFromJd: exactJd === undefined ? undefined : activeFromJd, activeUntilJd };
    }),
  );

  return {
    natalJd,
    progressedJd,
    ageInYears: age,
    arc,
    arcKind,
    arcMultiplier,
    converse,
    directedPositions: directed,
    houses,
    contacts,
  };
}
