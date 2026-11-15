/**
 * Peregrine detection and almuten scoring (#27, #551).
 *
 * Classical essential-dignity scoring weights each of the five dignities a
 * planet can hold at a degree: 5 points for domicile rulership, 4 for
 * exaltation, 3 for its sect-appropriate triplicity rulership, 2 for its
 * bound (term), 1 for its face (decan). This 5/4/3/2/1 weighting is the one
 * most commonly attributed to Ibn Ezra's Almuten Figuris in modern
 * traditional-astrology secondary literature (e.g. summarized in Benjamin
 * Dykes' writing on the technique, and implemented identically by other
 * open tools such as DCCCXIII/astro's `almuten/figuris.go`) — this project
 * has not independently verified it against Ibn Ezra's own medieval text,
 * only against that convergent modern-secondary-source agreement, which is
 * worth noting explicitly rather than implying a primary-source citation
 * that was never actually checked. The same 5/4/3/2/1 weights for domicile,
 * exaltation, triplicity, term and face are, however, printed in Lilly's
 * "ready Table whereby to examine the Fortitudes and Debilities of the
 * Planets" (Christian Astrology, 1647, Book I, p. 115, read from the page
 * image; see docs/references/orb-conventions.references.json). That is a
 * strength-scoring table, not the almuten procedure, so it is a primary-source
 * confirmation of the weights and not of Ibn Ezra's use of them. The same
 * table prints the debilities: detriment −5 and fall −4 (Lilly, Book I, p. 115).
 * The almuten tally subtracts them (owner decision, #1609); the plain dignity
 * score does not. A planet that holds none of the five dignities at a given
 * degree is "peregrine" — traditionally read as lacking any foothold of
 * dignity, for better or worse depending on the planet's other conditions.
 * Peregrine is decided by the dignities alone: a planet in detriment or fall
 * can be peregrine too, and its debilities are not counted as a foothold.
 *
 * Only triplicity's sect-appropriate ruler counts (the day ruler in a day
 * chart, the night ruler in a night chart) — never the participating ruler,
 * which is not part of this scoring scheme even though `triplicity.ts`
 * tracks it for other purposes. Sect itself is not computed here: callers
 * who already have one pass it in (see `sect.ts`, #28).
 *
 * "Almuten of a point" is which of the seven traditional planets holds the
 * most dignity at one specific degree (e.g. the Ascendant). "Almuten
 * Figuris" extends that across several degrees at once ("vital points" —
 * classically the Ascendant, Sun, Moon, Part of Fortune's ruler and
 * prenatal syzygy) by summing each planet's score at every point and taking
 * the overall highest. This module implements only that essential-dignity
 * sum: the fuller classical Figuris algorithm also adds planetary-hour and
 * synodic-cycle bonuses that depend on machinery (planetary hours, prenatal
 * syzygy) this codebase doesn't otherwise compute, so those are deliberately
 * left out rather than approximated. Callers wanting the complete algorithm
 * supply their own bonus terms on top of what's returned here.
 *
 * Rulership and bounds each come in more than one scheme (see `dignities.ts`
 * and `bounds.ts`); both are threaded through as explicit, defaulted options
 * rather than hidden behind one hardcoded choice.
 */

/**
 * @module Almuten
 * @purpose Scores a planet's essential dignity at a point/degree and determines the Almuten (dignity winner) and Almuten Figuris across multiple vital points.
 * @conventions Classical five-dignity weighting (5 ruler, 4 exaltation, 3 sect-appropriate triplicity, 2 bound, 1 face); the almuten tally also subtracts detriment (−5) and fall (−4) per Lilly p. 115 (owner decision, #1609), while the plain dignity score does not; peregrine means no dignity held and is not affected by debilities; no almuten when the best score is not above 0; only the essential-dignity component of Almuten Figuris is implemented (no planetary-hour/syzygy bonuses); triplicity counts only the sect-appropriate ruler, not the participating ruler.
 * @exports essentialDignityScoreOf, almutenOf, almutenFigurisOf, pickAlmutens (@internal)
 */
import { bodyByKey } from './bodies.js';
import type { BodyId, Degrees } from '../ephemeris/types.js';
import type { BoundsScheme } from './bounds.js';
import { boundRulerOf } from './bounds.js';
import { faceRulerOf } from './decans.js';
import { essentialDignitiesFor, type RulershipChoice } from './rulership.js';
import type { Sect } from './sect.js';
import { triplicityRoleOf } from './triplicity.js';

function id(key: string): BodyId {
  const body = bodyByKey(key);
  if (!body) throw new Error(`unreachable: body key "${key}" is not in the canonical body set`);
  return body.id;
}

/** The seven traditional planets eligible to hold essential dignity, Chaldean order. */
const TRADITIONAL_PLANETS: readonly BodyId[] = [
  id('saturn'),
  id('jupiter'),
  id('mars'),
  id('sun'),
  id('venus'),
  id('mercury'),
  id('moon'),
];

const RULER_POINTS = 5;
const EXALTATION_POINTS = 4;
const TRIPLICITY_POINTS = 3;
const BOUND_POINTS = 2;
const FACE_POINTS = 1;
/** Detriment: the sign opposite one's own domicile. Lilly, Christian Astrology Book I, p. 115 (`lilly-i-fortitudes-table`); subtracted in the almuten tally per the owner's decision on #1609. */
const DETRIMENT_POINTS = -5;
/** Fall: the sign opposite one's exaltation. Lilly, Christian Astrology Book I, p. 115 (`lilly-i-fortitudes-table`); subtracted in the almuten tally per the owner's decision on #1609. */
const FALL_POINTS = -4;

export interface EssentialDignityScoreOptions {
  /** Whose rulers count (#426). The candidates stay the seven classical planets whatever this is: the almuten is a medieval technique, and the outer planets have no triplicity, bound or face. */
  readonly rulershipScheme?: RulershipChoice;
  readonly boundsScheme?: BoundsScheme;
  /** Subtract detriment and fall from `points` (the almuten tally, #1609). Off by default, so the plain dignity score stays positive. */
  readonly includeDebilities?: boolean;
}

export interface EssentialDignityScore {
  readonly body: BodyId;
  readonly ruler: boolean;
  readonly exalted: boolean;
  readonly triplicity: boolean;
  readonly bound: boolean;
  readonly face: boolean;
  readonly detriment: boolean;
  readonly fall: boolean;
  /** Sum of the five dignity weights for whichever dignities are held, plus detriment and fall when `includeDebilities` is on. */
  readonly points: number;
  /** True exactly when the body holds none of the five dignities (debilities do not count). */
  readonly peregrine: boolean;
}

/** How much essential dignity `body` holds at `longitude`, under the given sect and schemes. */
export function essentialDignityScoreOf(
  body: BodyId,
  longitude: Degrees,
  sect: Sect,
  options: EssentialDignityScoreOptions = {},
): EssentialDignityScore {
  const rulershipScheme = options.rulershipScheme ?? 'traditional';
  const boundsScheme = options.boundsScheme ?? 'egyptian';

  const dignities = essentialDignitiesFor(body, longitude, rulershipScheme);
  const triplicity = triplicityRoleOf(body, longitude) === sect;
  const bound = boundRulerOf(longitude, boundsScheme) === body;
  const face = faceRulerOf(longitude) === body;
  const detriment = dignities.detriment;
  const fall = dignities.fall;

  const dignityPoints =
    (dignities.ruler ? RULER_POINTS : 0) +
    (dignities.exalted ? EXALTATION_POINTS : 0) +
    (triplicity ? TRIPLICITY_POINTS : 0) +
    (bound ? BOUND_POINTS : 0) +
    (face ? FACE_POINTS : 0);
  const debilityPoints = options.includeDebilities ? (detriment ? DETRIMENT_POINTS : 0) + (fall ? FALL_POINTS : 0) : 0;

  const holdsDignity = dignities.ruler || dignities.exalted || triplicity || bound || face;

  return {
    body,
    ruler: dignities.ruler,
    exalted: dignities.exalted,
    triplicity,
    bound,
    face,
    detriment,
    fall,
    points: dignityPoints + debilityPoints,
    peregrine: !holdsDignity,
  };
}

export interface AlmutenResult {
  /** Every traditional planet's score, in `TRADITIONAL_PLANETS` (Chaldean) order. */
  readonly scores: readonly EssentialDignityScore[];
  /** The winning point total. */
  readonly points: number;
  /** Every planet that reached `points` (more than one entry on a tie). Empty when no planet scores above 0. */
  readonly almutens: readonly BodyId[];
}

/**
 * Picks the almuten(s) from a set of scores: every planet at the top total, or none when that total is not above 0.
 * @internal Exported so the no-almuten guard can be tested on hand-made scores; not a public entry point.
 */
export function pickAlmutens(scores: readonly EssentialDignityScore[]): AlmutenResult {
  const points = Math.max(...scores.map((s) => s.points));
  if (!(points > 0)) return { scores, points, almutens: [] };
  const almutens = scores.filter((s) => s.points === points).map((s) => s.body);
  return { scores, points, almutens };
}

/** Which of the seven traditional planets holds the most essential dignity at one degree, net of detriment and fall. */
export function almutenOf(longitude: Degrees, sect: Sect, options: EssentialDignityScoreOptions = {}): AlmutenResult {
  return pickAlmutens(
    TRADITIONAL_PLANETS.map((body) =>
      essentialDignityScoreOf(body, longitude, sect, { ...options, includeDebilities: true }),
    ),
  );
}

/**
 * Almuten Figuris (essential-dignity component only — see module docs): sums
 * each traditional planet's score across every vital point supplied, and
 * returns whichever planet's total is highest.
 */
export function almutenFigurisOf(
  vitalPoints: readonly Degrees[],
  sect: Sect,
  options: EssentialDignityScoreOptions = {},
): AlmutenResult {
  if (vitalPoints.length === 0) throw new RangeError('almutenFigurisOf requires at least one vital point');
  const scores = TRADITIONAL_PLANETS.map((body) => {
    const perPoint = vitalPoints.map((longitude) =>
      essentialDignityScoreOf(body, longitude, sect, { ...options, includeDebilities: true }),
    );
    const points = perPoint.reduce((sum, s) => sum + s.points, 0);
    const ruler = perPoint.some((s) => s.ruler);
    const exalted = perPoint.some((s) => s.exalted);
    const triplicity = perPoint.some((s) => s.triplicity);
    const bound = perPoint.some((s) => s.bound);
    const face = perPoint.some((s) => s.face);
    return {
      body,
      ruler,
      exalted,
      triplicity,
      bound,
      face,
      detriment: perPoint.some((s) => s.detriment),
      fall: perPoint.some((s) => s.fall),
      points,
      peregrine: !(ruler || exalted || triplicity || bound || face),
    };
  });
  return pickAlmutens(scores);
}
