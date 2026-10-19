/**
 * The traditional "condition" of a planet (#547): sect alignment, accidental dignity
 * (angularity, hayz), motion, and besiegement — scattered individual checks, combined here into
 * one place so a condition table can show them together, the standard first read of a
 * traditional chart alongside essential dignity (`dignities.ts`/`almuten.ts`) and solar
 * phase/proximity (`sect.ts`), neither of which is duplicated here.
 *
 * Hayz and besiegement are summarized from widely-repeated modern restatements of the classical
 * sources (chiefly Bonatti and Lilly, via Benjamin Dykes' translations) rather than one specific
 * page this change can cite exactly — flagged here, not asserted as beyond dispute, per
 * CLAUDE.md's domain-integrity convention. Diurnal/nocturnal planet membership and sign gender
 * (fire/air masculine, earth/water feminine) are uncontroversial classical facts repeated
 * identically across every traditional source checked, unlike a specific numeric table, so they
 * are not separately flagged.
 */
/**
 * @module astrology/planetary-condition
 * @purpose Classifies a traditional planet's sect alignment, angularity, hayz, motion, and besiegement.
 * @conventions Scoped to the seven traditional (Chaldean) planets — Sun/Moon/Mercury/Venus/Mars/Jupiter/Saturn — since sect, hayz and besiegement are classical concepts with no established reading for the outer planets, nodes, or asteroids. Mercury is sect-neutral (common to both sects) and so never "of sect" or in hayz.
 * @exports TRADITIONAL_PLANET_IDS, DIURNAL_PLANETS, NOCTURNAL_PLANETS, SectAlignment, sectAlignmentOf, Angularity, angularityOfHouse, Motion, motionOf, isInHayz, isBesieged, MEAN_DAILY_SPEED, meanDailySpeedOf, STATION_WINDOW_DEFAULT_K, isStationWindowK, isWithinStationWindow, StationType, stationTypeOf, MOTION_SCORE_POINTS, motionScoreOf
 */
import type { BodyId, Degrees } from '../ephemeris/types.js';
import { bodyById, bodyByKey } from './bodies.js';
import { angularSeparation, orbFor, type OrbConfig } from './aspects.js';
import { signOf } from './signs.js';
import { isAboveHorizon, type Sect } from './sect.js';

function idOf(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`unreachable: "${key}" is always in BODIES`);
  return body.id;
}

/** Normalise to the half-open interval [0, 360) — the same convention `astrology/aspects.ts` uses. */
function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/** Sun through Saturn, the Chaldean order — the shared "which bodies does a traditional technique apply to" list every module in this file (and `reception.ts`, `chart-tables.ts`'s `conditionRows`/`dignityRows`) uses. */
export const TRADITIONAL_PLANET_IDS: readonly BodyId[] = (
  ['saturn', 'jupiter', 'mars', 'sun', 'venus', 'mercury', 'moon'] as const
)
  .map((key) => bodyByKey(key)?.id)
  .filter((id): id is BodyId => id !== undefined);

export const DIURNAL_PLANETS: readonly BodyId[] = [idOf('sun'), idOf('jupiter'), idOf('saturn')];
export const NOCTURNAL_PLANETS: readonly BodyId[] = [idOf('moon'), idOf('venus'), idOf('mars')];
// Mercury is common to both sects and deliberately in neither list above.

export type SectAlignment = 'ofSect' | 'contraSect' | 'neutral';

/** Whether a traditional planet is "of the sect in force" for this chart — `'neutral'` for Mercury, which belongs to neither list. */
export function sectAlignmentOf(body: BodyId, chartSect: Sect): SectAlignment {
  const diurnal = DIURNAL_PLANETS.includes(body);
  const nocturnal = NOCTURNAL_PLANETS.includes(body);
  if (!diurnal && !nocturnal) return 'neutral';
  const ofSect = chartSect === 'day' ? diurnal : nocturnal;
  return ofSect ? 'ofSect' : 'contraSect';
}

export type Angularity = 'angular' | 'succedent' | 'cadent';
const ANGULAR_HOUSES: readonly number[] = [1, 4, 7, 10];
const SUCCEDENT_HOUSES: readonly number[] = [2, 5, 8, 11];

/** Angular (1/4/7/10), succedent (2/5/8/11), or cadent (3/6/9/12) — the standard accidental-strength grouping. */
export function angularityOfHouse(house: number): Angularity {
  if (ANGULAR_HOUSES.includes(house)) return 'angular';
  if (SUCCEDENT_HOUSES.includes(house)) return 'succedent';
  return 'cadent';
}

export type Motion = 'direct' | 'retrograde' | 'stationary';

/**
 * Direct or retrograde from the sign of the ephemeris's own instantaneous speed; `'stationary'`
 * only for the mathematically exact `longitudeSpeed === 0` case, which real ephemeris output
 * essentially never returns exactly. Being within a day or two of an actual station (the
 * traditionally meaningful sense of "stationary") is a separate question this function does not
 * answer — it would need a multi-day search like `stations.ts` already does for station-finding,
 * not a single moment's speed.
 */
export function motionOf(longitudeSpeed: Degrees): Motion {
  if (longitudeSpeed === 0) return 'stationary';
  return longitudeSpeed > 0 ? 'direct' : 'retrograde';
}

/** Degrees, minutes and seconds of arc to decimal degrees: `dms(0, 59, 8)` is 0°59'08". */
function dms(degrees: number, minutes: number, seconds: number): Degrees {
  return degrees + minutes / 60 + seconds / 3600;
}

/**
 * Sidereal orbital periods in days, for the outer planets' modern mean speed (#724). Pluto's 90560 matches the NASA
 * planetary fact sheet's sidereal period. Uranus's 30688.5 and Neptune's 60182 are the values the project owner
 * chose; the NASA fact sheet gives 30685.4 and 60189.0. Those differ by a few parts in 10,000, which moves station
 * detection only slightly, but the choice is the owner's and is recorded here rather than silently re-sourced.
 */
const SIDEREAL_PERIOD_DAYS = {
  uranus: 30688.5,
  neptune: 60182,
  pluto: 90560,
} as const;

/**
 * Mean daily longitude speed, in degrees per day (#724), for the station window and the motion
 * score's velocity half.
 *
 * The seven traditional planets use Avelar & Ribeiro, *On the Heavenly Spheres* (Helena Avelar and
 * Luis Ribeiro, 2010), printed pp. 59–60, "Average Daily Speed": Saturn 0°02'01", Jupiter 0°04'59",
 * Mars 0°31'27", Sun, Venus and Mercury each 0°59'08", Moon 13°10'36". Converted exactly from
 * degrees, minutes and seconds.
 *
 * Uranus, Neptune and Pluto have no figure in that book. Their values are a modern mean speed, 360
 * divided by the sidereal period in days, and are used for station detection only. They are not
 * from Avelar & Ribeiro, and they never receive a motion score (`motionScoreOf` rejects them).
 */
export const MEAN_DAILY_SPEED: Readonly<Record<string, Degrees>> = {
  sun: dms(0, 59, 8),
  moon: dms(13, 10, 36),
  mercury: dms(0, 59, 8),
  venus: dms(0, 59, 8),
  mars: dms(0, 31, 27),
  jupiter: dms(0, 4, 59),
  saturn: dms(0, 2, 1),
  uranus: 360 / SIDEREAL_PERIOD_DAYS.uranus,
  neptune: 360 / SIDEREAL_PERIOD_DAYS.neptune,
  pluto: 360 / SIDEREAL_PERIOD_DAYS.pluto,
};

/** The mean daily speed for `body`, or `undefined` for a body with none (nodes, Lilith, Chiron, asteroids). */
export function meanDailySpeedOf(body: BodyId): Degrees | undefined {
  const key = bodyById(body)?.key;
  return key === undefined ? undefined : MEAN_DAILY_SPEED[key];
}

/**
 * The planets that can station (#724): Mercury through Pluto. The Sun and Moon never station (see
 * `stations.ts`'s own scope note), and nodes, Lilith, Chiron and asteroids are outside this window.
 */
const STATION_ELIGIBLE_KEYS: readonly string[] = [
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
];

/**
 * The station window's default fraction k (#724). **An Astraya convention, not a citation**: Avelar
 * & Ribeiro (2010) define a station (p. 61) but give no speed threshold for one, so 0.05 is chosen
 * here, not taken from the source.
 */
export const STATION_WINDOW_DEFAULT_K = 0.05;

/** Whether `k` is an acceptable station-window fraction: finite, greater than zero, and at most one (#724). */
export function isStationWindowK(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1;
}

/**
 * Whether a planet counts as stationary under the station window (#724): its longitude speed,
 * ignoring sign, is at most `k` times its mean daily speed. The boundary is inclusive, so a speed
 * exactly at `k × mean` is inside. Only Mercury through Pluto qualify.
 *
 * This is an Astraya convention, not a rule from Avelar & Ribeiro (2010), which gives no
 * threshold for a station.
 */
export function isWithinStationWindow(body: BodyId, longitudeSpeed: Degrees, k: number): boolean {
  const key = bodyById(body)?.key;
  if (key === undefined || !STATION_ELIGIBLE_KEYS.includes(key)) return false;
  const mean = MEAN_DAILY_SPEED[key];
  if (mean === undefined) return false;
  return Math.abs(longitudeSpeed) <= k * mean;
}

/**
 * Which station a stationary planet is at (#724), from the sign of its longitude acceleration
 * (the rate of change of its speed) at that moment. Speed falls through zero at a first station,
 * so the acceleration is negative there, and the planet turns retrograde. Speed rises through
 * zero at a second station, so the acceleration is positive, and the planet resumes direct motion.
 *
 * The sign of the speed itself cannot tell the two apart. Near a first station the speed is
 * positive before it and negative after, and near a second station it is the reverse. The
 * acceleration's sign is the same either side of a station. Returns `undefined` when the
 * acceleration is exactly zero, so the caller reports no station type rather than guessing one.
 *
 * Avelar & Ribeiro (2010), p. 61: the first station is the one a planet makes in direct motion,
 * before its retrograde phase, and the second is the one it makes in retrograde motion, before its
 * direct phase.
 */
export function stationTypeOf(acceleration: number): StationType | undefined {
  if (acceleration < 0) return 'first';
  if (acceleration > 0) return 'second';
  return undefined;
}

/** A planet's station, with the window on: the first (about to go retrograde) or the second (about to go direct). */
export type StationType = 'first' | 'second';

/**
 * The motion score's points, Avelar & Ribeiro (2010), p. 197, "Accidental Dignities and Debilities
 * and Their Scoring", the Motion subsection. Direction: direct +4, retrograde −5. Velocity: fast
 * (faster than mean) +2, slow (slower than mean) −2. A stationary planet scores as its station
 * type: a first station as retrograde, a second as direct. The Sun and Moon are never retrograde,
 * so they get the velocity points only, as the user decided for this app.
 */
export const MOTION_SCORE_POINTS = {
  direct: 4,
  retrograde: -5,
  fast: 2,
  slow: -2,
} as const;

/**
 * The motion score for a traditional planet (#724), or `undefined` when none applies.
 *
 * - Uranus, Neptune and Pluto get no score, and neither does any body outside the seven
 *   traditional planets. Their station state is shown, but they have no motion score.
 * - A stationary planet whose station type is unknown gets no score. It is not guessed.
 * - A planet exactly at mean speed gets no velocity points.
 *
 * The velocity half compares the speed without its sign against the body's mean speed, so
 * retrograde speed is measured as its magnitude.
 */
export function motionScoreOf(
  body: BodyId,
  longitudeSpeed: Degrees,
  stationary: boolean,
  stationType: StationType | undefined,
): number | undefined {
  if (!TRADITIONAL_PLANET_IDS.includes(body)) return undefined;
  const mean = meanDailySpeedOf(body);
  if (mean === undefined) return undefined;

  const key = bodyById(body)?.key;
  const neverRetrograde = key === 'sun' || key === 'moon';
  let direction = 0;
  if (!neverRetrograde) {
    if (stationary) {
      if (stationType === undefined) return undefined;
      direction = stationType === 'first' ? MOTION_SCORE_POINTS.retrograde : MOTION_SCORE_POINTS.direct;
    } else if (longitudeSpeed === 0) {
      return undefined;
    } else {
      direction = longitudeSpeed > 0 ? MOTION_SCORE_POINTS.direct : MOTION_SCORE_POINTS.retrograde;
    }
  }

  const speed = Math.abs(longitudeSpeed);
  const velocity = speed > mean ? MOTION_SCORE_POINTS.fast : speed < mean ? MOTION_SCORE_POINTS.slow : 0;
  return direction + velocity;
}

/**
 * The standard three-part hayz test: the planet is of the chart's own sect, is on "its own side"
 * of the horizon for that sect (above by day for a diurnal planet, below by night for a
 * nocturnal one), and sits in a sign whose gender matches its own nature (masculine — fire/air —
 * for a diurnal planet, feminine — earth/water — for a nocturnal one). Always `false` for
 * Mercury (sect-neutral) or any planet contrary to the chart's sect.
 */
export function isInHayz(body: BodyId, longitude: Degrees, ascendant: Degrees, chartSect: Sect): boolean {
  if (sectAlignmentOf(body, chartSect) !== 'ofSect') return false;
  const diurnal = DIURNAL_PLANETS.includes(body);
  const above = isAboveHorizon(longitude, ascendant);
  if (above !== diurnal) return false;
  const masculineSign = signOf(longitude).element === 'fire' || signOf(longitude).element === 'air';
  return masculineSign === diurnal;
}

/** True when `to` is reached first by the increasing-longitude sweep from `from` — the shorter arc runs forward, not backward. */
function isAhead(from: Degrees, to: Degrees): boolean {
  return norm360(to - from) <= 180;
}

/**
 * Whether a point is "besieged" — within conjunction orb of both Mars and Saturn (the two
 * traditional malefics) at once, with one on each side rather than both bunched on the same
 * side. The classical condition also asks whether a benefic's aspect "rescues" the besieged
 * point; that reception/aspect-based rescue is not checked here, only the raw besiegement itself.
 */
export function isBesieged(
  longitude: Degrees,
  marsLongitude: Degrees,
  saturnLongitude: Degrees,
  orbConfig: OrbConfig,
): boolean {
  const conjunctionOrb = orbFor('conjunction', 'planet', 'planet', orbConfig);
  if (angularSeparation(longitude, marsLongitude) > conjunctionOrb) return false;
  if (angularSeparation(longitude, saturnLongitude) > conjunctionOrb) return false;
  return isAhead(longitude, marsLongitude) !== isAhead(longitude, saturnLongitude);
}
