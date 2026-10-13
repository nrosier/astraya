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
 * @exports TRADITIONAL_PLANET_IDS, DIURNAL_PLANETS, NOCTURNAL_PLANETS, SectAlignment, sectAlignmentOf, Angularity, angularityOfHouse, Motion, motionOf, isInHayz, isBesieged
 */
import type { BodyId, Degrees } from '../ephemeris/types.js';
import { bodyByKey } from './bodies.js';
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
