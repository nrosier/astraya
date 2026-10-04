/**
 * Shared placement-space builder, extracted from generate-batch.mjs (#368) so
 * sample-validate-batch.mjs can sample the same restricted scope without
 * hand-rebuilding it — the exact duplication risk that made earlier /tmp
 * validation prototypes drift from what the real batch runner covers.
 */
import {
  buildSymbolismContext,
  planetSymbolism,
  signSymbolism,
  symbolismScopeFor,
} from '../../../src/interpretation/symbolism.ts';
import { BODIES } from '../../../src/astrology/bodies.ts';
import { SIGNS } from '../../../src/astrology/signs.ts';
import { ASPECTS } from '../../../src/astrology/aspects.ts';
import { detrimentRulerOf, exaltationRulerOf, fallRulerOf, rulerOf } from '../../../src/astrology/dignities.ts';

export { buildSymbolismContext, symbolismScopeFor, BODIES, SIGNS, ASPECTS };

export const HOUSES = Array.from({ length: 12 }, (_, i) => i + 1);
export const SIGN_INDICES = SIGNS.map((s) => s.index);
export const DIGNITY_STATES = ['ruler', 'exalted', 'detriment', 'fall'];

/** Every computed body — planet-in-sign/-house and aspect-pair cover all of them. */
export const CORE_BODY_KEYS = BODIES.map((b) => b.key);
/** The 7 bodies with a defined traditional rulership: they can hold all four dignity states. */
export const TRADITIONAL_RULER_KEYS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
/**
 * The 3 outer planets that modern rulership gives a sign (#426): Uranus (Aquarius), Neptune (Pisces),
 * Pluto (Scorpio). No tradition gives them an exaltation or fall, so they can hold only these two
 * states (detriment: Uranus in Leo, Neptune in Virgo, Pluto in Taurus) — generating an exalted or
 * fall entry for them would be inventing astrology.
 */
export const MODERN_OUTER_RULER_KEYS = ['uranus', 'neptune', 'pluto'];
export const MODERN_OUTER_DIGNITY_STATES = ['ruler', 'detriment'];
/**
 * The complete, closed set of bodies the app ever computes astrocartography lines for — the union
 * of `TRADITIONAL_ACG_BODY_IDS` and `EXTENDED_ACG_BODY_IDS` (`src/domain/astrocartography.ts`),
 * by key rather than numeric `BodyId` (#369's `astro-line` category, like every other corpus
 * category, keys off `BodyDefinition.key`). Hardcoded rather than imported+mapped: this file
 * already hardcodes `TRADITIONAL_RULER_KEYS` as the same kind of small, stable closed list.
 */
export const ACG_BODY_KEYS = [
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
];
/** The four angular house cusps astrocartography lines are drawn relative to — mirrors `schema.ts`'s `ACG_ANGLES`. */
export const ACG_ANGLES = ['AC', 'DC', 'MC', 'IC'];

// #395: meanNode/trueNode and meanLilith/osculatingLilith/interpolatedLilith are each multiple
// calculation methods for one real point (the Moon's node, its apogee), not distinct bodies —
// BodyDefinition.category is what distinguishes "several ways to compute the same point" from
// "two different real bodies that happen to share a category" (e.g. two distinct asteroids).
// Two variants of the same point are always near-conjunct by construction, so an "aspect-pair"/
// "synastry-aspect" entry between them would carry no independent astrological meaning regardless
// of how it's worded — scoped out of generation entirely, the same kind of scope decision #369
// made for other categories, rather than left for the generator to write something hollow.
const SAME_POINT_VARIANT_CATEGORIES = new Set(['node', 'lilith']);
function isSamePointVariantPair(bodyAKey, bodyBKey) {
  const a = BODIES.find((b) => b.key === bodyAKey);
  const b = BODIES.find((b) => b.key === bodyBKey);
  return (
    a !== undefined && b !== undefined && a.category === b.category && SAME_POINT_VARIANT_CATEGORIES.has(a.category)
  );
}

export function corePairs() {
  const keys = [...CORE_BODY_KEYS].sort();
  const pairs = [];
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      if (isSamePointVariantPair(keys[i], keys[j])) continue;
      pairs.push([keys[i], keys[j]]);
    }
  }
  return pairs;
}

/** The full restricted placement scope, in a fixed, deterministic order — mirrors generate-batch.mjs. */
export function buildPlacements() {
  const placements = [];
  for (const body of CORE_BODY_KEYS) {
    for (const sign of SIGN_INDICES) placements.push({ category: 'planet-in-sign', body, sign });
  }
  for (const body of CORE_BODY_KEYS) {
    for (const house of HOUSES) placements.push({ category: 'planet-in-house', body, house });
  }
  for (const sign of SIGN_INDICES) {
    for (const house of HOUSES) placements.push({ category: 'sign-on-cusp', sign, house });
  }
  for (const aspect of ASPECTS) {
    for (const [bodyA, bodyB] of corePairs())
      placements.push({ category: 'aspect-pair', aspect: aspect.key, bodyA, bodyB });
  }
  for (const aspect of ASPECTS) {
    for (const [bodyA, bodyB] of corePairs())
      placements.push({ category: 'synastry-aspect', aspect: aspect.key, bodyA, bodyB });
  }
  for (const body of TRADITIONAL_RULER_KEYS) {
    for (const state of DIGNITY_STATES) placements.push({ category: 'dignity-state', body, state });
  }
  for (const body of MODERN_OUTER_RULER_KEYS) {
    for (const state of MODERN_OUTER_DIGNITY_STATES) placements.push({ category: 'dignity-state', body, state });
  }
  for (const house of HOUSES) placements.push({ category: 'profected-house', house });
  for (const body of ACG_BODY_KEYS) {
    for (const angle of ACG_ANGLES) placements.push({ category: 'astro-line', body, angle });
  }
  return placements;
}

// What a dignity state means, in the words a person would use (#427): "Sun in ruler" says neither
// which sign nor what the state is, and "in exalted" is not English.
const DIGNITY_WORDS = {
  ruler: 'in domicile (it rules the sign it is in)',
  exalted: 'in exaltation',
  detriment: 'in detriment (in the sign opposite the one it rules)',
  fall: 'in its fall (in the sign opposite its exaltation)',
};

// Where each dignity falls, derived from the app's own tables so it cannot drift from them (#437). The judge knows
// the sign (Jupiter is exalted only in Cancer) and wants the entry to carry that sign's character; the generator was
// only ever told "in exaltation", so it wrote the generic version. A ruler or detriment can cover two signs.
const SIGN_INDICES_ALL = Array.from({ length: 12 }, (_, sign) => sign);
function dignitySigns(bodyKey, state) {
  const body = BODIES.find((b) => b.key === bodyKey);
  if (body === undefined) return [];
  const matches = (sign) => {
    switch (state) {
      case 'ruler':
        return rulerOf(sign, 'traditional') === body.id || rulerOf(sign, 'modern') === body.id;
      case 'detriment':
        return detrimentRulerOf(sign, 'traditional') === body.id || detrimentRulerOf(sign, 'modern') === body.id;
      case 'exalted':
        return exaltationRulerOf(sign) === body.id;
      case 'fall':
        return fallRulerOf(sign) === body.id;
      default:
        return false;
    }
  };
  return SIGN_INDICES_ALL.filter(matches).map((sign) => SIGNS[sign]?.name ?? String(sign));
}

const DIGNITY_RELATION = {
  ruler: 'at home and expresses itself freely',
  exalted: 'honoured and finds its fullest expression',
  detriment: 'placed opposite the sign it rules and works against the grain',
  fall: 'placed opposite the sign of its exaltation and is at its least comfortable',
};

/** What a dignity-state entry's generator is told on top of the state: the sign(s) it is about, for the generator only. */
function dignityHint(placement) {
  const signs = dignitySigns(placement.body, placement.state);
  const relation = DIGNITY_RELATION[placement.state];
  if (signs.length === 0 || relation === undefined) return '';
  const names = signs.join(' and ');
  const body = BODIES.find((b) => b.key === placement.body)?.name ?? placement.body;
  return ` — this is about ${body} in ${names}, where it is ${relation}. Let the specific interplay between ${body}'s function and the nature of ${names} come through${signs.length > 1 ? ' (write what the signs share, not one of them)' : ''}, without naming the sign${signs.length > 1 ? 's' : ''} or the planet.`;
}

// Houses and angles, in the generator's description (#437): the judge reads "house 8" as shared resources, depth and
// transformation, and "Midheaven" as public standing, but the generator was only given the number or the code.
const HOUSE_GLOSS = [
  'the self, body and how one meets the world',
  'resources, possessions and what one values',
  'communication, learning, siblings and the near environment',
  'home, family, roots and the private foundation',
  'creativity, pleasure, romance and self-expression',
  'daily work, routines, health and service',
  'partnership and the people one meets as an equal',
  'shared resources, intimacy, crisis and transformation',
  'beliefs, higher learning, travel and meaning',
  'vocation, public standing and reputation',
  'community, friends and hopes for the future',
  'solitude, the unconscious, retreat and what is hidden',
];
const houseGloss = (house) => HOUSE_GLOSS[house - 1] ?? '';
const ANGLE_GLOSS = {
  AC: 'identity, presence and how one comes across',
  DC: 'relationships and the people one is drawn to',
  MC: 'career, reputation and public life',
  IC: 'home, roots and the private base',
};

// The angle a line is drawn for, as a name rather than the raw `AC`/`MC` code.
const ANGLE_WORDS = { AC: 'Ascendant', DC: 'Descendant', MC: 'Midheaven', IC: 'Imum Coeli' };

export function placementDescription(placement) {
  const bodyName = (key) => BODIES.find((b) => b.key === key)?.name ?? key;
  switch (placement.category) {
    case 'planet-in-sign':
      return `${bodyName(placement.body)} in ${SIGNS[placement.sign]?.name ?? String(placement.sign)} (${planetSymbolism(placement.body)?.core ?? ''} / ${signSymbolism(placement.sign)?.core ?? ''})`;
    case 'planet-in-house':
      return `${bodyName(placement.body)} in house ${String(placement.house)} (${planetSymbolism(placement.body)?.core ?? ''} / house of ${houseGloss(placement.house)})`;
    case 'sign-on-cusp':
      return `${SIGNS[placement.sign]?.name ?? String(placement.sign)} on the cusp of house ${String(placement.house)} (${signSymbolism(placement.sign)?.core ?? ''} / house of ${houseGloss(placement.house)})`;
    case 'aspect-pair':
      return `${bodyName(placement.bodyA)} ${placement.aspect} ${bodyName(placement.bodyB)}`;
    case 'synastry-aspect':
      // The entry is written from the first body's owner (alphabetical order, #427): "your … their …".
      // Which body is whose is spelled out (#437): the judge found a dozen Dutch entries that gave each person the
      // other's body, and the vaguer "written from the first person's side" left that to the model.
      return `synastry: one person's ${bodyName(placement.bodyA)} ${placement.aspect} the other person's ${bodyName(placement.bodyB)} (written from the first person's side). The ${bodyName(placement.bodyA)} is YOURS ("you", "your") and the ${bodyName(placement.bodyB)} belongs to the OTHER person ("they", "their"). Do not swap them, and describe the dynamic between the two people, not one person's inner conflict.`;
    case 'dignity-state': {
      return `${bodyName(placement.body)} ${DIGNITY_WORDS[placement.state] ?? placement.state}${dignityHint(placement)}`;
    }
    case 'profected-house':
      return `house ${String(placement.house)} profected (annual/monthly profection) — the house of ${houseGloss(placement.house)}`;
    case 'astro-line':
      return `${bodyName(placement.body)} on the ${ANGLE_WORDS[placement.angle] ?? placement.angle} astrocartography line (${planetSymbolism(placement.body)?.core ?? ''} / the angle of ${ANGLE_GLOSS[placement.angle] ?? ''})`;
    default:
      throw new Error(`unreachable: unhandled category "${placement.category}"`);
  }
}

/** Renders a placement's own computed facts as plain English — the same ground truth verify-batch.mjs's judge gets. */
export function factsDescription(placement) {
  const bodyName = (key) => BODIES.find((b) => b.key === key)?.name ?? key;
  const aspectName = (key) => ASPECTS.find((a) => a.key === key)?.name ?? key;
  switch (placement.category) {
    case 'planet-in-sign':
      return `${bodyName(placement.body)} in ${SIGNS[placement.sign]?.name ?? String(placement.sign)}`;
    case 'planet-in-house':
      return `${bodyName(placement.body)} in house ${String(placement.house)}`;
    case 'sign-on-cusp':
      return `${SIGNS[placement.sign]?.name ?? String(placement.sign)} on the cusp of house ${String(placement.house)}`;
    case 'aspect-pair':
      return `${bodyName(placement.bodyA)} ${aspectName(placement.aspect)} ${bodyName(placement.bodyB)}`;
    case 'synastry-aspect':
      return `this chart's ${bodyName(placement.bodyA)} ${aspectName(placement.aspect)} the other chart's ${bodyName(placement.bodyB)}`;
    case 'dignity-state': {
      // The judge is told the sign(s) the generator was told (#437): without them it rejected a text that rightly
      // drew on one of two detriment signs as "not supported by the facts".
      const signs = dignitySigns(placement.body, placement.state);
      return `${bodyName(placement.body)} ${DIGNITY_WORDS[placement.state] ?? placement.state}${signs.length === 0 ? '' : `, in ${signs.join(' or ')}`}`;
    }
    case 'profected-house':
      return `house ${String(placement.house)} is the profected house for this period`;
    case 'astro-line':
      return `${bodyName(placement.body)} on the ${ANGLE_WORDS[placement.angle] ?? placement.angle} astrocartography line`;
    default:
      throw new Error(`this tool does not (yet) support category "${placement.category}"`);
  }
}
