/**
 * The Midheaven in polar latitudes, in the two conventions Solar Fire offers (#2012).
 *
 * Source (held): `docs/references/text/esoteric-solar-fire-deluxe-user-guide-undated.txt`, section 30.3.1.6 "MC in
 * Polar Regions"; the setting itself ("MC in Polar Regions") is described in the same guide's list of calculation
 * options. The guide says there are "two different ways of determining the Midheaven (MC), which sometimes give
 * diametrically opposed answers for its position in the zodiac":
 *
 * - Always towards equator: "the MC is defined as the intersection of the prime meridian with the ecliptic, towards
 *   the equator (or more precisely the ecliptic). This means that the MC is always due south in northern polar regions
 *   (and conversely is due north in southern polar regions) ... the MC is the same for any location along a line of
 *   longitude, right from one pole to the other."
 * - Always above horizon: "the MC is defined as the intersection of the prime meridian with the ecliptic, above the
 *   horizon. This means that the MC is always above the horizon ..., but as a consequence, the position of the MC in
 *   the zodiac jumps by 180 degrees (ie. has a discontinuity) as you move along a line of longitude".
 *
 * The meridian meets the ecliptic in two antipodal points. The one towards the equator is the ecliptic point whose
 * right ascension is the ARMC, which does not depend on the latitude at all. The other is 180 degrees from it.
 *
 * Which house systems are affected: Regiomontanus ('R') and Campanus ('C'). Their cusps are built from the meridian
 * (Regiomontanus divides the equator from the ARMC, Campanus the prime vertical, with every house circle through the
 * horizon's north and south points), and Swiss Ephemeris returns the antipode of the ARMC-matching point from about 67
 * degrees of latitude (measured: north 68, ARMC 277 gives MC 96.428, the right ascension 277 point is 276.427). The
 * systems that use the MC directly as cusp 10 without such a meridian construction (Placidus and Koch fall back to
 * Porphyry or Polich-Page inside the polar circle, and the equal, whole-sign and quadrant systems read the ARMC
 * point) already return the ARMC point at every latitude, so nothing is changed for them.
 *
 * Astrolina's antipode rule is not used: it is neither of the two conventions above.
 */
/**
 * @module ephemeris/polar-mc
 * @purpose Pure geometry of the polar Midheaven (Solar Fire Deluxe guide section 30.3.1.6): the two conventions and which house systems and cusps follow them.
 * @conventions Degrees in and out, tropical frame, no sweph-wasm import. The ARMC and the true obliquity are inputs; the engine converts a sidereal result by subtracting the ayanamsa.
 * @exports DEFAULT_POLAR_MC, POLAR_MC_SYSTEMS, MERIDIAN_CUSPS, towardsEquatorMidheaven, eclipticPointAltitude, polarMidheaven
 */

import type { PolarMc } from './types.js';

/** The default: always towards equator (owner decision on #2012). */
export const DEFAULT_POLAR_MC: PolarMc = 'towardsEquator';

/** The cusps that sit on the meridian's side of the chart and turn by 180 degrees with the MC: every cusp but the Ascendant (1) and Descendant (7). */
export const MERIDIAN_CUSPS: readonly number[] = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

/** The house systems whose cusps come from the meridian and so follow the setting: Regiomontanus and Campanus. */
export const POLAR_MC_SYSTEMS: readonly string[] = ['R', 'C'];

const RAD = Math.PI / 180;

function norm360(degrees: number): number {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/** The ecliptic longitude whose right ascension is `armc`: the meridian's intersection with the ecliptic towards the equator. */
export function towardsEquatorMidheaven(armc: number, obliquity: number): number {
  const a = armc * RAD;
  return norm360(Math.atan2(Math.sin(a), Math.cos(a) * Math.cos(obliquity * RAD)) / RAD);
}

/** Altitude in degrees of the ecliptic point at `longitude` for an observer at `latitude` with sidereal time `armc`. */
export function eclipticPointAltitude(longitude: number, armc: number, latitude: number, obliquity: number): number {
  const lambda = longitude * RAD;
  const eps = obliquity * RAD;
  const declination = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const rightAscension = Math.atan2(Math.sin(lambda) * Math.cos(eps), Math.cos(lambda));
  const hourAngle = armc * RAD - rightAscension;
  const phi = latitude * RAD;
  return (
    Math.asin(Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle)) / RAD
  );
}

/**
 * The MC for a convention. Towards equator is the ARMC point whatever the latitude. Above horizon is whichever of the
 * two meridian points stands higher, which is the ARMC point at every latitude the Sun can rise at, and the antipode
 * where the ARMC point is the one below the horizon.
 */
export function polarMidheaven(convention: PolarMc, armc: number, latitude: number, obliquity: number): number {
  const toward = towardsEquatorMidheaven(armc, obliquity);
  if (convention === 'towardsEquator') return toward;
  const away = norm360(toward + 180);
  return eclipticPointAltitude(toward, armc, latitude, obliquity) >=
    eclipticPointAltitude(away, armc, latitude, obliquity)
    ? toward
    : away;
}
