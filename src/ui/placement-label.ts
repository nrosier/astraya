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
/**
 * @module ui/placement-label
 * @purpose Turns a corpus key/placement (#428) into human-readable wording — e.g. `planet-in-house:sun:3` into "Sun in the 3rd house" — for the admin corpus screens' labels, search, and sort order.
 * @conventions Wording follows the interface locale (en/nl) and reuses the same body/sign/aspect names as every other screen (astro-names.messages.ts); pure functions, a key that doesn't parse is shown as-is rather than hidden; also supplies tier/tag/category explanatory text for the admin UI.
 * @exports ordinal, categoryLabel, placementLabel, labelForKey, placementSortKey, sortKeyForKey, compareSortKeys, categoryExplanation, tierLabel, tierExplanation, tagLabel, tagExplanation
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
  type CorpusTier,
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
    'composite-planet-in-sign': 'Composite planet in sign',
    'composite-planet-in-house': 'Composite planet in house',
    'composite-aspect-pair': 'Composite aspect between two planets',
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
    'composite-planet-in-sign': 'Composietplaneet in teken',
    'composite-planet-in-house': 'Composietplaneet in huis',
    'composite-aspect-pair': 'Composietaspect tussen twee planeten',
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
    case 'composite-planet-in-sign':
      return nl
        ? `Composiet ${body(placement.body)} in ${sign(placement.sign, locale)}`
        : `Composite ${body(placement.body)} in ${sign(placement.sign, locale)}`;
    case 'planet-in-house':
      return nl
        ? `${body(placement.body)} in het ${ordinal(placement.house, locale)} huis`
        : `${body(placement.body)} in the ${ordinal(placement.house, locale)} house`;
    case 'composite-planet-in-house':
      return nl
        ? `Composiet ${body(placement.body)} in het ${ordinal(placement.house, locale)} huis`
        : `Composite ${body(placement.body)} in the ${ordinal(placement.house, locale)} house`;
    case 'sign-on-cusp':
      return nl
        ? `${sign(placement.sign, locale)} op de cusp van het ${ordinal(placement.house, locale)} huis`
        : `${sign(placement.sign, locale)} on the cusp of the ${ordinal(placement.house, locale)} house`;
    case 'aspect-pair':
      return `${body(placement.bodyA)} ${aspect(placement.aspect, locale)} ${body(placement.bodyB)}`;
    case 'composite-aspect-pair':
      return nl
        ? `Composiet ${body(placement.bodyA)} ${aspect(placement.aspect, locale)} ${body(placement.bodyB)}`
        : `Composite ${body(placement.bodyA)} ${aspect(placement.aspect, locale)} ${body(placement.bodyB)}`;
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
    case 'composite-planet-in-sign':
      return [category, bodyOrder(placement.body), placement.sign];
    case 'planet-in-house':
    case 'composite-planet-in-house':
      return [category, bodyOrder(placement.body), placement.house];
    case 'sign-on-cusp':
      return [category, placement.sign, placement.house];
    case 'aspect-pair':
    case 'synastry-aspect':
    case 'composite-aspect-pair':
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

const CATEGORY_EXPLANATIONS: Readonly<Record<Locale, Readonly<Record<CorpusCategory, string>>>> = {
  en: {
    'planet-in-sign': 'How a planet expresses itself in the sign it stands in.',
    'planet-in-house': 'Which area of life a planet works in.',
    'sign-on-cusp': 'The tone of a life area, set by the sign on its house cusp.',
    'aspect-pair': 'How two planets in the same chart interact.',
    'transit-aspect': 'A passing planet touching a planet in the birth chart.',
    'synastry-aspect': "How one person's planet meets another person's planet.",
    'dignity-state': 'How comfortable a planet is in its sign (ruler, exalted, detriment, fall).',
    nakshatra: 'The Moon-mansion a planet falls in (Vedic).',
    pattern: 'An overall figure formed by several planets together.',
    'profected-house': 'The life area emphasised in a given year of life.',
    'astro-line': 'A planet line on the map and the effect of living along it.',
    'composite-planet-in-sign':
      'How a planet expresses itself in the sign it stands in, for the relationship or combination itself, not either person.',
    'composite-planet-in-house': 'Which area of the relationship or combination a planet works in.',
    'composite-aspect-pair': 'How two planets interact within the composite (relationship) chart.',
  },
  nl: {
    'planet-in-sign': 'Hoe een planeet zich uit in het teken waarin hij staat.',
    'planet-in-house': 'In welk levensgebied een planeet werkt.',
    'sign-on-cusp': 'De toon van een levensgebied, bepaald door het teken op de huiscusp.',
    'aspect-pair': 'Hoe twee planeten in dezelfde horoscoop samenwerken.',
    'transit-aspect': 'Een passerende planeet die een planeet in het geboortehoroscoop raakt.',
    'synastry-aspect': 'Hoe de planeet van de één de planeet van de ander ontmoet.',
    'dignity-state': 'Hoe goed een planeet zich thuis voelt in zijn teken (heerser, verhoging, schade, val).',
    nakshatra: 'Het maanhuis waarin een planeet staat (Vedisch).',
    pattern: 'Een totaalfiguur gevormd door meerdere planeten samen.',
    'profected-house': 'Het levensgebied dat in een bepaald levensjaar centraal staat.',
    'astro-line': 'Een planeetlijn op de kaart en wat het effect is van wonen langs die lijn.',
    'composite-planet-in-sign':
      'Hoe een planeet zich uit in het teken waarin hij staat, voor de relatie of combinatie zelf, niet voor een van beide personen.',
    'composite-planet-in-house': 'In welk gebied van de relatie of combinatie een planeet werkt.',
    'composite-aspect-pair': 'Hoe twee planeten samenwerken binnen de composietkaart (relatie).',
  },
};

export function categoryExplanation(category: CorpusCategory, locale: Locale): string {
  return CATEGORY_EXPLANATIONS[locale][category];
}

const TIER_TEXT: Readonly<Record<Locale, Readonly<Record<CorpusTier, { label: string; explanation: string }>>>> = {
  en: {
    core: { label: 'Core', explanation: 'Almost every report will want to say something about this.' },
    notable: { label: 'Notable', explanation: 'In between: worth mentioning, chosen by an editor.' },
    nuance: { label: 'Nuance', explanation: 'Fine detail that matters once the obvious has been said.' },
  },
  nl: {
    core: { label: 'Kern', explanation: 'Vrijwel elke duiding wil hier iets over zeggen.' },
    notable: { label: 'Opvallend', explanation: 'Tussenin: het noemen waard, door een redacteur gekozen.' },
    nuance: { label: 'Verfijning', explanation: 'Fijn detail dat telt als het voor de hand liggende gezegd is.' },
  },
};

export function tierLabel(tier: CorpusTier, locale: Locale): string {
  return TIER_TEXT[locale][tier].label;
}

export function tierExplanation(tier: CorpusTier, locale: Locale): string {
  return TIER_TEXT[locale][tier].explanation;
}

const TAG_TEXT: Readonly<Record<Locale, Readonly<Record<string, { label: string; explanation: string }>>>> = {
  en: {
    'improved-via-feedback-loop': {
      label: 'Revised after review',
      explanation: 'Rewritten by the automatic feedback loop after a quality review.',
    },
    ruler: { label: 'Ruler', explanation: 'The planet rules this sign (its own sign).' },
    exalted: { label: 'Exalted', explanation: 'The planet is exalted here (especially strong).' },
    detriment: { label: 'Detriment', explanation: 'The planet is in detriment here (opposite its own sign).' },
    fall: { label: 'Fall', explanation: 'The planet is in its fall here (opposite its exaltation).' },
  },
  nl: {
    'improved-via-feedback-loop': {
      label: 'Herzien na controle',
      explanation: 'Herschreven door de automatische feedbacklus na een kwaliteitscontrole.',
    },
    ruler: { label: 'Heerser', explanation: 'De planeet heerst over dit teken (eigen teken).' },
    exalted: { label: 'Verhoogd', explanation: 'De planeet is hier verhoogd (extra sterk).' },
    detriment: { label: 'Schade', explanation: 'De planeet staat hier in schade (tegenover zijn eigen teken).' },
    fall: { label: 'Val', explanation: 'De planeet staat hier in zijn val (tegenover zijn verhoging).' },
  },
};

/** A tag in words; an unknown tag is made readable (hyphens to spaces, capitalised) rather than shown raw. */
export function tagLabel(tag: string, locale: Locale): string {
  const known = TAG_TEXT[locale][tag]?.label;
  if (known !== undefined) return known;
  const spaced = tag.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function tagExplanation(tag: string, locale: Locale): string | undefined {
  return TAG_TEXT[locale][tag]?.explanation;
}
