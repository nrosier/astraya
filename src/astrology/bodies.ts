/**
 * The canonical set of bodies Astraya computes positions for (#17).
 *
 * This is the single place that decides "what is a body" for the rest of the
 * app — chart rendering, aspects, dignities and progressions all iterate this
 * list rather than each keeping their own. Three of the entries are not
 * physical bodies at all: the lunar nodes and the three "Lilith" points are
 * orbital elements of the Moon's path, not things with their own gravity.
 * Swiss Ephemeris computes the nodes as the mean node and the true (osculating)
 * node, and the lunar apogee ("Black Moon Lilith") under three models: the mean
 * apogee of the averaged lunar orbit, the osculating apogee of the
 * instantaneous orbital ellipse, and the interpolated ("natural") apogee, which
 * smooths away the osculating apogee's spurious oscillation (Swiss Ephemeris
 * general documentation, the chapter on the lunar node and apogee; #869).
 * Hence three SE ids for Lilith rather than one, and why none of these points
 * can be checked against JPL Horizons the way a real body can: there is nothing
 * independent to check against, since the model *is* the definition.
 *
 * Which points Astraya lists, and that it shows all three Lilith models and
 * both nodes for the user to choose from, is Astraya's own convention; no held
 * astrological text prescribes the set (owner decision on #869, 2026-11-24).
 */

/**
 * @module Bodies
 * @purpose Defines the canonical set of bodies (luminaries, planets, nodes, Lilith variants, Chiron, main-belt asteroids) Astraya computes positions for, plus the opt-in set (Pholus, #804) that is computed only on request.
 * @conventions Order matches traditional chart-listing order, not SE numeric ids; the lunar nodes (mean, true) and three Lilith variants (mean, osculating, interpolated apogee) are orbital elements rather than physical bodies, defined by Swiss Ephemeris's models (Swiss Ephemeris general documentation, lunar node and apogee), so none can be checked against JPL Horizons. The set of points listed is Astraya's convention (#869).
 * @exports BODIES, OPT_IN_BODIES, HELIOCENTRIC_ONLY_BODIES, BodySetOptions, bodiesFor, bodyIdsFor, bodyById, bodyByKey, southNode
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
 * Bodies only the heliocentric chart computes (#1407): the Earth, which takes the Sun's place there. Swiss Ephemeris
 * gives it a position only with the heliocentric flag, so it is never in `BODIES` or `bodiesFor`; it is known to
 * `bodyById`/`bodyByKey` so the heliocentric chart's tables and wheel can name and draw it.
 */
export const HELIOCENTRIC_ONLY_BODIES: readonly BodyDefinition[] = [
  { id: SE.SE_EARTH, key: 'earth', name: 'Earth', category: 'planet' },
];

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

const KNOWN: readonly BodyDefinition[] = [...WITH_OPT_IN, ...HELIOCENTRIC_ONLY_BODIES];
const BY_ID = new Map<BodyId, BodyDefinition>(KNOWN.map((body) => [body.id, body]));
const BY_KEY = new Map<string, BodyDefinition>(KNOWN.map((body) => [body.key, body]));

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
