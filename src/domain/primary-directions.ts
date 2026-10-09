/**
 * Primary directions for one birth chart (#407): every direct zodiacal direction of the planets
 * to the four classical significators over a lifetime, each with the age and date it perfects
 * under the chosen time key, the window around it in which it counts as active, and — for any
 * chosen age — the directed chart to draw against the natal one.
 *
 * The method itself (Placidus semi-arcs, in zodiaco at latitude 0, direct only) is
 * `src/astrology/primary-directions.ts`'s, stated in its header. The choices made here:
 *
 * - **Significators: Ascendant, Midheaven, Sun and Moon.** The hylegiacal points Ptolemy and most
 *   classical authors directed to are those four plus the Part of Fortune (Gansten 2009 ch. 1);
 *   the Part is left out because Parts were traditionally directed converse (Gansten 2009 ch. 1,
 *   quoting ar-Rijāl), and only direct directions are computed. The Descendant and IC need no
 *   entries of their own: a point directed to the Ascendant brings its opposition to the
 *   Descendant at the same arc (Gansten 2009 ch. 1), and the opposition is one of the aspects
 *   directed.
 * - **Promissors: Sun through Pluto.** "The traditional promissors are mainly the seven planets
 *   and their aspects" (Gansten 2009 ch. 1); the three modern planets are directed as well, as
 *   twentieth-century authors do (Makransky 1988 directs Uranus and Pluto). A body is never
 *   directed to itself.
 * - **Orb as a window in arc.** A direction is listed as active while the arc for the chosen age
 *   is within `orb` degrees of right ascension of its own arc. The default, 1°, is one year at
 *   the Ptolemy key — "each degree of rotation … corresponds to one year of life" (Gansten 2009
 *   ch. 1) — so a direction is active from about a year before it perfects to about a year
 *   after. This is a display window, not a claim that effects last exactly that long.
 * - **Lifetime window.** Directions are listed up to `DEFAULT_MAX_AGE_YEARS` of age — a display
 *   limit, the same kind of bound `findExactnessJd`'s 150-year search window is for solar arcs.
 * - **Tropical, Placidus.** Positions are tropical whatever the user's zodiac setting, since
 *   right ascension is measured from the vernal equinox; houses are Placidus, the house system
 *   built on the same semi-arcs the directions are measured by.
 *
 * The directed chart for an age is the sphere turned by that age's arc: its houses are the
 * Placidus houses of the moment the RAMC had advanced by the arc (the real sky a few hours after
 * birth — `directedHouses` iterates against the ephemeris's own ARMC until they match), and each
 * body's directed degree is `directedLongitude`'s, the zodiac point the turn has brought to that
 * body's natal mundane place.
 */

/**
 * @module primary-directions
 * @purpose Computes a person's primary directions (#407): direct zodiacal Placidus-semi-arc directions of Sun–Pluto and their Ptolemaic aspects to the Ascendant, Midheaven, Sun and Moon, each with age, exact date and active window; plus the directed chart (houses and positions) at a chosen age for a bi-wheel.
 * @conventions PrimaryDirectionKey is a const object, not a TS enum (the project compiles under erasableSyntaxOnly); orb is a window in degrees of RA around each hit's arc (default 1°), stored per hit as activeFromAge/activeUntilAge so filtering never needs the key; tropical zodiac and Placidus houses always; at or beyond the polar circles (|φ| ≥ 90° − ε) returns defined: false with no hits instead of throwing.
 * @exports PrimaryDirectionKey, arcToAge, ageToArc, DEFAULT_PRIMARY_DIRECTION_ORB, DEFAULT_MAX_AGE_YEARS, PRIMARY_DIRECTION_SIGNIFICATORS, PRIMARY_DIRECTION_PROMISSORS, PrimaryDirection, PrimaryDirectionsOptions, PrimaryDirectionsData, generatePrimaryDirections, isDirectionActive, activeDirections, DirectedBodyPosition, DirectedChart, directedChartAt
 */
import { bodyByKey } from '../astrology/bodies.js';
import {
  arcToYears,
  calculatePrimaryDirections,
  directedLongitude,
  eclipticToEquatorial,
  isDefinedAtLatitude,
  placidianMundanePosition,
  yearsToArc,
  type DirectionHit,
  type DirectionSignificator,
  type PrimaryDirectionTimeKey,
  type SphereFrame,
} from '../astrology/primary-directions.js';
import { TROPICAL_YEAR_DAYS } from '../astrology/progressions.js';
import { computeChartDataAtJd, type ChartData } from './chart-compute.js';
import { julianDayFor } from '../time/julian.js';
import { resolveMoment } from '../time/resolve.js';
import type {
  BodyId,
  Degrees,
  EphemerisProvider,
  GeoPosition,
  HousePositions,
  HouseSystem,
  JulianDayUT,
} from '../ephemeris/types.js';
import type { BirthMomentInput } from '../time/types.js';

/**
 * The time keys, as named constants. A const object rather than a TypeScript `enum`: the
 * project compiles under `erasableSyntaxOnly`, which rejects enums, and this keeps the same
 * `PrimaryDirectionKey.NAIBOD` spelling.
 */
export const PrimaryDirectionKey = {
  NAIBOD: 'naibod',
  PTOLEMY: 'ptolemy',
} as const satisfies Record<string, PrimaryDirectionTimeKey>;

export type PrimaryDirectionKey = (typeof PrimaryDirectionKey)[keyof typeof PrimaryDirectionKey];

/** Years of life an arc of direction stands for under `key`. */
export function arcToAge(arcDegrees: Degrees, key: PrimaryDirectionKey): number {
  return arcToYears(arcDegrees, key);
}

/** The arc of direction that stands for `ageYears` under `key`. */
export function ageToArc(ageYears: number, key: PrimaryDirectionKey): Degrees {
  return yearsToArc(ageYears, key);
}

/** Half-width of a direction's active window, in degrees of right ascension — one year at the Ptolemy key. */
export const DEFAULT_PRIMARY_DIRECTION_ORB: Degrees = 1;

/** How far into a life directions are listed — a display limit, not an astrological one. */
export const DEFAULT_MAX_AGE_YEARS = 100;

/** The hylegiacal points directed to, minus the Part of Fortune (see the header). */
export const PRIMARY_DIRECTION_SIGNIFICATORS = ['asc', 'mc', 'sun', 'moon'] as const;

/** The bodies directed, by `BodyDefinition.key`. */
export const PRIMARY_DIRECTION_PROMISSORS = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
] as const;

/** Placidus: the semi-arc system's own houses. */
const HOUSE_SYSTEM: HouseSystem = 'P';

/** One direction over the lifetime, with its date and active window. */
export interface PrimaryDirection extends DirectionHit {
  /** The Julian day the direction perfects: birth plus `ageYears` tropical years. */
  readonly exactJd: JulianDayUT;
  /** The window half-width this hit was listed with, in degrees of right ascension. */
  readonly orb: Degrees;
  /** Age at which the arc for the age first comes within `orb` of this hit's arc. Negative when that is before birth. */
  readonly activeFromAge: number;
  /** Age at which it leaves the window again. */
  readonly activeUntilAge: number;
}

export interface PrimaryDirectionsOptions {
  /** Defaults to `DEFAULT_MAX_AGE_YEARS`. */
  readonly maxAgeYears?: number;
}

export interface PrimaryDirectionsData {
  readonly natalJd: JulianDayUT;
  readonly place: GeoPosition;
  readonly key: PrimaryDirectionKey;
  readonly orb: Degrees;
  readonly frame: SphereFrame;
  /** The natal chart (tropical, Placidus), for the bi-wheel's inner ring. */
  readonly natal: ChartData;
  /**
   * False at or beyond |φ| = 90° − ε, where part of the ecliptic is circumpolar and has no
   * Placidian semi-arc: no direction is computed and `hits` is empty, rather than a partial list
   * that silently skips whatever could not be measured.
   */
  readonly defined: boolean;
  /** Every direction within the lifetime window, ascending by arc (and so by age). */
  readonly hits: readonly PrimaryDirection[];
}

function bodyIdOf(key: string): BodyId {
  const body = bodyByKey(key);
  if (body === undefined) throw new Error(`unreachable: ${key} is always one of BODIES`);
  return body.id;
}

function longitudeOf(natal: ChartData, key: string): Degrees {
  const id = bodyIdOf(key);
  const position = natal.positions.find((candidate) => candidate.body === id);
  if (position === undefined) throw new Error(`unreachable: the natal chart always carries ${key}`);
  return position.longitude;
}

function significatorsOf(natal: ChartData): readonly DirectionSignificator[] {
  return PRIMARY_DIRECTION_SIGNIFICATORS.map((key): DirectionSignificator => {
    if (key === 'asc') return { key, longitude: natal.houses.ascendant, angle: 'asc' };
    if (key === 'mc') return { key, longitude: natal.houses.midheaven, angle: 'mc' };
    return { key, longitude: longitudeOf(natal, key) };
  });
}

/**
 * Every primary direction for a birth moment, under `key`, each listed with an active window of
 * ±`orbDefault` degrees of arc. `provider` must already be initialized.
 */
export async function generatePrimaryDirections(
  natalMoment: BirthMomentInput,
  provider: EphemerisProvider,
  key: PrimaryDirectionKey = PrimaryDirectionKey.NAIBOD,
  orbDefault: Degrees = DEFAULT_PRIMARY_DIRECTION_ORB,
  options: PrimaryDirectionsOptions = {},
): Promise<PrimaryDirectionsData> {
  const natalJd = await julianDayFor(provider, resolveMoment(natalMoment));
  const place: GeoPosition = { ...natalMoment.coordinates, altitude: 0 };
  const natal = await computeChartDataAtJd(natalJd, place, provider, { houseSystem: HOUSE_SYSTEM });
  const obliquity = natal.obliquity ?? (await provider.obliquity(natalJd));
  const frame: SphereFrame = { ramc: natal.houses.armc, obliquity, geoLatitude: place.latitude };
  const base = { natalJd, place, key, orb: orbDefault, frame, natal };

  if (!isDefinedAtLatitude(frame.geoLatitude, frame.obliquity)) return { ...base, defined: false, hits: [] };

  const maxArc = ageToArc(options.maxAgeYears ?? DEFAULT_MAX_AGE_YEARS, key);
  const promissors = PRIMARY_DIRECTION_PROMISSORS.map((promissorKey) => ({
    key: promissorKey,
    longitude: longitudeOf(natal, promissorKey),
  }));

  const hits: PrimaryDirection[] = [];
  for (const significator of significatorsOf(natal)) {
    for (const promissor of promissors) {
      if (promissor.key === significator.key) continue;
      for (const hit of calculatePrimaryDirections(significator, promissor, frame, { key }).directions) {
        if (hit.arcRA <= 0 || hit.arcRA > maxArc) continue;
        hits.push({
          ...hit,
          exactJd: natalJd + hit.ageYears * TROPICAL_YEAR_DAYS,
          orb: orbDefault,
          activeFromAge: arcToAge(hit.arcRA - orbDefault, key),
          activeUntilAge: arcToAge(hit.arcRA + orbDefault, key),
        });
      }
    }
  }
  hits.sort((a, b) => a.arcRA - b.arcRA);

  return { ...base, defined: true, hits };
}

/** Whether a direction's active window includes `ageYears`. */
export function isDirectionActive(hit: PrimaryDirection, ageYears: number): boolean {
  return hit.activeFromAge <= ageYears && ageYears <= hit.activeUntilAge;
}

/** The directions active at `ageYears` — those whose window includes it — in the input's order. */
export function activeDirections(hits: readonly PrimaryDirection[], ageYears: number): readonly PrimaryDirection[] {
  return hits.filter((hit) => isDirectionActive(hit, ageYears));
}

/** A body's directed degree, shaped for a wheel ring. */
export interface DirectedBodyPosition {
  readonly body: BodyId;
  readonly key: string;
  readonly longitude: Degrees;
}

export interface DirectedChart {
  readonly ageYears: number;
  /** The arc of direction for `ageYears` under the data's key. */
  readonly arc: Degrees;
  /** Placidus houses for RAMC + arc — the directed angles and cusps. */
  readonly houses: HousePositions;
  /** Each promissor body's directed degree. */
  readonly positions: readonly DirectedBodyPosition[];
}

/**
 * How far the RAMC advances per day of Universal Time: the sidereal rotation rate, 360.98564736629°
 * per day (Meeus, *Astronomical Algorithms*, 2nd ed., 1998, eq. 12.4). Only a first guess here —
 * `directedHouses` corrects against the ephemeris's own ARMC.
 */
const SIDEREAL_DEGREES_PER_DAY = 360.98564736629;

/** Placidus houses at the moment the RAMC stands at `natalArmc + arc`, iterated against the ephemeris's own ARMC. */
async function directedHouses(
  provider: EphemerisProvider,
  natalJd: JulianDayUT,
  place: GeoPosition,
  natalArmc: Degrees,
  arc: Degrees,
): Promise<HousePositions> {
  const targetArmc = natalArmc + arc;
  let jd = natalJd + arc / SIDEREAL_DEGREES_PER_DAY;
  let houses = await provider.houses(jd, place, HOUSE_SYSTEM);
  for (let i = 0; i < 4; i++) {
    const remaining = ((((targetArmc - houses.armc) % 360) + 540) % 360) - 180;
    if (Math.abs(remaining) < 1e-9) break;
    jd += remaining / SIDEREAL_DEGREES_PER_DAY;
    houses = await provider.houses(jd, place, HOUSE_SYSTEM);
  }
  return houses;
}

/**
 * The directed chart at `ageYears`: the sphere turned by that age's arc. Only meaningful when
 * `data.defined`; throws `RangeError` (from the engine) otherwise.
 */
export async function directedChartAt(
  data: PrimaryDirectionsData,
  ageYears: number,
  provider: EphemerisProvider,
): Promise<DirectedChart> {
  const arc = ageToArc(ageYears, data.key);
  const houses = await directedHouses(provider, data.natalJd, data.place, data.frame.ramc, arc);
  const positions = PRIMARY_DIRECTION_PROMISSORS.map((key): DirectedBodyPosition => {
    const natalPoint = eclipticToEquatorial(longitudeOf(data.natal, key), 0, data.frame.obliquity);
    const mundanePosition = placidianMundanePosition(natalPoint, data.frame);
    return { body: bodyIdOf(key), key, longitude: directedLongitude(mundanePosition, arc, data.frame) };
  });
  return { ageYears, arc, houses, positions };
}
