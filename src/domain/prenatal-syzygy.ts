/**
 * The prenatal syzygy (#1798): the last New Moon (conjunction) or Full Moon (prevention) before
 * a birth. It is the input to Bonatti's hyleg procedure and to his "Lord of the conjunction or
 * the prevention which was before the nativity" significator.
 *
 * Degree of the syzygy, from Bonatti, Liber astronomiae, Tr. 9, Chapter 4 ("On the investigation
 * of an unknown ascending degree", held text `bonatti-liber-astronomiae-tr-9-2010`):
 *
 * - lines 598-601: "you will then take the degree of the conjunction [of the luminaries] nearest
 *   to the nativity (if the nativity were conjunctional) or, if the nativity were preventional,
 *   the degree of the prevention (namely [the degree] of the luminary which was above the earth at
 *   the hour of the prevention)."
 * - lines 699-704: "if however one of the luminaries were on the eastern degree and the other in
 *   the western degree, the eastern degree is preferred, and it will be the degree of the
 *   prevention."
 *
 * The owner decided (#1798, 2026-11-20) that the degree of a prevention is the longitude of the
 * luminary above the earth at the hour, and that this replaces the brief's "Moon's longitude"
 * rule. A conjunction's degree is the shared longitude, taken here as the Moon's. The held text
 * has no page map (`bonatti-liber-astronomiae-tr-9-2010.pages.tsv` has one row), so no printed
 * page is cited.
 *
 * For a Full Moon the Sun and Moon sit exactly opposite, so one of them is always above the
 * horizon and the other below. The eastern-degree clause therefore never decides between two
 * luminaries here, and the above-horizon luminary is used. The house system defaults to Placidus
 * ('P'), as in `astrology/electional` and `astrology/rectification`.
 *
 * Zodiac: positions are requested with no zodiac argument, the same as `findLunations` with no
 * zodiac, so the degrees are the provider's default zodiac.
 *
 * @module domain/prenatal-syzygy
 * @purpose Finds a person's prenatal syzygy (last New or Full Moon before birth) and its degree per Bonatti Tr. 9 (#1798).
 * @conventions Uses `astrology/lunations` `findLunations` over a 31-day window ending at birth (one synodic month is about 29.53 days). A prevention's degree is the above-horizon luminary's longitude, using `astrology/sect` `isAboveHorizon` on the Ascendant from `provider.houses`. Degrees are tropical.
 * @exports PrenatalSyzygy, prenatalSyzygy
 */
import { findLunations } from '../astrology/lunations.js';
import { bodyByKey } from '../astrology/bodies.js';
import { isAboveHorizon } from '../astrology/sect.js';
import type { BodyId, Degrees, EphemerisProvider, GeoPosition, HouseSystem, JulianDayUT } from '../ephemeris/types.js';

/** Length of the search window before birth; one synodic month is about 29.53 days, so it always holds a New and a Full Moon. */
const SEARCH_WINDOW_DAYS = 31;

const DEFAULT_HOUSE_SYSTEM: HouseSystem = 'P';

function idOf(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`unreachable: "${key}" is always in BODIES`);
  return body.id;
}

const SUN = idOf('sun');
const MOON = idOf('moon');

/** The last New or Full Moon before a birth, with its degree. */
export interface PrenatalSyzygy {
  /** `conjunction` for a New Moon (conjunctional nativity), `prevention` for a Full Moon (preventional nativity). */
  readonly kind: 'conjunction' | 'prevention';
  /** Instant of the syzygy, in Julian Day UT. */
  readonly jd: JulianDayUT;
  readonly sunLongitude: Degrees;
  readonly moonLongitude: Degrees;
  /**
   * Conjunction: the shared longitude (the Moon's). Prevention: the longitude of the luminary above
   * the horizon at `jd`; undefined when the houses cannot be computed there (no house solution at
   * that latitude), so the caller shows the kind and date without a degree.
   */
  readonly degree: Degrees | undefined;
}

/**
 * The latest New or Full Moon strictly before `birthJd`, with its degree (#1798). Throws if no
 * syzygy is found in the window or the positions cannot be computed.
 */
export async function prenatalSyzygy(
  provider: EphemerisProvider,
  birthJd: JulianDayUT,
  place: GeoPosition,
  houseSystem: HouseSystem = DEFAULT_HOUSE_SYSTEM,
): Promise<PrenatalSyzygy> {
  const events = await findLunations(birthJd - SEARCH_WINDOW_DAYS, birthJd, provider);
  const before = events.filter((event) => event.jd < birthJd);
  const latest = before[before.length - 1];
  if (latest === undefined) throw new Error('no New or Full Moon found in the 31 days before birth');

  const sun = await provider.position(latest.jd, SUN);
  const moon = await provider.position(latest.jd, MOON);

  if (latest.kind === 'new') {
    return {
      kind: 'conjunction',
      jd: latest.jd,
      sunLongitude: sun.longitude,
      moonLongitude: moon.longitude,
      degree: moon.longitude,
    };
  }

  const degree = await preventionDegree(provider, latest.jd, sun.longitude, moon.longitude, place, houseSystem);
  return {
    kind: 'prevention',
    jd: latest.jd,
    sunLongitude: sun.longitude,
    moonLongitude: moon.longitude,
    degree,
  };
}

/** The luminary above the horizon at `jd`, or undefined when no Ascendant can be computed there. */
async function preventionDegree(
  provider: EphemerisProvider,
  jd: JulianDayUT,
  sunLongitude: Degrees,
  moonLongitude: Degrees,
  place: GeoPosition,
  houseSystem: HouseSystem,
): Promise<Degrees | undefined> {
  let ascendant: Degrees;
  try {
    ascendant = (await provider.houses(jd, place, houseSystem)).ascendant;
  } catch {
    return undefined;
  }
  return isAboveHorizon(sunLongitude, ascendant) ? sunLongitude : moonLongitude;
}
