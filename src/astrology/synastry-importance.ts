/**
 * Which contacts between two charts matter most (#422, Phase 2a): a ranking for the Synastry
 * aspect table, so the few contacts a relationship reading rests on come first and the long tail
 * of wide, minor-planet contacts does not bury them.
 *
 * It is a ranking heuristic stated plainly, not a tradition: it orders what the aspect search
 * found, it never adds or removes a contact, and the reader can still sort by any column. The
 * convention, in the order synastry practice usually weighs things:
 *
 * - **The bodies.** The luminaries (Sun, Moon) carry the most weight, then the personal planets
 *   (Mercury, Venus, Mars) — where attraction, communication and friction are felt — then the
 *   social planets (Jupiter, Saturn), then Uranus, Neptune and Pluto, then the nodes, Chiron,
 *   Lilith and the asteroids. A contact's weight is the product of its two bodies' weights, so
 *   Sun–Moon outranks Pluto–Ceres by a wide margin and one weak body cannot be rescued by a strong one.
 * - **The aspect.** Conjunction, square and opposition 1.0; trine and sextile 0.7; the minor
 *   aspects 0.4. (Hard aspects are the ones that produce friction and attraction; the easy ones
 *   support, and tend to be taken for granted.)
 * - **The orb.** `1 − orb / limit`, where `limit` is the orb allowed for that pair under the
 *   configuration the contact was found with, so an exact contact scores in full and one at the
 *   edge of what was found scores nothing.
 *
 * The Ascendant and Midheaven are not bodies and the aspect search is body to body, so contacts to
 * the angles are not ranked here; they would outrank everything but the luminaries.
 */

/**
 * @module SynastryImportance
 * @purpose Ranks synastry (cross-chart) aspect contacts by importance for display ordering, without altering what the aspect search found.
 * @conventions Weighting follows synastry practice: luminaries weighted highest, then personal/social/outer planets, then minor points; aspect weight is hard (1.0) > soft (0.7) > minor (0.4); orb factor is 1 − orb/limit; angles (Ascendant/Midheaven) are not ranked since the aspect search is body-to-body only.
 * @exports bodyWeight, synastryAspectWeight, synastryImportance, rankSynastryAspects
 */
import { DEFAULT_ORB_CONFIG, orbFor, type Aspect, type OrbConfig } from './aspects.js';
import { bodyById, type BodyCategory } from './bodies.js';

const LUMINARY_WEIGHT = 1;
const PERSONAL_WEIGHT = 0.8;
const SOCIAL_WEIGHT = 0.6;
const OUTER_WEIGHT = 0.45;
const MINOR_POINT_WEIGHT = 0.3;

const PERSONAL = new Set(['mercury', 'venus', 'mars']);
const SOCIAL = new Set(['jupiter', 'saturn']);
const OUTER = new Set(['uranus', 'neptune', 'pluto']);

const HARD_ASPECT_WEIGHT = 1;
const SOFT_ASPECT_WEIGHT = 0.7;
const MINOR_ASPECT_WEIGHT = 0.4;
const HARD = new Set(['conjunction', 'square', 'opposition']);
const SOFT = new Set(['sextile', 'trine']);

/** How much a body counts in a contact: see the file doc. */
export function bodyWeight(bodyKey: string, category: BodyCategory): number {
  if (category === 'luminary') return LUMINARY_WEIGHT;
  if (PERSONAL.has(bodyKey)) return PERSONAL_WEIGHT;
  if (SOCIAL.has(bodyKey)) return SOCIAL_WEIGHT;
  if (OUTER.has(bodyKey)) return OUTER_WEIGHT;
  return MINOR_POINT_WEIGHT;
}

export function synastryAspectWeight(aspectKey: string): number {
  if (HARD.has(aspectKey)) return HARD_ASPECT_WEIGHT;
  if (SOFT.has(aspectKey)) return SOFT_ASPECT_WEIGHT;
  return MINOR_ASPECT_WEIGHT;
}

/** How important one contact is, in [0, 1]. Higher is more important; 0 only at the edge of its orb. */
export function synastryImportance(aspect: Aspect, config: OrbConfig = DEFAULT_ORB_CONFIG): number {
  const a = bodyById(aspect.bodyA);
  const b = bodyById(aspect.bodyB);
  if (a === undefined || b === undefined) return 0;
  const limit = orbFor(aspect.aspect.key, a.category, b.category, config);
  const orbFactor = limit > 0 ? Math.max(0, 1 - aspect.orb / limit) : 0;
  return (
    bodyWeight(a.key, a.category) * bodyWeight(b.key, b.category) * synastryAspectWeight(aspect.aspect.key) * orbFactor
  );
}

export interface RankedAspect {
  readonly aspect: Aspect;
  /** `synastryImportance`, kept so a screen can show it. */
  readonly importance: number;
}

/** The contacts most important first, each with its score; ties keep their input order. */
export function rankSynastryAspects(
  aspects: readonly Aspect[],
  config: OrbConfig = DEFAULT_ORB_CONFIG,
): readonly RankedAspect[] {
  return aspects
    .map((aspect, index) => ({ aspect, index, importance: synastryImportance(aspect, config) }))
    .sort((x, y) => y.importance - x.importance || x.index - y.index)
    .map(({ aspect, importance }) => ({ aspect, importance }));
}
