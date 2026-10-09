/**
 * Interpretation corpus schema (#53): the single source of truth for both the
 * AI Studio generator's `responseSchema` (#56) and this app's own runtime
 * validation (`loader.ts`). A corpus entry's `key` is always derived from a
 * `CorpusPlacement` by `placementKey`, never hand-typed, so the generator, the
 * lint/dedupe passes (#57/#58) and the rule engine (#60) all agree on an
 * entry's identity without re-deriving it independently.
 *
 * `category` is deliberately not a separate field on `CorpusEntry` — it is
 * always the key's first segment, recoverable with `categoryOfKey`. Keeping
 * one encoding of "what this entry is about" avoids a `category` field ever
 * silently drifting from its own key.
 *
 * Placement fields are validated against the real astrology reference data
 * (`BODIES`, `SIGNS`, `ASPECTS`, `NAKSHATRAS`) rather than accepted as
 * arbitrary strings, so a typo'd body or aspect key fails validation instead
 * of silently never matching any chart.
 *
 * KEY REFERENCE (#427) — one place for every category's shape. Numbers are plain integers:
 * a SIGN is a zero-based index (0 = Aries … 11 = Pisces); a HOUSE is one-based (1–12); so
 * `planet-in-sign:sun:2` is the Sun in Gemini and `planet-in-house:sun:2` is the Sun in the 2nd
 * house — same shape, different meaning, which is why `src/ui/placement-label.ts` (`labelForKey`)
 * puts the meaning in words wherever a key is shown to a person. Bodies are `BodyDefinition.key`s
 * (`sun`, `meanNode`…), aspects are `ASPECTS` keys (`square`…).
 *
 *   category          shape                                  example                           order of the two bodies
 *   planet-in-sign    planet-in-sign:<body>:<sign>           planet-in-sign:sun:2              —
 *   planet-in-house   planet-in-house:<body>:<house>         planet-in-house:sun:3             —
 *   sign-on-cusp      sign-on-cusp:<sign>:<house>            sign-on-cusp:2:3                  — (sign first, then house)
 *   aspect-pair       aspect-pair:<aspect>:<a>:<b>           aspect-pair:square:mars:saturn    alphabetical
 *   transit-aspect    transit-aspect:<aspect>:<tr>:<natal>   transit-aspect:trine:mars:sun      by role: transiting, then natal
 *   synastry-aspect   synastry-aspect:<aspect>:<a>:<b>       synastry-aspect:square:mars:moon  alphabetical, one entry per pair
 *   dignity-state     dignity-state:<body>:<state>           dignity-state:sun:ruler           —
 *   nakshatra         nakshatra:<body>:<index>               nakshatra:moon:3                  — (reserved, no entries)
 *   pattern           pattern:<kebab-case-name>              pattern:bucket                    — (reserved, no entries)
 *   profected-house   profected-house:<house>                profected-house:7                 —
 *   astro-line        astro-line:<body>:<angle>              astro-line:venus:MC               —
 *   composite-planet-in-sign   composite-planet-in-sign:<body>:<sign>   composite-planet-in-sign:sun:2    —
 *   composite-planet-in-house  composite-planet-in-house:<body>:<house> composite-planet-in-house:sun:3   —
 *   composite-aspect-pair      composite-aspect-pair:<aspect>:<a>:<b>   composite-aspect-pair:square:mars:saturn  alphabetical
 *   degree-symbol              degree-symbol:<degree>                   degree-symbol:1                   — (degree is 1-360, floor(longitude)+1)
 *
 * Ordering conventions, stated once: an `aspect-pair` and a `synastry-aspect` are stored ONCE per
 * unordered pair, with the bodies in alphabetical order (the symmetric aspect needs one entry, not
 * two). A `synastry-aspect` text is written from the FIRST body's owner — "your Mars … their Moon"
 * for `…:mars:moon` — so a screen that has the pair the other way round looks up the same entry and
 * says whose side it speaks from (`src/ui/synastry-text.ts`). A `transit-aspect` is ordered by role,
 * not alphabetically. Everything else has one body or none.
 *
 * Angle vocabulary (#427): the corpus's `astro-line` keys use the uppercase `AC`/`DC`/`MC`/`IC`;
 * everywhere else a chart angle is a lowercase point key — `asc`/`dsc`/`mc`/`ic` (the focus payload,
 * `FocusAngle`) — and a screen shows a name from `astro-names`. `ACG_ANGLE_POINT_KEYS` is the one
 * mapping between the two. The corpus keeps its uppercase keys because renaming them would change
 * every override and the generator's batches for no reader-visible gain.
 *
 * `nakshatra` and `pattern` are reserved: the schema accepts them but no entry, screen or
 * generator uses them yet. `test/interpretation-key-reference.test.ts` fails if any category's shape
 * above changes, so this table cannot drift from `placementKey`.
 *
 * `composite-planet-in-sign`/`composite-planet-in-house`/`composite-aspect-pair` (#451) are
 * composite-chart siblings of the three natal categories with the same shape and ordering —
 * same reason `synastry-aspect` is its own category rather than a qualified `aspect-pair`: a
 * composite's placements describe the relationship/combination itself, not an individual's own
 * traits, so the generated text needs its own framing, which means its own category (the corpus
 * loader has no "same text, different voice" mechanism). `sign-on-cusp` and `dignity-state` have
 * no composite sibling: #451 only asked for these three, and neither reads as personal in the
 * same way (a house cusp's sign and a planet's essential dignity are facts about the chart's
 * own structure, not a trait attributed to "you").
 *
 * `degree-symbol` (#405) is the one category with no `body` field at all: a Sabian-style
 * traditional image/signification attached to an exact ecliptic degree (1-360, global index =
 * `floor(longitude)+1`), independent of which body — or none, for the Ascendant/Midheaven —
 * happens to occupy it. That attachment is decided at display time by whichever screen reads the
 * entry, not at generation time, which is also why it is the one category generated with its own
 * voice/length/tier policy rather than the shared disposition one (`tools/corpus-gen/lib/
 * prompt.mjs`'s `buildDegreeSymbolSystemInstruction`/`buildDegreeSymbolUserContent`, not
 * `buildSystemInstruction`/`buildUserContent`) — see that module's own header for why.
 */
/**
 * @module interpretation/schema
 * @purpose Single source of truth for the interpretation corpus's shape — the key format for every placement category, the response schema for the AI generator, and this app's own runtime validation.
 * @conventions `category` is always the key's first segment (via categoryOfKey), never a separate field, so it can't drift from the key. Placement fields are validated against real astrology reference data (BODIES, SIGNS, ASPECTS, NAKSHATRAS), not accepted as arbitrary strings. SIGN is a zero-based index (0=Aries), HOUSE is one-based (1-12). aspect-pair/synastry-aspect/composite-aspect-pair store one entry per unordered pair with bodies alphabetical; transit-aspect is ordered by role (transiting, then natal). `nakshatra`/`pattern` are reserved categories with no entries yet. test/interpretation-key-reference.test.ts pins this table against placementKey.
 * @exports CORPUS_CATEGORIES, CorpusCategory, ACG_ANGLES, AcgAngle, ACG_ANGLE_POINT_KEYS, CORPUS_TIERS, CorpusTier, CORPUS_LOCALES, Locale, DIGNITY_STATES, DignityState, dignityState, CorpusPlacement, placementKey, categoryOfKey, parsePlacementKey, CorpusProvenanceSource, CorpusProvenance, CorpusEntry, CORPUS_ENTRY_RESPONSE_SCHEMA, CorpusValidationIssue, CorpusValidationResult, validateKey, validateCorpusEntries
 */
import { bodyByKey } from '../astrology/bodies.ts';
import { aspectByKey } from '../astrology/aspects.ts';
import { SIGNS } from '../astrology/signs.ts';
import { NAKSHATRAS } from '../astrology/nakshatras.ts';
import type { EssentialDignities } from '../astrology/dignities.js';

export const CORPUS_CATEGORIES = [
  'planet-in-sign',
  'planet-in-house',
  'sign-on-cusp',
  'aspect-pair',
  'transit-aspect',
  'synastry-aspect',
  'dignity-state',
  'nakshatra',
  'pattern',
  'profected-house',
  'astro-line',
  'composite-planet-in-sign',
  'composite-planet-in-house',
  'composite-aspect-pair',
  'degree-symbol',
] as const;
export type CorpusCategory = (typeof CORPUS_CATEGORIES)[number];

/** The four angular house cusps a natal chart's astrocartography lines are drawn relative to (`src/astrology/astrocartography.ts`). */
export const ACG_ANGLES = ['AC', 'DC', 'MC', 'IC'] as const;
export type AcgAngle = (typeof ACG_ANGLES)[number];

/** The lowercase point key (`asc`, `mc`, …) each corpus angle corresponds to — see the angle vocabulary in the header. */
export const ACG_ANGLE_POINT_KEYS: Readonly<Record<AcgAngle, 'asc' | 'dsc' | 'mc' | 'ic'>> = {
  AC: 'asc',
  DC: 'dsc',
  MC: 'mc',
  IC: 'ic',
};

/**
 * Editorial importance, assigned by whoever writes or reviews the entry —
 * not the same thing as the rule engine's computed salience (#60), which
 * also weighs dignity, sect and angularity. `tier` is one input a rule can
 * weigh; it is not itself the ranking. `core` marks the placements almost
 * every report will want to say something about; `nuance` marks deep-cut
 * detail that only matters once the obvious things have been said.
 */
export const CORPUS_TIERS = ['core', 'notable', 'nuance'] as const;
export type CorpusTier = (typeof CORPUS_TIERS)[number];

export const CORPUS_LOCALES = ['en', 'nl'] as const;
export type Locale = (typeof CORPUS_LOCALES)[number];

/**
 * A body has at most one of these true under a given rulership scheme
 * (`essentialDignities`, #25) — this is that state, not a separate taxonomy
 * invented for the corpus.
 */
export const DIGNITY_STATES = ['ruler', 'exalted', 'detriment', 'fall'] as const;
export type DignityState = (typeof DIGNITY_STATES)[number];

/** Derives the single dignity state an entry should key off, if any is true. */
export function dignityState(dignities: EssentialDignities): DignityState | undefined {
  if (dignities.ruler) return 'ruler';
  if (dignities.exalted) return 'exalted';
  if (dignities.detriment) return 'detriment';
  if (dignities.fall) return 'fall';
  return undefined;
}

/**
 * What one entry is about. `body`/`bodyA`/`bodyB` are `BodyDefinition.key`
 * values (e.g. `"sun"`), never numeric `BodyId` — a corpus entry is authored
 * content, keyed the way a human (or #56's generator) names a placement.
 *
 * `pattern` is a free-form kebab-case key rather than a closed enum: today
 * only `jonesShapeOf` (#35) actually classifies a whole-chart pattern (its
 * seven shapes), but "pattern" is meant to also cover detectors this repo
 * doesn't have yet (grand trine, T-square, yod — M10 territory), so the
 * schema doesn't hard-code today's detector as the category's ceiling.
 *
 * `transit-aspect` (#207) is deliberately its own category rather than a
 * qualified `aspect-pair`: an `aspect-pair` is symmetric (its two bodies are
 * in the same chart, so `canonicalPair` alphabetizes them and
 * `validatePlacementFields` enforces that order), but a transit aspect's two
 * roles are not interchangeable — `transiting` is always the moving body at
 * the moment in question, `natal` is always the fixed body in the reference
 * chart, and swapping them would describe a different event. `transiting`
 * and `natal` may even be the same body key (e.g. transiting Saturn aspecting
 * natal Saturn, a Saturn return) — nothing here alphabetizes or forbids that.
 *
 * `synastry-aspect` is `aspect-pair`'s cross-chart sibling: stored ONCE per unordered pair, with
 * the bodies in alphabetical order (`canonicalPair`), exactly like `aspect-pair`. Its text is
 * written from the first body's owner ("your Mars … their Moon" for `…:mars:moon`); a caller that
 * holds the pair the other way round looks up the same entry and says whose side it speaks from
 * (#422, `src/ui/synastry-text.ts`). Storing both directions would double 2,046 entries to say the
 * same thing from the other side, so the schema does not (#427).
 */
export type CorpusPlacement =
  | { readonly category: 'planet-in-sign'; readonly body: string; readonly sign: number }
  | { readonly category: 'planet-in-house'; readonly body: string; readonly house: number }
  | { readonly category: 'sign-on-cusp'; readonly sign: number; readonly house: number }
  | { readonly category: 'aspect-pair'; readonly aspect: string; readonly bodyA: string; readonly bodyB: string }
  | {
      readonly category: 'transit-aspect';
      readonly aspect: string;
      readonly transiting: string;
      readonly natal: string;
    }
  | {
      readonly category: 'synastry-aspect';
      readonly aspect: string;
      readonly bodyA: string;
      readonly bodyB: string;
    }
  | { readonly category: 'dignity-state'; readonly body: string; readonly state: DignityState }
  | { readonly category: 'nakshatra'; readonly body: string; readonly nakshatra: number }
  | { readonly category: 'pattern'; readonly pattern: string }
  | { readonly category: 'profected-house'; readonly house: number }
  | { readonly category: 'astro-line'; readonly body: string; readonly angle: AcgAngle }
  | { readonly category: 'composite-planet-in-sign'; readonly body: string; readonly sign: number }
  | { readonly category: 'composite-planet-in-house'; readonly body: string; readonly house: number }
  | {
      readonly category: 'composite-aspect-pair';
      readonly aspect: string;
      readonly bodyA: string;
      readonly bodyB: string;
    }
  | { readonly category: 'degree-symbol'; readonly degree: number };

const PATTERN_KEY_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Canonical, deterministic string encoding of a placement — the entry's `key`. */
export function placementKey(placement: CorpusPlacement): string {
  switch (placement.category) {
    case 'planet-in-sign':
      return `planet-in-sign:${placement.body}:${String(placement.sign)}`;
    case 'planet-in-house':
      return `planet-in-house:${placement.body}:${String(placement.house)}`;
    case 'sign-on-cusp':
      return `sign-on-cusp:${String(placement.sign)}:${String(placement.house)}`;
    case 'aspect-pair': {
      const [bodyA, bodyB] = canonicalPair(placement.bodyA, placement.bodyB);
      return `aspect-pair:${placement.aspect}:${bodyA}:${bodyB}`;
    }
    case 'transit-aspect':
      return `transit-aspect:${placement.aspect}:${placement.transiting}:${placement.natal}`;
    case 'synastry-aspect': {
      const [bodyA, bodyB] = canonicalPair(placement.bodyA, placement.bodyB);
      return `synastry-aspect:${placement.aspect}:${bodyA}:${bodyB}`;
    }
    case 'dignity-state':
      return `dignity-state:${placement.body}:${placement.state}`;
    case 'nakshatra':
      return `nakshatra:${placement.body}:${String(placement.nakshatra)}`;
    case 'pattern':
      return `pattern:${placement.pattern}`;
    case 'profected-house':
      return `profected-house:${String(placement.house)}`;
    case 'astro-line':
      return `astro-line:${placement.body}:${placement.angle}`;
    case 'composite-planet-in-sign':
      return `composite-planet-in-sign:${placement.body}:${String(placement.sign)}`;
    case 'composite-planet-in-house':
      return `composite-planet-in-house:${placement.body}:${String(placement.house)}`;
    case 'composite-aspect-pair': {
      const [bodyA, bodyB] = canonicalPair(placement.bodyA, placement.bodyB);
      return `composite-aspect-pair:${placement.aspect}:${bodyA}:${bodyB}`;
    }
    case 'degree-symbol':
      return `degree-symbol:${String(placement.degree)}`;
  }
}

/** Alphabetical order — an aspect pair has no inherent direction, so this is the one canonical order. */
function canonicalPair(bodyA: string, bodyB: string): readonly [string, string] {
  return bodyA <= bodyB ? [bodyA, bodyB] : [bodyB, bodyA];
}

/** The category a key encodes, without parsing the rest of it. */
export function categoryOfKey(key: string): CorpusCategory | undefined {
  const prefix = key.split(':', 1)[0];
  return (CORPUS_CATEGORIES as readonly string[]).includes(prefix ?? '') ? (prefix as CorpusCategory) : undefined;
}

/** Parses a key back into a structured placement, e.g. for looking up display glyphs (#62). */
export function parsePlacementKey(key: string): CorpusPlacement | undefined {
  const parts = key.split(':');
  const [category, ...rest] = parts;
  switch (category) {
    case 'planet-in-sign': {
      const [body, sign] = rest;
      if (body === undefined || sign === undefined) return undefined;
      return { category, body, sign: Number(sign) };
    }
    case 'planet-in-house': {
      const [body, house] = rest;
      if (body === undefined || house === undefined) return undefined;
      return { category, body, house: Number(house) };
    }
    case 'sign-on-cusp': {
      const [sign, house] = rest;
      if (sign === undefined || house === undefined) return undefined;
      return { category, sign: Number(sign), house: Number(house) };
    }
    case 'aspect-pair': {
      const [aspect, bodyA, bodyB] = rest;
      if (aspect === undefined || bodyA === undefined || bodyB === undefined) return undefined;
      return { category, aspect, bodyA, bodyB };
    }
    case 'transit-aspect': {
      const [aspect, transiting, natal] = rest;
      if (aspect === undefined || transiting === undefined || natal === undefined) return undefined;
      return { category, aspect, transiting, natal };
    }
    case 'synastry-aspect': {
      const [aspect, bodyA, bodyB] = rest;
      if (aspect === undefined || bodyA === undefined || bodyB === undefined) return undefined;
      return { category, aspect, bodyA, bodyB };
    }
    case 'dignity-state': {
      const [body, state] = rest;
      if (body === undefined || !isDignityState(state)) return undefined;
      return { category, body, state };
    }
    case 'nakshatra': {
      const [body, nakshatra] = rest;
      if (body === undefined || nakshatra === undefined) return undefined;
      return { category, body, nakshatra: Number(nakshatra) };
    }
    case 'pattern': {
      const pattern = rest.join(':');
      if (pattern === '') return undefined;
      return { category, pattern };
    }
    case 'profected-house': {
      const [house] = rest;
      if (house === undefined) return undefined;
      return { category, house: Number(house) };
    }
    case 'astro-line': {
      const [body, angle] = rest;
      if (body === undefined || !isAcgAngle(angle)) return undefined;
      return { category, body, angle };
    }
    case 'composite-planet-in-sign': {
      const [body, sign] = rest;
      if (body === undefined || sign === undefined) return undefined;
      return { category, body, sign: Number(sign) };
    }
    case 'composite-planet-in-house': {
      const [body, house] = rest;
      if (body === undefined || house === undefined) return undefined;
      return { category, body, house: Number(house) };
    }
    case 'composite-aspect-pair': {
      const [aspect, bodyA, bodyB] = rest;
      if (aspect === undefined || bodyA === undefined || bodyB === undefined) return undefined;
      return { category, aspect, bodyA, bodyB };
    }
    case 'degree-symbol': {
      const [degree] = rest;
      if (degree === undefined) return undefined;
      return { category, degree: Number(degree) };
    }
    default:
      return undefined;
  }
}

function isDignityState(value: string | undefined): value is DignityState {
  return (DIGNITY_STATES as readonly string[]).includes(value ?? '');
}

function isAcgAngle(value: string | undefined): value is AcgAngle {
  return (ACG_ANGLES as readonly string[]).includes(value ?? '');
}

export type CorpusProvenanceSource = 'hand-written' | 'generated';

export interface CorpusProvenance {
  readonly source: CorpusProvenanceSource;
  /** Set when `source` is `"generated"`, e.g. `"gemini-2.5-pro"`. */
  readonly model?: string;
  /** Identifies which generator prompt produced this entry, e.g. `"corpus-generator-v1"`. Set when `source` is `"generated"`. */
  readonly promptVersion?: string;
  /** ISO 8601 date. Set when `source` is `"generated"`. */
  readonly generatedAt?: string;
  /** Set once #63's human review has covered this entry. */
  readonly reviewedBy?: string;
  /** ISO 8601 date. */
  readonly reviewedAt?: string;
}

export interface CorpusEntry {
  readonly key: string;
  readonly locale: Locale;
  readonly text: string;
  readonly tier: CorpusTier;
  readonly tags: readonly string[];
  readonly provenance: CorpusProvenance;
  /**
   * Marks one of the "gold-standard exemplars" #56's generator injects into
   * every request. See `validateProvenance` for what provenance an anchor
   * requires.
   */
  readonly anchor?: boolean;
}

/**
 * The fields #56's generator asks the model to fill. `key`, `locale` and
 * `provenance` are assigned by the generation pipeline itself, from the
 * placement it is generating for — the model is never asked to invent an
 * entry's identity or its own provenance.
 */
export const CORPUS_ENTRY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    tier: { type: 'string', enum: CORPUS_TIERS },
  },
  required: ['text', 'tier'],
} as const;

export interface CorpusValidationIssue {
  readonly index: number;
  readonly message: string;
}

export type CorpusValidationResult =
  | { readonly ok: true; readonly entries: readonly CorpusEntry[] }
  | { readonly ok: false; readonly issues: readonly CorpusValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validatePlacementFields(placement: CorpusPlacement): string[] {
  const errors: string[] = [];
  const checkBody = (body: string, label: string): void => {
    if (bodyByKey(body) === undefined) errors.push(`unknown body key "${body}" (${label})`);
  };
  const checkSign = (sign: number, label: string): void => {
    if (!Number.isInteger(sign) || sign < 0 || sign >= SIGNS.length) {
      errors.push(`sign index ${String(sign)} out of range 0-${String(SIGNS.length - 1)} (${label})`);
    }
  };
  const checkHouse = (house: number, label: string): void => {
    if (!Number.isInteger(house) || house < 1 || house > 12) {
      errors.push(`house ${String(house)} out of range 1-12 (${label})`);
    }
  };

  switch (placement.category) {
    case 'planet-in-sign':
      checkBody(placement.body, 'body');
      checkSign(placement.sign, 'sign');
      break;
    case 'planet-in-house':
      checkBody(placement.body, 'body');
      checkHouse(placement.house, 'house');
      break;
    case 'sign-on-cusp':
      checkSign(placement.sign, 'sign');
      checkHouse(placement.house, 'house');
      break;
    case 'aspect-pair':
      if (aspectByKey(placement.aspect) === undefined) errors.push(`unknown aspect key "${placement.aspect}"`);
      checkBody(placement.bodyA, 'bodyA');
      checkBody(placement.bodyB, 'bodyB');
      if (placement.bodyA === placement.bodyB) errors.push(`aspect-pair bodyA and bodyB are both "${placement.bodyA}"`);
      else if (placement.bodyA > placement.bodyB) {
        errors.push(
          `aspect-pair bodies must be in alphabetical order — got "${placement.bodyA}", "${placement.bodyB}"`,
        );
      }
      break;
    case 'transit-aspect':
      if (aspectByKey(placement.aspect) === undefined) errors.push(`unknown aspect key "${placement.aspect}"`);
      checkBody(placement.transiting, 'transiting');
      checkBody(placement.natal, 'natal');
      break;
    case 'synastry-aspect':
      if (aspectByKey(placement.aspect) === undefined) errors.push(`unknown aspect key "${placement.aspect}"`);
      checkBody(placement.bodyA, 'bodyA');
      checkBody(placement.bodyB, 'bodyB');
      if (placement.bodyA > placement.bodyB) {
        errors.push(
          `synastry-aspect bodies must be in alphabetical order — got "${placement.bodyA}", "${placement.bodyB}"`,
        );
      }
      break;
    case 'dignity-state':
      checkBody(placement.body, 'body');
      break;
    case 'nakshatra':
      checkBody(placement.body, 'body');
      if (
        !Number.isInteger(placement.nakshatra) ||
        placement.nakshatra < 0 ||
        placement.nakshatra >= NAKSHATRAS.length
      ) {
        errors.push(`nakshatra index ${String(placement.nakshatra)} out of range 0-${String(NAKSHATRAS.length - 1)}`);
      }
      break;
    case 'pattern':
      if (!PATTERN_KEY_RE.test(placement.pattern)) {
        errors.push(`pattern key "${placement.pattern}" is not lowercase kebab-case`);
      }
      break;
    case 'profected-house':
      checkHouse(placement.house, 'house');
      break;
    case 'astro-line':
      checkBody(placement.body, 'body');
      if (!(ACG_ANGLES as readonly string[]).includes(placement.angle)) {
        errors.push(`unknown astro-line angle "${placement.angle}"`);
      }
      break;
    case 'composite-planet-in-sign':
      checkBody(placement.body, 'body');
      checkSign(placement.sign, 'sign');
      break;
    case 'composite-planet-in-house':
      checkBody(placement.body, 'body');
      checkHouse(placement.house, 'house');
      break;
    case 'composite-aspect-pair':
      if (aspectByKey(placement.aspect) === undefined) errors.push(`unknown aspect key "${placement.aspect}"`);
      checkBody(placement.bodyA, 'bodyA');
      checkBody(placement.bodyB, 'bodyB');
      if (placement.bodyA === placement.bodyB) {
        errors.push(`composite-aspect-pair bodyA and bodyB are both "${placement.bodyA}"`);
      } else if (placement.bodyA > placement.bodyB) {
        errors.push(
          `composite-aspect-pair bodies must be in alphabetical order — got "${placement.bodyA}", "${placement.bodyB}"`,
        );
      }
      break;
    case 'degree-symbol':
      if (!Number.isInteger(placement.degree) || placement.degree < 1 || placement.degree > 360) {
        errors.push(`degree ${String(placement.degree)} out of range 1-360`);
      }
      break;
  }
  return errors;
}

/**
 * Re-derives the placement encoded by `key` and checks it's actually
 * well-formed: not just the right shape (`parsePlacementKey`'s job) but a
 * `body`/`aspect` that's actually in the closed reference set and a
 * `sign`/`house`/`pattern` in range — the check a caller needs before
 * treating `key` as trusted enough to echo into user-facing text or a model
 * prompt (see `server/interpretation-routes.ts`, which re-resolves each of a
 * request's `placementKeys` against this server's own corpus and must not
 * let an attacker-chosen `body`/`aspect` string reach the model unchecked).
 */
export function validateKey(key: string): string[] {
  const placement = parsePlacementKey(key);
  if (placement === undefined) return [`key "${key}" does not parse as a known category`];
  const errors = validatePlacementFields(placement);
  const canonical = placementKey(placement);
  if (canonical !== key) errors.push(`key "${key}" is not canonical — expected "${canonical}"`);
  return errors;
}

function validateProvenance(value: unknown): string[] {
  if (!isRecord(value)) return ['provenance must be an object'];
  const errors: string[] = [];
  const source = value.source;
  if (source !== 'hand-written' && source !== 'generated') {
    errors.push(`provenance.source must be "hand-written" or "generated", got ${JSON.stringify(source)}`);
  }
  for (const field of ['model', 'promptVersion', 'generatedAt', 'reviewedBy', 'reviewedAt']) {
    const fieldValue = value[field];
    if (fieldValue !== undefined && typeof fieldValue !== 'string') {
      errors.push(`provenance.${field} must be a string if present`);
    }
  }
  return errors;
}

/**
 * An anchor's provenance must show a human stands behind the exact words:
 * either it was hand-written, or it was generated and has since been
 * reviewed (`reviewedBy`/`reviewedAt` both set) — the same fields #63's
 * review pass already uses to mark generated text as checked.
 */
function isAcceptableAnchorProvenance(provenance: CorpusProvenance): boolean {
  if (provenance.source === 'hand-written') return true;
  return provenance.reviewedBy !== undefined && provenance.reviewedAt !== undefined;
}

/** Validates one raw entry's shape and placement-key correctness, without checking cross-locale parity. */
export function validateCorpusEntries(raw: readonly unknown[]): CorpusValidationResult {
  const issues: CorpusValidationIssue[] = [];
  const entries: CorpusEntry[] = [];
  const seenKeys = new Set<string>();

  raw.forEach((item, index) => {
    const report = (message: string): void => {
      issues.push({ index, message });
    };
    if (!isRecord(item)) {
      report('entry must be an object');
      return;
    }
    const { key, locale, text, tier, tags, provenance, persona, anchor } = item;
    if (typeof key !== 'string') {
      report('key must be a string');
      return;
    }
    for (const error of validateKey(key)) report(error);
    // The advisor voices were removed (#429): an entry still carrying one is stale data, not a variant.
    if (persona !== undefined)
      report('persona is no longer supported: an entry is just a placement and a language (#429)');
    if (seenKeys.has(key)) report(`duplicate key "${key}"`);
    seenKeys.add(key);

    if (!(CORPUS_LOCALES as readonly unknown[]).includes(locale))
      report(`locale must be one of ${CORPUS_LOCALES.join(', ')}`);
    if (typeof text !== 'string' || text.trim() === '') report('text must be a non-empty string');
    if (!(CORPUS_TIERS as readonly unknown[]).includes(tier)) report(`tier must be one of ${CORPUS_TIERS.join(', ')}`);
    if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string'))
      report('tags must be an array of strings');
    for (const error of validateProvenance(provenance)) report(error);

    if (anchor !== undefined) {
      if (typeof anchor !== 'boolean') report('anchor must be a boolean if present');
      else if (anchor) {
        if (isRecord(provenance) && !isAcceptableAnchorProvenance(provenance as unknown as CorpusProvenance)) {
          report('anchor entries must be hand-written, or generated and reviewed (reviewedBy + reviewedAt set)');
        }
      }
    }

    const hasErrorsForThisEntry = issues.some((issue) => issue.index === index);
    if (!hasErrorsForThisEntry) {
      entries.push({
        key,
        locale: locale as Locale,
        text: text as string,
        tier: tier as CorpusTier,
        tags: tags as readonly string[],
        provenance: provenance as CorpusProvenance,
        ...(anchor !== undefined ? { anchor: anchor as boolean } : {}),
      });
    }
  });

  return issues.length === 0 ? { ok: true, entries } : { ok: false, issues };
}
