/**
 * Secondary progressions: day-for-year, with a selectable method for progressing
 * the MC and the houses that follow from it (#46).
 *
 * Bodies progress by direct day-for-year substitution: their positions are simply
 * the ordinary ephemeris positions at the progressed Julian day, no different from
 * a natal calculation at a later date. The angles are not that simple, because
 * "the sky's rotation for one day" is itself what the three schools of secondary
 * progression disagree about:
 *
 * - `'quotidian'` recomputes the houses outright at the progressed moment, using
 *   the natal clock time and place. Because the progressed Julian day is only a
 *   few days past the natal one (one day per year of age), the MC this produces
 *   moves by close to the mean solar rate — nearly, but not exactly, what
 *   `'naibod'` below gives by simple arithmetic. Where quotidian visibly departs
 *   from the two symbolic methods is everywhere else: the Ascendant and the other
 *   cusps are a non-linear function of the progressed sidereal time, latitude and
 *   obliquity, not a rigid rotation of the natal ones, so they drift apart from a
 *   naibod/solar-arc chart even while the MCs stay close.
 * - `'naibod'` instead advances the MC by a symbolic arc: the mean Sun's daily
 *   motion (360 degrees divided by the tropical year, about 59'08") times the
 *   number of years of age. A uniform rate, chosen for its simplicity, in use for
 *   over a century.
 * - `'solarArc'` advances the MC the same way, but by the *true* solar arc — the
 *   actual distance the real Sun travelled between the natal and progressed Julian
 *   days — rather than the Sun's mean rate.
 *
 * Naibod and solar arc (#1935) progress the MC by the symbolic arc, then derive every other angle and cusp from
 * that progressed MC through `housesFromArmc` at the natal latitude, with the obliquity at the progressed date
 * (Solar Fire Deluxe guide §30.3.2.1). They do not rotate the natal wheel rigidly: the Ascendant moves unevenly with
 * latitude and sign. Sunshine ('I') divides the Sun's semi-arcs, so it also gets the progressed Sun's declination, read
 * from the tropical equatorial position. A user-defined sidereal ayanamsa keeps the rigid rotation until the engine
 * interface takes it.
 * Quotidian recomputes the houses outright at the progressed moment.
 *
 * Naibod in RA and true solar arc in RA (#2039, Solar Fire Deluxe guide §30.3.2.1) move the natal ARMC instead: by the
 * mean Sun's rate times age, or by the right ascension the progressed Sun has moved. The MC and every other angle then
 * come from that ARMC the same way. An arc moved in right ascension and the same arc moved in longitude end at
 * different MCs except where the ecliptic and the equator run parallel or cross; the gap is at most about 5°, twice
 * the greatest difference (about 2.5°) between a point's right ascension and its longitude.
 */

/**
 * @module Progressions
 * @purpose Computes secondary (day-for-year) progressions, with a selectable method (quotidian, naibod, solarArc, naibodRa, solarArcRa) for progressing the MC and houses.
 * @conventions Bodies progress by direct day-for-year substitution; 'quotidian' recomputes houses outright at the progressed moment; 'naibod' advances the MC by the mean Sun's daily motion (NAIBOD_DAILY_MOTION) times age; 'solarArc' advances it by the true solar arc traveled; naibod/solarArc then derive the other angles and cusps from the progressed MC via housesFromArmc with the progressed-date obliquity (Solar Fire Deluxe guide §30.3.2.1, #1935), sidereal charts subtracting the standard ayanamsa afterwards; Sunshine ('I' and 'i') also passes housesFromArmc the progressed Sun's tropical declination (#1935); a user-defined ayanamsa keeps the rigid rotation via shiftHouses until the engine interface takes it; both Suns and the quotidian progressed houses are read in the requested zodiac. 'naibodRa' and 'solarArcRa' (#2039, the same guide section) advance the natal ARMC by the mean-Sun rate times age or by the progressed Sun's right-ascension arc, then derive the MC and all other angles from that ARMC the same way; the Suns' right ascensions are tropical.
 * @exports ProgressedMcMethod, TROPICAL_YEAR_DAYS, NAIBOD_DAILY_MOTION, ageInYears, progressedJulianDay, mcArc, mcRaArc, progressedAnglesKeepRigidShift, shiftHouses, progressedSunDeclination, computeProgressedHouses
 */
import {
  needsSunDeclination,
  type Degrees,
  type EphemerisProvider,
  type GeoPosition,
  type HousePositions,
  type HouseSystem,
  type JulianDayUT,
  type Zodiac,
} from '../ephemeris/types.js';

/**
 * How the progressed MC moves: `naibod` and `solarArc` in longitude, `naibodRa` and `solarArcRa` in right ascension
 * (#2039), or `quotidian`. Solar Fire Deluxe guide §30.3.2.1 offers all five.
 */
export type ProgressedMcMethod = 'quotidian' | 'naibod' | 'solarArc' | 'naibodRa' | 'solarArcRa';

/**
 * The mean tropical year, in days — the day-for-year divisor. 365.2422 is the
 * mean tropical year (Meeus, Astronomical Algorithms, 2nd ed., ch. 10: 365.242189
 * days at J2000, rounded to four decimals; the Sun's mean longitude rate).
 * Until #1403 this was 365.2425, the Gregorian calendar mean, which is not the
 * tropical year; the difference is about 6 seconds of progressed time at age 80.
 */
export const TROPICAL_YEAR_DAYS = 365.2422;

/** The mean Sun's daily motion, in degrees — Naibod's key. */
export const NAIBOD_DAILY_MOTION: Degrees = 360 / TROPICAL_YEAR_DAYS;

function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/** Age in tropical years between a natal and a target Julian day. Negative before birth. */
export function ageInYears(natalJd: JulianDayUT, targetJd: JulianDayUT): number {
  return (targetJd - natalJd) / TROPICAL_YEAR_DAYS;
}

/** The day-for-year progressed Julian day: one day of ephemeris motion per year of age. */
export function progressedJulianDay(natalJd: JulianDayUT, targetJd: JulianDayUT): JulianDayUT {
  return natalJd + ageInYears(natalJd, targetJd);
}

/**
 * The arc applied to every natal angle and cusp under a symbolic (non-quotidian)
 * method. Not normalised to [0, 360): the arc accumulates without bound over a
 * long life, and only the shifted angles it produces need wrapping.
 */
export function mcArc(
  method: 'naibod' | 'solarArc',
  age: number,
  natalSunLongitude: Degrees,
  progressedSunLongitude: Degrees,
): Degrees {
  return method === 'naibod' ? age * NAIBOD_DAILY_MOTION : progressedSunLongitude - natalSunLongitude;
}

/**
 * True when the progressed angles of a naibod or solar-arc chart still use the older rigid shift: the chart's zodiac is a
 * user-defined ayanamsa, which the engine cannot yet subtract from a derived MC. The views and the PDF show a note for it.
 */
export function progressedAnglesKeepRigidShift(zodiac: Zodiac | undefined, method: ProgressedMcMethod): boolean {
  return method !== 'quotidian' && zodiac?.kind === 'sidereal' && zodiac.user !== undefined;
}

/** Rigidly rotates every natal cusp and angle by `arc`, for the two symbolic methods. */
export function shiftHouses(natal: HousePositions, arc: Degrees): HousePositions {
  const shift = (deg: Degrees): Degrees => norm360(deg + arc);
  return {
    cusps: natal.cusps.map(shift),
    ascendant: shift(natal.ascendant),
    midheaven: shift(natal.midheaven),
    armc: norm360(natal.armc + arc),
    vertex: shift(natal.vertex),
    equatorialAscendant: shift(natal.equatorialAscendant),
    coAscendantKoch: shift(natal.coAscendantKoch),
    coAscendantMunkasey: shift(natal.coAscendantMunkasey),
    polarAscendant: shift(natal.polarAscendant),
    system: natal.system,
    ...(natal.warning === undefined ? {} : { warning: natal.warning }),
  };
}

/**
 * Right ascension of an ecliptic point at latitude 0, for longitude `longitude` and obliquity `obliquity`:
 * `atan2(sin λ · cos ε, cos λ)`, normalised. Duplicates the private helper in `solar-arc-directions.ts` (same formula).
 */
function rightAscensionOf(longitude: Degrees, obliquity: Degrees): Degrees {
  const lambda = (longitude * Math.PI) / 180;
  const epsilon = (obliquity * Math.PI) / 180;
  return norm360((Math.atan2(Math.sin(lambda) * Math.cos(epsilon), Math.cos(lambda)) * 180) / Math.PI);
}

/**
 * The progressed Sun's declination at `progressedJd`, for the Sunshine systems ('I' and 'i'), which divide the Sun's semi-arcs
 * (#1935). It is the progressed Sun, the same Sun the progressed planets use (owner decision on #1935, 2026-11-24;
 * under solar arc that Sun is the natal Sun plus the arc). Always read from the TROPICAL equatorial position: a sidereal
 * longitude must not feed sin δ = sin λ sin ε.
 */
export async function progressedSunDeclination(
  provider: EphemerisProvider,
  progressedJd: JulianDayUT,
): Promise<Degrees> {
  const [sun] = await provider.positions(progressedJd, [0], { equatorial: true });
  if (sun === undefined) throw new Error('unreachable: the ephemeris returned no position for the Sun');
  // With `equatorial`, the latitude field is the declination.
  return sun.latitude;
}

export interface SecondaryProgressionOptions {
  readonly mcMethod: ProgressedMcMethod;
  readonly houseSystem: HouseSystem;
  /** Zodiac both Suns and the quotidian houses are read in; tropical when unset. */
  readonly zodiac?: Zodiac;
}

export interface ProgressedHouses {
  readonly progressedJd: JulianDayUT;
  readonly ageInYears: number;
  readonly mcMethod: ProgressedMcMethod;
  readonly houses: HousePositions;
}

/**
 * The progressed Julian day and the progressed houses for a natal chart, under
 * the given MC method. Progressed *body* positions are not this function's
 * job — they are ordinary `provider.positions` calls at the returned
 * `progressedJd`, exactly like a natal chart at a later date.
 */
export async function computeProgressedHouses(
  provider: EphemerisProvider,
  natalJd: JulianDayUT,
  targetJd: JulianDayUT,
  natalHouses: HousePositions,
  natalSunLongitude: Degrees,
  place: GeoPosition,
  options: SecondaryProgressionOptions,
): Promise<ProgressedHouses> {
  const progressedJd = progressedJulianDay(natalJd, targetJd);
  const age = ageInYears(natalJd, targetJd);
  const positionOptions = options.zodiac === undefined ? undefined : { zodiac: options.zodiac };

  const method = options.mcMethod;
  if (method === 'quotidian') {
    const houses = await provider.houses(progressedJd, place, options.houseSystem, options.zodiac);
    return { progressedJd, ageInYears: age, mcMethod: 'quotidian', houses };
  }
  if (method === 'naibodRa' || method === 'solarArcRa') {
    return raProgressedHouses(provider, method, natalJd, progressedJd, age, natalHouses, place, options);
  }

  const [progressedSun] = await provider.positions(progressedJd, [0], positionOptions);
  if (progressedSun === undefined) throw new Error('unreachable: the ephemeris returned no position for the Sun');
  const arc = mcArc(method, age, natalSunLongitude, progressedSun.longitude);
  const shifted = shiftHouses(natalHouses, arc);
  const zodiac = options.zodiac;

  // A user-defined ayanamsa keeps the rigid shift. It waits on the split-out engine interface issue: provider.ayanamsa
  // takes no user definition, so the recipe below cannot run for it (#1935, owner decision 2026-11-24).
  if (progressedAnglesKeepRigidShift(zodiac, options.mcMethod)) {
    return { progressedJd, ageInYears: age, mcMethod: options.mcMethod, houses: shifted };
  }

  // The progressed angles come from the progressed MC, not from the natal ARMC (Solar Fire Deluxe guide §30.3.2.1,
  // "Chart Angle Progression Type": the MC is calculated first, then the Ascendant, Vertex and Equatorial Ascendant
  // are derived from that MC). The progressed MC is `shifted.midheaven` above, unchanged. Its ARMC is the right
  // ascension of that MC at latitude 0, with the obliquity at the progressed date (owner decision on #1935, 2026-11-24;
  // the same frame as solar-arc-directions.ts:174). The angles then come from housesFromArmc at the natal latitude.
  // A sidereal MC is converted by the standard ayanamsa at the progressed date, and the same ayanamsa is subtracted from
  // every cusp and angle afterwards, never from the ARMC: the recipe in EphemerisProvider.housesFromArmc's doc (#1407).
  const obliquity = await provider.obliquity(progressedJd);
  const ayanamsa = zodiac?.kind === 'sidereal' ? await provider.ayanamsa(progressedJd, zodiac.ayanamsa) : 0;
  const tropicalMc = norm360(shifted.midheaven + ayanamsa);
  const armc = rightAscensionOf(tropicalMc, obliquity);
  const fromArmc = await housesFromProgressedArmc(provider, progressedJd, armc, obliquity, ayanamsa, place, options);
  const houses: HousePositions = { ...fromArmc, midheaven: shifted.midheaven };
  return { progressedJd, ageInYears: age, mcMethod: options.mcMethod, houses };
}

/**
 * Every angle and cusp from a progressed ARMC, at the natal latitude, with the obliquity at the progressed date: the
 * recipe the symbolic methods share (#1935, #2039). Sunshine also gets the progressed Sun's declination. A sidereal
 * chart subtracts `ayanamsa` from every cusp and angle, never from the ARMC.
 */
async function housesFromProgressedArmc(
  provider: EphemerisProvider,
  progressedJd: JulianDayUT,
  armc: Degrees,
  obliquity: Degrees,
  ayanamsa: Degrees,
  place: GeoPosition,
  options: SecondaryProgressionOptions,
): Promise<HousePositions> {
  const sunDeclination = needsSunDeclination(options.houseSystem)
    ? await progressedSunDeclination(provider, progressedJd)
    : undefined;
  const angles = await provider.housesFromArmc(armc, place.latitude, obliquity, options.houseSystem, sunDeclination);
  const unShift = (deg: Degrees): Degrees => norm360(deg - ayanamsa);
  return {
    cusps: angles.cusps.map(unShift),
    ascendant: unShift(angles.ascendant),
    midheaven: unShift(angles.midheaven),
    armc,
    vertex: unShift(angles.vertex),
    equatorialAscendant: unShift(angles.equatorialAscendant),
    coAscendantKoch: unShift(angles.coAscendantKoch),
    coAscendantMunkasey: unShift(angles.coAscendantMunkasey),
    polarAscendant: unShift(angles.polarAscendant),
    system: angles.system,
    ...(angles.warning === undefined ? {} : { warning: angles.warning }),
  };
}

/**
 * The right-ascension arc the progressed MC moves by under the two right-ascension methods (Solar Fire Deluxe guide
 * §30.3.2.1, #2039): `naibodRa` is the mean Sun's rate times age (`NAIBOD_DAILY_MOTION`; the guide's "3m56.5s of arc
 * per day" is the same rate, rounded); `solarArcRa` is the progressed Sun's right ascension minus the natal Sun's.
 * The raw difference is taken through 0h to the value nearest the mean-rate arc, so it accumulates over a long life the
 * way `mcArc` does instead of wrapping at 360. Not normalised to [0, 360).
 */
export function mcRaArc(
  method: 'naibodRa' | 'solarArcRa',
  age: number,
  natalSunRa: Degrees,
  progressedSunRa: Degrees,
): Degrees {
  const meanArc = age * NAIBOD_DAILY_MOTION;
  if (method === 'naibodRa') return meanArc;
  const raw = progressedSunRa - natalSunRa;
  return raw + 360 * Math.round((meanArc - raw) / 360);
}

/** The ecliptic longitude of the MC for an ARMC: `atan2(sin RA, cos RA · cos ε)`, normalised. */
function midheavenOf(armc: Degrees, obliquity: Degrees): Degrees {
  const ra = (armc * Math.PI) / 180;
  const epsilon = (obliquity * Math.PI) / 180;
  return norm360((Math.atan2(Math.sin(ra), Math.cos(ra) * Math.cos(epsilon)) * 180) / Math.PI);
}

/**
 * The right-ascension methods (#2039): the progressed ARMC is the natal ARMC plus `mcRaArc`, and every angle, the MC
 * included, comes from that ARMC by `housesFromProgressedArmc`. The ARMC does not depend on the zodiac, so a sidereal
 * chart subtracts the ayanamsa from the angles only, as the longitude methods do. A user-defined ayanamsa keeps the
 * rigid rotation, by the longitude arc between the natal MC and the MC of the progressed ARMC.
 */
async function raProgressedHouses(
  provider: EphemerisProvider,
  method: 'naibodRa' | 'solarArcRa',
  natalJd: JulianDayUT,
  progressedJd: JulianDayUT,
  age: number,
  natalHouses: HousePositions,
  place: GeoPosition,
  options: SecondaryProgressionOptions,
): Promise<ProgressedHouses> {
  let arc = age * NAIBOD_DAILY_MOTION;
  if (method === 'solarArcRa') {
    const [[natalSun], [progressedSun]] = await Promise.all([
      provider.positions(natalJd, [0], { equatorial: true }),
      provider.positions(progressedJd, [0], { equatorial: true }),
    ]);
    if (natalSun === undefined || progressedSun === undefined) {
      throw new Error('unreachable: the ephemeris returned no position for the Sun');
    }
    // With `equatorial`, the longitude field is the right ascension.
    arc = mcRaArc(method, age, natalSun.longitude, progressedSun.longitude);
  }
  const armc = norm360(natalHouses.armc + arc);
  const obliquity = await provider.obliquity(progressedJd);
  const zodiac = options.zodiac;

  if (progressedAnglesKeepRigidShift(zodiac, method)) {
    const natalObliquity = await provider.obliquity(natalJd);
    const raw = midheavenOf(armc, obliquity) - midheavenOf(natalHouses.armc, natalObliquity);
    const longitudeArc = raw + 360 * Math.round((arc - raw) / 360);
    return {
      progressedJd,
      ageInYears: age,
      mcMethod: method,
      houses: { ...shiftHouses(natalHouses, longitudeArc), armc },
    };
  }

  const ayanamsa = zodiac?.kind === 'sidereal' ? await provider.ayanamsa(progressedJd, zodiac.ayanamsa) : 0;
  const houses = await housesFromProgressedArmc(provider, progressedJd, armc, obliquity, ayanamsa, place, options);
  return { progressedJd, ageInYears: age, mcMethod: method, houses };
}
