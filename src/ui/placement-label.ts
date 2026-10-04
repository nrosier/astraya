/**
 * What a corpus entry *means*, in words, instead of its key (#428): `planet-in-house:sun:3` reads
 * "Sun in the 3rd house", `planet-in-sign:sun:2` reads "Sun in Gemini". The admin screens show this
 * as the main label and keep the key as secondary text, search it, and sort by it.
 *
 * The wording follows the interface language (en/nl) and uses the same body, sign and aspect names
 * as every other screen (`astro-names.messages.ts`). It states the key's zero-based sign index and
 * one-based house number in the form a reader expects: index 2 is Gemini, house 3 is the 3rd house.
 *
 * A directional category says whose side it is: a `synastry-aspect` is "your Mars square their
 * Moon", as the entry's text is written from the first planet's owner (#422, #427).
 *
 * Everything here is pure; a key that does not parse is shown as it is, never hidden.
 */
import { ASPECTS } from '../astrology/aspects.js';
import { BODIES } from '../astrology/bodies.js';
import { SIGNS } from '../astrology/signs.js';
import {
  ACG_ANGLES,
  CORPUS_CATEGORIES,
  DIGNITY_STATES,
  parsePlacementKey,
  validateKey,
  type CorpusCategory,
  type CorpusPlacement,
  type Locale,
} from '../interpretation/schema.js';
import { aspectDisplayName, bodyDisplayName, signDisplayName } from './astro-names.messages.js';

/** `3rd`, `11th`, `21st` in English; `3e` in Dutch. */
export function ordinal(n: number, locale: Locale): string {
  if (locale === 'nl') return `${String(n)}e`;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${String(n)}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${String(n)}${suffix}`;
}

const CATEGORY_LABELS: Readonly<Record<Locale, Readonly<Record<CorpusCategory, string>>>> = {
  en: {
    'planet-in-sign': 'Planet in sign',
    'planet-in-house': 'Planet in house',
    'sign-on-cusp': 'Sign on a house cusp',
    'aspect-pair': 'Aspect between two planets',
    'transit-aspect': 'Transit aspect',
    'synastry-aspect': 'Synastry aspect',
    'dignity-state': 'Essential dignity',
    nakshatra: 'Nakshatra',
    pattern: 'Chart pattern',
    'profected-house': 'Profected house',
    'astro-line': 'Astrocartography line',
  },
  nl: {
    'planet-in-sign': 'Planeet in teken',
    'planet-in-house': 'Planeet in huis',
    'sign-on-cusp': 'Teken op een huiscusp',
    'aspect-pair': 'Aspect tussen twee planeten',
    'transit-aspect': 'Transitaspect',
    'synastry-aspect': 'Synastrie-aspect',
    'dignity-state': 'Essentiële waardigheid',
    nakshatra: 'Nakshatra',
    pattern: 'Horoscoopfiguur',
    'profected-house': 'Geprofecteerd huis',
    'astro-line': 'Astrocartografielijn',
  },
};

const ANGLE_NAMES: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: { AC: 'Ascendant', DC: 'Descendant', MC: 'Midheaven', IC: 'Imum Coeli' },
  nl: { AC: 'Ascendant', DC: 'Descendant', MC: 'Medium Coeli', IC: 'Imum Coeli' },
};

export function categoryLabel(category: CorpusCategory, locale: Locale): string {
  return CATEGORY_LABELS[locale][category];
}

function sign(index: number, locale: Locale): string {
  return signDisplayName(SIGNS[((index % 12) + 12) % 12]?.name ?? '', locale);
}

function aspect(key: string, locale: Locale): string {
  return aspectDisplayName(key, locale).toLowerCase();
}

/** The meaning of a placement, in words. */
export function placementLabel(placement: CorpusPlacement, locale: Locale): string {
  const body = (key: string): string => bodyDisplayName(key, locale);
  const nl = locale === 'nl';
  switch (placement.category) {
    case 'planet-in-sign':
      return `${body(placement.body)} in ${sign(placement.sign, locale)}`;
    case 'planet-in-house':
      return nl
        ? `${body(placement.body)} in het ${ordinal(placement.house, locale)} huis`
        : `${body(placement.body)} in the ${ordinal(placement.house, locale)} house`;
    case 'sign-on-cusp':
      return nl
        ? `${sign(placement.sign, locale)} op de cusp van het ${ordinal(placement.house, locale)} huis`
        : `${sign(placement.sign, locale)} on the cusp of the ${ordinal(placement.house, locale)} house`;
    case 'aspect-pair':
      return `${body(placement.bodyA)} ${aspect(placement.aspect, locale)} ${body(placement.bodyB)}`;
    case 'transit-aspect':
      return nl
        ? `Transiterende ${body(placement.transiting)} ${aspect(placement.aspect, locale)} radix ${body(placement.natal)}`
        : `Transiting ${body(placement.transiting)} ${aspect(placement.aspect, locale)} natal ${body(placement.natal)}`;
    case 'synastry-aspect':
      return nl
        ? `Jouw ${body(placement.bodyA)} ${aspect(placement.aspect, locale)} hun ${body(placement.bodyB)}`
        : `Your ${body(placement.bodyA)} ${aspect(placement.aspect, locale)} their ${body(placement.bodyB)}`;
    case 'dignity-state': {
      const name = body(placement.body);
      if (nl) {
        return {
          ruler: `${name} in eigen teken (heerser)`,
          exalted: `${name} verheven`,
          detriment: `${name} in detriment`,
          fall: `${name} in val`,
        }[placement.state];
      }
      return {
        ruler: `${name} in its own sign (ruler)`,
        exalted: `${name} exalted`,
        detriment: `${name} in detriment`,
        fall: `${name} in fall`,
      }[placement.state];
    }
    case 'nakshatra':
      return `${body(placement.body)} in nakshatra ${String(placement.nakshatra)}`;
    case 'pattern':
      return `${CATEGORY_LABELS[locale].pattern}: ${placement.pattern.replace(/-/g, ' ')}`;
    case 'profected-house':
      return nl
        ? `Geprofecteerd ${ordinal(placement.house, locale)} huis`
        : `Profected ${ordinal(placement.house, locale)} house`;
    case 'astro-line': {
      const angle = ANGLE_NAMES[locale][placement.angle] ?? placement.angle;
      return nl ? `${body(placement.body)} op de ${angle}-lijn` : `${body(placement.body)} on the ${angle} line`;
    }
  }
}

/**
 * The meaning of a corpus key, or the key itself when it is not one the schema accepts. The strict
 * check comes first: `parsePlacementKey` alone reads sign 99 happily, and a wrong label is worse than the key.
 */
export function labelForKey(key: string, locale: Locale): string {
  const placement = validateKey(key).length === 0 ? parsePlacementKey(key) : undefined;
  return placement === undefined ? key : placementLabel(placement, locale);
}

const BODY_ORDER: ReadonlyMap<string, number> = new Map(BODIES.map((body, index) => [body.key, index]));
const ASPECT_ORDER: ReadonlyMap<string, number> = new Map(ASPECTS.map((a, index) => [a.key, index]));
const bodyOrder = (key: string): number => BODY_ORDER.get(key) ?? BODIES.length;
const aspectOrder = (key: string): number => ASPECT_ORDER.get(key) ?? ASPECTS.length;

/**
 * The order a reader expects, as a comparable list: category first, then planet in the app's own
 * planet order, then sign or house in numeric order (so house 2 comes before house 10, which an
 * alphabetical sort of the key gets wrong). A key the schema cannot read sorts last, by its text.
 */
export function placementSortKey(placement: CorpusPlacement): readonly (number | string)[] {
  const category = CORPUS_CATEGORIES.indexOf(placement.category);
  switch (placement.category) {
    case 'planet-in-sign':
      return [category, bodyOrder(placement.body), placement.sign];
    case 'planet-in-house':
      return [category, bodyOrder(placement.body), placement.house];
    case 'sign-on-cusp':
      return [category, placement.sign, placement.house];
    case 'aspect-pair':
    case 'synastry-aspect':
      return [category, bodyOrder(placement.bodyA), bodyOrder(placement.bodyB), aspectOrder(placement.aspect)];
    case 'transit-aspect':
      return [category, bodyOrder(placement.transiting), bodyOrder(placement.natal), aspectOrder(placement.aspect)];
    case 'dignity-state':
      return [category, bodyOrder(placement.body), DIGNITY_STATES.indexOf(placement.state)];
    case 'nakshatra':
      return [category, bodyOrder(placement.body), placement.nakshatra];
    case 'pattern':
      return [category, placement.pattern];
    case 'profected-house':
      return [category, placement.house];
    case 'astro-line':
      return [category, bodyOrder(placement.body), ACG_ANGLES.indexOf(placement.angle)];
  }
}

export function sortKeyForKey(key: string): readonly (number | string)[] {
  const placement = validateKey(key).length === 0 ? parsePlacementKey(key) : undefined;
  return placement === undefined ? [Number.MAX_SAFE_INTEGER, key] : placementSortKey(placement);
}

/** Orders two sort keys element by element: numbers numerically, text alphabetically, shorter first. */
export function compareSortKeys(a: readonly (number | string)[], b: readonly (number | string)[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const x = a[index];
    const y = b[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
}
