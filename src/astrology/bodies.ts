/**
 * The canonical set of bodies Astraya computes positions for (#17).
 *
 * This is the single place that decides "what is a body" for the rest of the
 * app — chart rendering, aspects, dignities and progressions all iterate this
 * list rather than each keeping their own. Three of the entries are not
 * physical bodies at all: the lunar nodes and the three "Lilith" points are
 * orbital elements of the Moon's path, not things with their own gravity, and
 * Swiss Ephemeris computes them from three different models (an osculating
 * ellipse, its instantaneous tangent, and an interpolation between the two) —
 * hence three SE ids rather than one, and why none of them can be checked
 * against JPL Horizons the way a real body can: there is nothing independent
 * to check against, since the model *is* the definition.
 */

/**
 * @module Bodies
 * @purpose Defines the canonical set of bodies (luminaries, planets, nodes, Lilith variants, Chiron, main-belt asteroids) Astraya computes positions for, plus the opt-in set (Pholus, #804) that is computed only on request.
 * @conventions Order matches traditional chart-listing order, not SE numeric ids; the lunar nodes and three Lilith variants are orbital elements rather than physical bodies, computed by Swiss Ephemeris under three different models, so none can be checked against JPL Horizons.
 * @exports BODIES, OPT_IN_BODIES, BodySetOptions, bodiesFor, bodyIdsFor, bodyById, bodyByKey, southNode
 */
import { SE } from '../ephemeris/generated-constants.ts';
import type { BodyId } from '../ephemeris/types.js';

export type BodyCategory = 'luminary' | 'planet' | 'node' | 'lilith' | 'centaur' | 'asteroid';

export interface BodyDefinition {
  readonly id: BodyId;
  readonly key: string;
  readonly name: string;
  readonly category: BodyCategory;
}

/**
 * Sun through Pluto, both lunar nodes, all three Lilith variants, Chiron, and
 * the four main-belt asteroids visible to the naked eye at opposition.
 *
 * Order matches the traditional chart-listing order (luminaries, personal and
 * outer planets, then points), not the SE numeric ids.
 */
export const BODIES: readonly BodyDefinition[] = [
  { id: SE.SE_SUN, key: 'sun', name: 'Sun', category: 'luminary' },
  { id: SE.SE_MOON, key: 'moon', name: 'Moon', category: 'luminary' },
  { id: SE.SE_MERCURY, key: 'mercury', name: 'Mercury', category: 'planet' },
  { id: SE.SE_VENUS, key: 'venus', name: 'Venus', category: 'planet' },
  { id: SE.SE_MARS, key: 'mars', name: 'Mars', category: 'planet' },
  { id: SE.SE_JUPITER, key: 'jupiter', name: 'Jupiter', category: 'planet' },
  { id: SE.SE_SATURN, key: 'saturn', name: 'Saturn', category: 'planet' },
  { id: SE.SE_URANUS, key: 'uranus', name: 'Uranus', category: 'planet' },
  { id: SE.SE_NEPTUNE, key: 'neptune', name: 'Neptune', category: 'planet' },
  { id: SE.SE_PLUTO, key: 'pluto', name: 'Pluto', category: 'planet' },
  { id: SE.SE_MEAN_NODE, key: 'meanNode', name: 'Mean Node', category: 'node' },
  { id: SE.SE_TRUE_NODE, key: 'trueNode', name: 'True Node', category: 'node' },
  { id: SE.SE_MEAN_APOG, key: 'meanLilith', name: 'Mean Lilith', category: 'lilith' },
  { id: SE.SE_OSCU_APOG, key: 'osculatingLilith', name: 'Osculating Lilith', category: 'lilith' },
  { id: SE.SE_INTP_APOG, key: 'interpolatedLilith', name: 'Interpolated Lilith', category: 'lilith' },
  { id: SE.SE_CHIRON, key: 'chiron', name: 'Chiron', category: 'centaur' },
  { id: SE.SE_CERES, key: 'ceres', name: 'Ceres', category: 'asteroid' },
  { id: SE.SE_PALLAS, key: 'pallas', name: 'Pallas', category: 'asteroid' },
  { id: SE.SE_JUNO, key: 'juno', name: 'Juno', category: 'asteroid' },
  { id: SE.SE_VESTA, key: 'vesta', name: 'Vesta', category: 'asteroid' },
];

/**
 * Bodies that are computed only when the caller asks (#804). Pholus is a centaur like Chiron, read from the
 * shipped `seas_18.se1`, so only 1800-2399 CE. It stays out of `BODIES` so that no existing chart, transit,
 * synastry, return, progression or report gains a body (or a contact) nobody turned on; it is looked up by
 * `bodyById`/`bodyByKey` like any other body, and enters a computation through `bodiesFor`/`bodyIdsFor`.
 */
export const OPT_IN_BODIES: readonly BodyDefinition[] = [
  { id: SE.SE_PHOLUS, key: 'pholus', name: 'Pholus', category: 'centaur' },
];

/** The one option every body-computing module takes to widen its body set; absent or false is the default set. */
export interface BodySetOptions {
  /** Also compute Pholus (#804). Off by default, so a caller that does not pass it sees exactly `BODIES`. */
  readonly includePholus?: boolean;
}

const WITH_OPT_IN: readonly BodyDefinition[] = BODIES.flatMap((body) =>
  body.key === 'chiron' ? [body, ...OPT_IN_BODIES] : [body],
);

/**
 * The bodies to compute for `options`: `BODIES` itself (the very same array) unless an opt-in body was requested,
 * in which case the opt-in bodies sit after Chiron, in chart-listing order. The shared seam of #804 — every
 * module that used to read `BODIES` for a computation reads this instead.
 */
export function bodiesFor(options?: BodySetOptions): readonly BodyDefinition[] {
  return options?.includePholus === true ? WITH_OPT_IN : BODIES;
}

/** The `BodyId`s of `bodiesFor(options)`, in the same order. */
export function bodyIdsFor(options?: BodySetOptions): readonly BodyId[] {
  return bodiesFor(options).map((body) => body.id);
}

const BY_ID = new Map<BodyId, BodyDefinition>(WITH_OPT_IN.map((body) => [body.id, body]));
const BY_KEY = new Map<string, BodyDefinition>(WITH_OPT_IN.map((body) => [body.key, body]));

export function bodyById(id: BodyId): BodyDefinition | undefined {
  return BY_ID.get(id);
}

export function bodyByKey(key: string): BodyDefinition | undefined {
  return BY_KEY.get(key);
}

/** The south node is always 180° from whichever north node was requested. */
export function southNode(northNodeLongitude: number): number {
  const value = (northNodeLongitude + 180) % 360;
  return value < 0 ? value + 360 : value;
}
