/**
 * Primary directions (#407): the oldest Western timing technique, directing the chart by the
 * diurnal rotation of the sphere itself — the primum mobile — rather than by any planet's own
 * motion. Each degree of right ascension the sphere turns after birth stands for about a year
 * of life (Martin Gansten, *Primary Directions: Astrology's Old Master Technique*, The Wessex
 * Astrologer, 2009, ch. 1).
 *
 * The schools disagree on almost every choice, so every one made here is stated:
 *
 * - **Direct directions only.** A promissor (a planet, or one of its zodiacal aspect points) is
 *   carried by the east-to-west primary motion to the natal mundane place of a significator,
 *   which stays fixed (Gansten 2009 ch. 1: "the promissor … being carried by the east-to-west
 *   primary motion to the natal place of the significator … constitutes a direct or right
 *   direction"). Converse directions — the significator carried to the promissor — are not
 *   computed. Every arc is therefore in [0, 360).
 * - **Placidus semi-arc system.** "Mundane place" is the Placidian one: two points are conjunct
 *   when they lie in the same quadrant at the same ratio of meridian distance to semi-arc (Bob
 *   Makransky, *Primary Directions: A Primer of Calculation*, 1988, ch. VII, "The Correct
 *   Placidus Method"). Not Regiomontanus, whose house circles divide the equator instead and give
 *   different arcs for every significator off the angles. At the four angles the two agree:
 *   directions to the MC are by right ascension, to the Ascendant by oblique ascension.
 * - **In zodiaco, at ecliptic latitude 0.** Both the promissor's aspect point and the
 *   significator are taken at their zodiacal longitude only, projected onto the ecliptic
 *   (β = 0) — not "in mundo", which would use each body's actual latitude. The significator's
 *   latitude is never used. A promissor latitude can be passed (`beta`, Makransky's "field
 *   plane" variant) but defaults to 0 and the domain layer never sets it.
 * - **Time keys.** Naibod: 0°59′08.33″ of right ascension per year — the mean Sun's daily
 *   motion, `NAIBOD_DAILY_MOTION` in progressions.ts, 360 / 365.2425 = 0.985647° (Makransky 1988
 *   ch. III gives the same rate as 1.0146 years per degree). Ptolemy: 1° per year.
 *
 * The spherical trigonometry, with ε the obliquity, φ the geographic latitude and RAMC the
 * right ascension of the midheaven, all taken from the ephemeris:
 *
 *     tan α = (sin λ · cos ε − tan β · sin ε) / cos λ
 *     sin δ = sin β · cos ε + cos β · sin ε · sin λ
 *     cos DSA = −tan φ · tan δ          (DSA: the diurnal semi-arc — the meridian distance at
 *     NSA = 180° − DSA                   which the point reaches the horizon)
 *     MC:  D = RA_promissor − RAMC
 *     ASC: D = OA_promissor − OA_ASC,  OA = RA − AD,  AD = DSA − 90°,  OA_ASC = RAMC + 90°
 *
 * and, for a significator S off the angles, D is the right ascension the sphere turns until
 * the promissor's own meridian distance stands to its own semi-arc as S's does to S's.
 * `placidianMundanePosition` expresses that ratio on Makransky's 0–360 scale (ASC 0, IC 90,
 * DSC 180, MC 270 — a Placidus house position times 30), so every significator, angle or not,
 * is one number and one inversion.
 *
 * Placidian semi-arcs do not exist for a circumpolar point (|tan φ · tan δ| ≥ 1). For a point on
 * the ecliptic (|δ| ≤ ε) that can only happen at or beyond the polar circles,
 * |φ| ≥ 90° − ε — the same latitudes where Placidus houses fail. `isDefinedAtLatitude` is that
 * check; every function here throws a `RangeError` rather than returning a made-up arc for a
 * circumpolar point.
 *
 * Verified in `test/primary-directions.test.ts` against two published worked examples, to the
 * arcminute: John Gadbury's direction of Henry II of France's Ascendant to Mars (*Collection of
 * Nativities*, 1661, as reworked by Deborah Houlding, "An Easy Introduction to Primary
 * Directions", Skyscript, 2009) and Makransky's 1988 Prince Charles speculum.
 */

/**
 * @module PrimaryDirections
 * @purpose Spherical-trigonometry engine for zodiacal primary directions under the Placidus semi-arc system: ecliptic-to-equatorial conversion, semi-arcs, Placidian mundane position and its inverse, arcs of direction, the time keys, and the directed zodiacal degree of a significator after a given arc.
 * @conventions Direct directions only (arcs in [0, 360)); significators and promissor aspect points at ecliptic latitude 0 (in zodiaco) unless `beta` is passed for the promissor; mundane position on Makransky's 0–360 scale (ASC 0, IC 90, DSC 180, MC 270); Naibod key reuses progressions.ts's NAIBOD_DAILY_MOTION, Ptolemy is 1°/year; circumpolar points throw RangeError rather than yield an arc.
 * @exports PrimaryDirectionTimeKey, TIME_KEY_DEGREES_PER_YEAR, arcToYears, yearsToArc, SphereFrame, EquatorialPosition, SemiArcs, eclipticToEquatorial, eclipticLongitudeFromRightAscension, semiArcs, isDefinedAtLatitude, placidianMundanePosition, hourAngleAtMundanePosition, directArc, midheavenLongitude, ascendantLongitude, eclipticPointAtMundanePosition, directedLongitude, DirectionAngle, ANGLE_MUNDANE_POSITIONS, DIRECTION_ASPECT_OFFSETS, DirectionSignificator, DirectionPromissor, DirectionHit, PrimaryDirectionOptions, PrimaryDirectionResult, significatorMundanePosition, calculatePrimaryDirections
 */
import { ASPECTS } from './aspects.js';
import { NAIBOD_DAILY_MOTION } from './progressions.js';
import type { Degrees } from '../ephemeris/types.js';

const RAD = Math.PI / 180;

function sinD(degrees: Degrees): number {
  return Math.sin(degrees * RAD);
}

function cosD(degrees: Degrees): number {
  return Math.cos(degrees * RAD);
}

function tanD(degrees: Degrees): number {
  return Math.tan(degrees * RAD);
}

function norm360(degrees: Degrees): Degrees {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

/** Normalised to (-180, 180]. */
function norm180(degrees: Degrees): Degrees {
  const value = norm360(degrees);
  return value > 180 ? value - 360 : value;
}

/** The rate keys that convert an arc of direction into years of life. */
export type PrimaryDirectionTimeKey = 'naibod' | 'ptolemy';

/**
 * Degrees of right ascension per year of life, per key. Naibod is the mean Sun's daily motion
 * (0°59′08.33″, progressions.ts's `NAIBOD_DAILY_MOTION`); Ptolemy is one degree a year.
 */
export const TIME_KEY_DEGREES_PER_YEAR: Readonly<Record<PrimaryDirectionTimeKey, Degrees>> = {
  naibod: NAIBOD_DAILY_MOTION,
  ptolemy: 1,
};

/** Years of life an arc of direction stands for, under the given key. */
export function arcToYears(arc: Degrees, key: PrimaryDirectionTimeKey): number {
  return arc / TIME_KEY_DEGREES_PER_YEAR[key];
}

/** The arc of direction that stands for `years` of life, under the given key. */
export function yearsToArc(years: number, key: PrimaryDirectionTimeKey): Degrees {
  return years * TIME_KEY_DEGREES_PER_YEAR[key];
}

/** The birth sphere every direction is measured on — all three straight from the ephemeris. */
export interface SphereFrame {
  /** Right ascension of the midheaven (ARMC), in degrees. */
  readonly ramc: Degrees;
  /** True obliquity of the ecliptic ε, in degrees. */
  readonly obliquity: Degrees;
  /** Geographic latitude φ of the birthplace, degrees north; negative for south. */
  readonly geoLatitude: Degrees;
}

export interface EquatorialPosition {
  /** Right ascension α in [0, 360). */
  readonly rightAscension: Degrees;
  /** Declination δ in [-90, 90]. */
  readonly declination: Degrees;
}

/**
 * Ecliptic (λ, β) to equatorial (α, δ):
 * `tan α = (sin λ · cos ε − tan β · sin ε) / cos λ`, `sin δ = sin β · cos ε + cos β · sin ε · sin λ`.
 * `atan2` keeps α in the same half of the circle as λ.
 */
export function eclipticToEquatorial(longitude: Degrees, latitude: Degrees, obliquity: Degrees): EquatorialPosition {
  const rightAscension = norm360(
    Math.atan2(sinD(longitude) * cosD(obliquity) - tanD(latitude) * sinD(obliquity), cosD(longitude)) / RAD,
  );
  const sinDeclination = sinD(latitude) * cosD(obliquity) + cosD(latitude) * sinD(obliquity) * sinD(longitude);
  const declination = Math.asin(Math.max(-1, Math.min(1, sinDeclination))) / RAD;
  return { rightAscension, declination };
}

/** The ecliptic longitude (β = 0) with right ascension α — the inverse of `eclipticToEquatorial` on the ecliptic. */
export function eclipticLongitudeFromRightAscension(rightAscension: Degrees, obliquity: Degrees): Degrees {
  return norm360(Math.atan2(sinD(rightAscension), cosD(rightAscension) * cosD(obliquity)) / RAD);
}

export interface SemiArcs {
  /** Half the point's diurnal circle above the horizon (DSA), in degrees of right ascension. */
  readonly diurnal: Degrees;
  /** Half its diurnal circle below the horizon (NSA = 180° − DSA). */
  readonly nocturnal: Degrees;
}

/** `cos DSA = −tan φ · tan δ`. Throws for a circumpolar point, which never rises or never sets and has no semi-arc. */
export function semiArcs(declination: Degrees, geoLatitude: Degrees): SemiArcs {
  const cosine = -tanD(geoLatitude) * tanD(declination);
  if (!(Math.abs(cosine) < 1)) {
    throw new RangeError(
      `A point at declination ${declination.toFixed(2)}° is circumpolar at latitude ${geoLatitude.toFixed(2)}°: ` +
        'it has no Placidian semi-arc, so no primary direction can be measured to or from it.',
    );
  }
  const diurnal = Math.acos(cosine) / RAD;
  return { diurnal, nocturnal: 180 - diurnal };
}

/**
 * Whether every ecliptic point (|δ| ≤ ε) has Placidian semi-arcs at this latitude: |φ| < 90° − ε,
 * i.e. strictly inside the polar circles. At or beyond them part of the ecliptic is circumpolar.
 */
export function isDefinedAtLatitude(geoLatitude: Degrees, obliquity: Degrees): boolean {
  return Math.abs(geoLatitude) < 90 - obliquity;
}

/** Hour angle in (-180, 180]: positive west of the upper meridian (already culminated), negative east. */
function hourAngle(rightAscension: Degrees, ramc: Degrees): Degrees {
  return norm180(ramc - rightAscension);
}

/** The Placidian 0–360 scale from an hour angle and the point's own semi-arcs (Makransky 1988 ch. VII). */
function mundanePositionFromHourAngle(hour: Degrees, arcs: SemiArcs): Degrees {
  const { diurnal, nocturnal } = arcs;
  // Upper east (houses 12-10): MC 270 rising to ASC 360.
  if (hour <= 0 && -hour <= diurnal) return norm360(270 + (90 * -hour) / diurnal);
  // Upper west (houses 9-7): MC 270 down to DSC 180.
  if (hour > 0 && hour <= diurnal) return 270 - (90 * hour) / diurnal;
  // Lower west (houses 6-4): DSC 180 down to IC 90.
  if (hour > 0) return 90 + (90 * (180 - hour)) / nocturnal;
  // Lower east (houses 3-1): IC 90 down to ASC 0.
  return 90 - (90 * (180 + hour)) / nocturnal;
}

/**
 * A point's Placidian mundane position on Makransky's scale: ASC 0, IC 90, DSC 180, MC 270, each
 * quadrant divided in proportion to the point's own semi-arc — a Placidus house position times 30.
 */
export function placidianMundanePosition(point: EquatorialPosition, frame: SphereFrame): Degrees {
  const arcs = semiArcs(point.declination, frame.geoLatitude);
  return mundanePositionFromHourAngle(hourAngle(point.rightAscension, frame.ramc), arcs);
}

/** The hour angle at which a point with these semi-arcs stands at mundane position `mundanePosition` — the inverse of the scale above. */
export function hourAngleAtMundanePosition(mundanePosition: Degrees, arcs: SemiArcs): Degrees {
  const position = norm360(mundanePosition);
  const { diurnal, nocturnal } = arcs;
  if (position >= 270) return (-diurnal * (position - 270)) / 90;
  if (position >= 180) return (diurnal * (270 - position)) / 90;
  if (position >= 90) return 180 - (nocturnal * (position - 90)) / 90;
  return -180 + (nocturnal * (90 - position)) / 90;
}

/**
 * The direct arc of direction, in [0, 360): how many degrees of right ascension the sphere turns
 * (every hour angle growing by the same amount) before `promissor` stands at the significator's
 * natal mundane position under its own semi-arcs. For the MC (270) this is `RA − RAMC`; for the
 * Ascendant (0) `OA − (RAMC + 90°)`.
 */
export function directArc(
  promissor: EquatorialPosition,
  significatorMundanePosition: Degrees,
  frame: SphereFrame,
): Degrees {
  const arcs = semiArcs(promissor.declination, frame.geoLatitude);
  const target = hourAngleAtMundanePosition(significatorMundanePosition, arcs);
  return norm360(target - hourAngle(promissor.rightAscension, frame.ramc));
}

/** The Midheaven's ecliptic longitude: the ecliptic point whose right ascension is the RAMC. */
export function midheavenLongitude(ramc: Degrees, obliquity: Degrees): Degrees {
  return eclipticLongitudeFromRightAscension(ramc, obliquity);
}

/** The Ascendant's ecliptic longitude: `λ = atan2(cos RAMC, −(sin RAMC · cos ε + tan φ · sin ε))`. */
export function ascendantLongitude(frame: SphereFrame): Degrees {
  const { ramc, obliquity, geoLatitude } = frame;
  return norm360(Math.atan2(cosD(ramc), -(sinD(ramc) * cosD(obliquity) + tanD(geoLatitude) * sinD(obliquity))) / RAD);
}

/** The zodiac-order quadrant (start longitude, its mundane position, span in longitude) a mundane position falls in. */
function quadrantFor(
  position: Degrees,
  mc: Degrees,
  asc: Degrees,
): { readonly startLongitude: Degrees; readonly startPosition: Degrees; readonly span: Degrees } {
  const ic = norm360(mc + 180);
  const dsc = norm360(asc + 180);
  // In zodiac order the angles run MC -> ASC -> IC -> DSC -> MC; mundane position rises
  // 270 -> 360 -> 90 -> 180 -> 270 with them.
  if (position >= 270) return { startLongitude: mc, startPosition: 270, span: norm360(asc - mc) };
  if (position >= 180) return { startLongitude: dsc, startPosition: 180, span: norm360(mc - dsc) };
  if (position >= 90) return { startLongitude: ic, startPosition: 90, span: norm360(dsc - ic) };
  return { startLongitude: asc, startPosition: 0, span: norm360(ic - asc) };
}

/**
 * The ecliptic longitude (β = 0) that stands at Placidian mundane position `mundanePosition` on
 * this sphere — a Placidus "cusp" at any fraction, not just the twelve whole houses (mundane
 * position 300 is the 11th cusp, 330 the 12th, 30 the 2nd, 60 the 3rd). Found by bisection
 * between the quadrant's two angles, along which an ecliptic point's mundane position rises
 * monotonically through exactly 90°.
 */
export function eclipticPointAtMundanePosition(mundanePosition: Degrees, frame: SphereFrame): Degrees {
  const target = norm360(mundanePosition);
  const mc = midheavenLongitude(frame.ramc, frame.obliquity);
  const asc = ascendantLongitude(frame);
  const { startLongitude, startPosition, span } = quadrantFor(target, mc, asc);
  const wanted = target - startPosition;

  // How far into the quadrant (0..90) the ecliptic point `offset` degrees past its start
  // stands. Rounding can put the very start a hair below 0, which must not read as ~360.
  const progress = (offset: Degrees): Degrees => {
    const point = eclipticToEquatorial(startLongitude + offset, 0, frame.obliquity);
    const into = norm360(placidianMundanePosition(point, frame) - startPosition);
    return into > 270 ? into - 360 : into;
  };

  let low = 0;
  let high = span;
  for (let i = 0; i < 64 && high - low > 1e-12; i++) {
    const middle = (low + high) / 2;
    if (progress(middle) < wanted) low = middle;
    else high = middle;
  }
  return norm360(startLongitude + (low + high) / 2);
}

/**
 * The zodiacal degree a significator has been "directed to" after `arc`: the ecliptic point that
 * the sphere's rotation has brought to the significator's natal mundane position. Classical
 * authors speak of the significator moving forward through the signs this way (Gansten 2009
 * ch. 1); a direction perfects exactly when this degree reaches the promissor's aspect point. For
 * the MC it is the ecliptic degree with RA = RAMC + arc; for the Ascendant, the Ascendant of
 * RAMC + arc.
 */
export function directedLongitude(significatorMundanePosition: Degrees, arc: Degrees, frame: SphereFrame): Degrees {
  return eclipticPointAtMundanePosition(significatorMundanePosition, { ...frame, ramc: norm360(frame.ramc + arc) });
}

/** The four angles, which are significators by definition of where they stand rather than by longitude. */
export type DirectionAngle = 'asc' | 'ic' | 'dsc' | 'mc';

/** Each angle's mundane position, exact by definition. */
export const ANGLE_MUNDANE_POSITIONS: Readonly<Record<DirectionAngle, Degrees>> = {
  asc: 0,
  ic: 90,
  dsc: 180,
  mc: 270,
};

/**
 * The zodiacal aspect points a promissor is directed by: the five Ptolemaic aspects (`ASPECTS`'s
 * major family), each but the conjunction and opposition on both sides. A positive offset is the
 * sinister aspect, cast forward in the order of the signs; a negative one the dexter aspect, cast
 * against it (Gansten 2009 ch. 1).
 */
export const DIRECTION_ASPECT_OFFSETS: readonly { readonly aspect: string; readonly offset: Degrees }[] =
  ASPECTS.filter((aspect) => aspect.family === 'major').flatMap((aspect) =>
    aspect.angle === 0 || aspect.angle === 180
      ? [{ aspect: aspect.key, offset: aspect.angle }]
      : [
          { aspect: aspect.key, offset: aspect.angle },
          { aspect: aspect.key, offset: -aspect.angle },
        ],
  );

/** The fixed side of a direction. */
export interface DirectionSignificator {
  /** Identifier carried into each hit — a `BodyDefinition.key`, or `'asc'`/`'mc'`. */
  readonly key: string;
  /** Zodiacal longitude; its latitude is never used (in zodiaco). Informational for an angle. */
  readonly longitude: Degrees;
  /** Set for an angle, whose mundane position is fixed by definition (`ANGLE_MUNDANE_POSITIONS`). */
  readonly angle?: DirectionAngle;
}

/** The moving side of a direction: a body, directed by its own place and its zodiacal aspects. */
export interface DirectionPromissor {
  readonly key: string;
  readonly longitude: Degrees;
}

/** One promissor point reaching one significator. */
export interface DirectionHit {
  readonly significator: string;
  readonly promissor: string;
  /** `AspectDefinition.key` of the aspect directed; 'conjunction' for the promissor's own place. */
  readonly aspect: string;
  /** Added to the promissor's longitude to get the point directed: + sinister, − dexter, 0 or 180 for conjunction/opposition. */
  readonly aspectOffset: Degrees;
  /** The ecliptic longitude actually directed. */
  readonly promissorPoint: Degrees;
  /** Arc of direction in right ascension, [0, 360). */
  readonly arcRA: Degrees;
  /** `arcRA` in years of life under the requested key. */
  readonly ageYears: number;
}

export interface PrimaryDirectionOptions {
  /** The promissor's ecliptic latitude for every aspect point. 0 (zodiacal, the default) unless a latitude variant is wanted. */
  readonly beta?: Degrees;
  /** Defaults to Naibod. */
  readonly key?: PrimaryDirectionTimeKey;
}

export interface PrimaryDirectionResult {
  /** Arc of the promissor's own place (the conjunction) to the significator. */
  readonly arcRA: Degrees;
  readonly ageYears: number;
  /** Every aspect point of the promissor to the significator, conjunction included, ascending by arc. */
  readonly directions: readonly DirectionHit[];
}

/** A significator's natal mundane position: exact for an angle, from its zodiacal degree (β = 0) otherwise. */
export function significatorMundanePosition(significator: DirectionSignificator, frame: SphereFrame): Degrees {
  if (significator.angle !== undefined) return ANGLE_MUNDANE_POSITIONS[significator.angle];
  return placidianMundanePosition(eclipticToEquatorial(significator.longitude, 0, frame.obliquity), frame);
}

/**
 * Every direct zodiacal direction of one promissor (its place and its Ptolemaic aspect points) to
 * one significator. Throws `RangeError` when either point is circumpolar at `frame.geoLatitude`.
 */
export function calculatePrimaryDirections(
  significator: DirectionSignificator,
  promissor: DirectionPromissor,
  frame: SphereFrame,
  options: PrimaryDirectionOptions = {},
): PrimaryDirectionResult {
  const key = options.key ?? 'naibod';
  const beta = options.beta ?? 0;
  const target = significatorMundanePosition(significator, frame);

  const directions = DIRECTION_ASPECT_OFFSETS.map(({ aspect, offset }): DirectionHit => {
    const promissorPoint = norm360(promissor.longitude + offset);
    const arcRA = directArc(eclipticToEquatorial(promissorPoint, beta, frame.obliquity), target, frame);
    return {
      significator: significator.key,
      promissor: promissor.key,
      aspect,
      aspectOffset: offset,
      promissorPoint,
      arcRA,
      ageYears: arcToYears(arcRA, key),
    };
  }).sort((a, b) => a.arcRA - b.arcRA);

  const conjunction = directions.find((hit) => hit.aspectOffset === 0);
  if (conjunction === undefined)
    throw new Error('unreachable: DIRECTION_ASPECT_OFFSETS always includes the conjunction');
  return { arcRA: conjunction.arcRA, ageYears: conjunction.ageYears, directions };
}
