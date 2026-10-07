/**
 * Fallback composition (#59): a corpus entry is never guaranteed to exist for
 * every placement — today's corpus is empty (#55/#56 haven't landed), and
 * even a full ~1200-entry corpus won't cover every placement the exhaustive
 * cross-product below enumerates. `resolvePlacementText` guarantees non-empty
 * text either way: look the key up in the given corpus first, and if it
 * isn't there, mechanically compose a plain sentence from the same reference
 * data (`BODIES`, `SIGNS`, `ASPECTS`, `DIGNITY_STATES`) that already validates
 * a placement's fields (`schema.ts`).
 *
 * The fallback is deliberately plain and repetitive — it exists so a report
 * is never blank, not to read as hand-written prose. #55/#56's real entries
 * are what a report actually wants to show; this is what stands in for them
 * until they exist.
 *
 * Scoped to the same five categories #60's rule engine covers
 * (planet-in-sign, planet-in-house, sign-on-cusp, aspect-pair, dignity-state),
 * plus `transit-aspect` (#207) and `synastry-aspect` (#359), which reuse this
 * same fallback machinery for a different pair of roles (transiting/natal,
 * or this-chart/other-chart) rather than a same-chart pair. `profected-house`
 * and `astro-line` (#369) have cases since #427 wired the profections and
 * astrocartography screens to the corpus. `composite-planet-in-sign`/
 * `-planet-in-house`/`-aspect-pair` (#451) share their natal counterpart's case: the mechanical
 * fallback never says "you" either way, so there is nothing composite-specific for the fallback
 * sentence to get wrong — only the real corpus text (which does speak about the combination, not
 * an individual) needs a dedicated category. `nakshatra` and `pattern` are
 * reserved categories nothing produces yet, so they still throw: add real
 * cases here when something has a real caller to exercise them.
 *
 * Dutch terminology note: the twelve sign names, ten planet/luminary names
 * and five major-aspect names below are standard, unremarkable translations.
 * The minor-aspect names (semisextiel, halfvierkant, kwintiel, sesquikwadraat,
 * biquintiel) follow the same calque pattern Dutch astrological writing
 * generally uses for them, but — unlike everything else in this codebase —
 * they could not be cross-checked against an independent source before being
 * hardcoded here, because the web-search tool used for that check was
 * unavailable (repeated `400` errors) at the time this was written. Treat
 * them as good-faith placeholders worth a native-speaker or #63 review pass,
 * not as verified facts the way the rest of this file's content is.
 */
/**
 * @module interpretation/compose
 * @purpose Guarantees non-empty interpretation text for any placement by mechanically composing a plain sentence when the corpus has no entry for it.
 * @conventions Covers the same categories the rule engine and corpus schema define (planet-in-sign, planet-in-house, sign-on-cusp, aspect-pair, dignity-state, transit-aspect, synastry-aspect, profected-house, astro-line, and the composite-chart siblings); `nakshatra`/`pattern` are reserved and throw. Fallback text is deliberately plain/repetitive, never styled to look hand-written.
 * @exports SIGN_NAMES, BODY_NAMES, composeFallbackText, findCorpusEntry, resolvePlacementText
 */
import { bodyByKey } from '../astrology/bodies.ts';
import { aspectByKey } from '../astrology/aspects.ts';
import { SIGNS } from '../astrology/signs.ts';
import type { AcgAngle, CorpusEntry, CorpusPlacement, DignityState, Locale } from './schema.js';
import { placementKey } from './schema.ts';

type NameTable = Readonly<Record<string, string>>;

export const SIGN_NAMES: Readonly<Record<Locale, readonly string[]>> = {
  en: SIGNS.map((sign) => sign.name),
  nl: [
    'Ram',
    'Stier',
    'Tweelingen',
    'Kreeft',
    'Leeuw',
    'Maagd',
    'Weegschaal',
    'Schorpioen',
    'Boogschutter',
    'Steenbok',
    'Waterman',
    'Vissen',
  ],
};

export const BODY_NAMES: Readonly<Record<Locale, NameTable>> = {
  en: {
    sun: 'the Sun',
    moon: 'the Moon',
    mercury: 'Mercury',
    venus: 'Venus',
    mars: 'Mars',
    jupiter: 'Jupiter',
    saturn: 'Saturn',
    uranus: 'Uranus',
    neptune: 'Neptune',
    pluto: 'Pluto',
    meanNode: 'the Mean Node',
    trueNode: 'the True Node',
    meanLilith: 'Mean Lilith',
    osculatingLilith: 'Osculating Lilith',
    interpolatedLilith: 'Interpolated Lilith',
    chiron: 'Chiron',
    ceres: 'Ceres',
    pallas: 'Pallas',
    juno: 'Juno',
    vesta: 'Vesta',
  },
  nl: {
    sun: 'de Zon',
    moon: 'de Maan',
    mercury: 'Mercurius',
    venus: 'Venus',
    mars: 'Mars',
    jupiter: 'Jupiter',
    saturn: 'Saturnus',
    uranus: 'Uranus',
    neptune: 'Neptunus',
    pluto: 'Pluto',
    meanNode: 'de Gemiddelde Maansknoop',
    trueNode: 'de Ware Maansknoop',
    meanLilith: 'Gemiddelde Lilith',
    osculatingLilith: 'Osculerende Lilith',
    interpolatedLilith: 'Geïnterpoleerde Lilith',
    chiron: 'Chiron',
    ceres: 'Ceres',
    pallas: 'Pallas',
    juno: 'Juno',
    vesta: 'Vesta',
  },
};

const ASPECT_NAMES: Readonly<Record<Locale, NameTable>> = {
  en: {
    conjunction: 'conjunction',
    semisextile: 'semisextile',
    semisquare: 'semisquare',
    sextile: 'sextile',
    quintile: 'quintile',
    square: 'square',
    trine: 'trine',
    sesquiquadrate: 'sesquiquadrate',
    biquintile: 'biquintile',
    quincunx: 'quincunx',
    opposition: 'opposition',
  },
  nl: {
    conjunction: 'conjunctie',
    semisextile: 'semisextiel',
    semisquare: 'halfvierkant',
    sextile: 'sextiel',
    quintile: 'kwintiel',
    square: 'vierkant',
    trine: 'driehoek',
    sesquiquadrate: 'sesquikwadraat',
    biquintile: 'biquintiel',
    quincunx: 'quincunx',
    opposition: 'oppositie',
  },
};

/** Predicate phrases, not nouns — written to slot directly after "{Body} is/geeft ...". */
const DIGNITY_PREDICATES: Readonly<Record<Locale, Readonly<Record<DignityState, string>>>> = {
  en: {
    ruler: 'the ruler of the sign it occupies',
    exalted: 'exalted in the sign it occupies',
    detriment: 'in detriment in the sign it occupies',
    fall: 'in fall in the sign it occupies',
  },
  nl: {
    ruler: 'heerser over het teken waarin het staat',
    exalted: 'verheven in het teken waarin het staat',
    detriment: 'in ballingschap in het teken waarin het staat',
    fall: 'in val in het teken waarin het staat',
  },
};

function signName(index: number, locale: Locale): string {
  const name = SIGN_NAMES[locale][index];
  if (name === undefined) throw new Error(`sign index ${String(index)} out of range 0-11`);
  return name;
}

function bodyName(key: string, locale: Locale): string {
  const name = BODY_NAMES[locale][key];
  if (name !== undefined) return name;
  const body = bodyByKey(key);
  return body === undefined ? key : body.name;
}

/** `bodyName`, but without a leading definite article — for slotting after a possessive ("your", "jouw") where "your the Sun" would be wrong. */
function possessiveBodyName(key: string, locale: Locale): string {
  return bodyName(key, locale).replace(/^(the|de) /, '');
}

function aspectName(key: string, locale: Locale): string {
  const name = ASPECT_NAMES[locale][key];
  if (name !== undefined) return name;
  const aspect = aspectByKey(key);
  return aspect === undefined ? key : aspect.name;
}

/** Abbreviated ordinal suffix. Houses only ever run 1-12, but this is correct for any positive integer. */
function ordinal(n: number, locale: Locale): string {
  if (locale === 'nl') return `${String(n)}e`;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${String(n)}th`;
  switch (n % 10) {
    case 1:
      return `${String(n)}st`;
    case 2:
      return `${String(n)}nd`;
    case 3:
      return `${String(n)}rd`;
    default:
      return `${String(n)}th`;
  }
}

/** The angle an astrocartography line is drawn for, as a name (`astro-line:venus:MC` is Venus on the Midheaven line). */
const ACG_ANGLE_NAMES: Readonly<Record<Locale, Readonly<Record<AcgAngle, string>>>> = {
  en: { AC: 'Ascendant', DC: 'Descendant', MC: 'Midheaven', IC: 'Imum Coeli' },
  nl: { AC: 'Ascendant', DC: 'Descendant', MC: 'Medium Coeli', IC: 'Imum Coeli' },
};

function capitalize(text: string): string {
  const first = text.charAt(0);
  return first === '' ? text : first.toUpperCase() + text.slice(1);
}

/**
 * A plain, mechanically generated sentence for a placement — used only when
 * no corpus entry exists for it. Every branch is a pure function of names
 * already validated elsewhere (`schema.ts`), so it can never itself fail to
 * produce non-empty text for a well-formed placement.
 */
export function composeFallbackText(placement: CorpusPlacement, locale: Locale): string {
  switch (placement.category) {
    case 'planet-in-sign':
    case 'composite-planet-in-sign': {
      const body = capitalize(bodyName(placement.body, locale));
      const sign = signName(placement.sign, locale);
      return `${body} in ${sign}.`;
    }
    case 'planet-in-house':
    case 'composite-planet-in-house': {
      const body = capitalize(bodyName(placement.body, locale));
      const house = ordinal(placement.house, locale);
      return locale === 'nl' ? `${body} in het ${house} huis.` : `${body} in the ${house} house.`;
    }
    case 'sign-on-cusp': {
      const sign = capitalize(signName(placement.sign, locale));
      const house = ordinal(placement.house, locale);
      return locale === 'nl'
        ? `${sign} op de cusp van het ${house} huis.`
        : `${sign} on the cusp of the ${house} house.`;
    }
    case 'aspect-pair':
    case 'composite-aspect-pair': {
      const aspect = aspectName(placement.aspect, locale);
      const bodyA = bodyName(placement.bodyA, locale);
      const bodyB = bodyName(placement.bodyB, locale);
      return locale === 'nl'
        ? `${capitalize(aspect)} tussen ${bodyA} en ${bodyB}.`
        : `${capitalize(aspect)} between ${bodyA} and ${bodyB}.`;
    }
    case 'transit-aspect': {
      const aspect = aspectName(placement.aspect, locale);
      const transiting = bodyName(placement.transiting, locale);
      const natal = bodyName(placement.natal, locale);
      return locale === 'nl'
        ? `${capitalize(aspect)} tussen transiterende ${transiting} en radix ${natal}.`
        : `${capitalize(aspect)} between transiting ${transiting} and natal ${natal}.`;
    }
    case 'synastry-aspect': {
      const aspect = aspectName(placement.aspect, locale);
      const bodyA = possessiveBodyName(placement.bodyA, locale);
      const bodyB = possessiveBodyName(placement.bodyB, locale);
      return locale === 'nl'
        ? `${capitalize(aspect)} tussen jouw ${bodyA} en hun ${bodyB}.`
        : `${capitalize(aspect)} between your ${bodyA} and their ${bodyB}.`;
    }
    case 'dignity-state': {
      const body = capitalize(bodyName(placement.body, locale));
      const predicate = DIGNITY_PREDICATES[locale][placement.state];
      return `${body} is ${predicate}.`;
    }
    case 'profected-house': {
      const house = ordinal(placement.house, locale);
      return locale === 'nl'
        ? `Het ${house} huis is het geprofecteerde huis voor deze periode.`
        : `The ${house} house is the profected house for this period.`;
    }
    case 'astro-line': {
      const body = capitalize(bodyName(placement.body, locale));
      const angle = ACG_ANGLE_NAMES[locale][placement.angle];
      return locale === 'nl' ? `${body} op de ${angle}-lijn.` : `${body} on the ${angle} line.`;
    }
    case 'nakshatra':
    case 'pattern':
      throw new Error(`composeFallbackText: category "${placement.category}" is out of scope for #59 (see file doc)`);
  }
}

/**
 * The corpus entry matching `placement` in `locale`, if the corpus has one.
 * The same lookup `resolvePlacementText` uses internally, exposed on its own
 * so a caller that needs to tell corpus text apart from the mechanical
 * fallback — #62's provenance view — doesn't have to re-derive the key or
 * duplicate the lookup.
 */
export function findCorpusEntry(
  placement: CorpusPlacement,
  locale: Locale,
  corpus: readonly CorpusEntry[],
): CorpusEntry | undefined {
  const key = placementKey(placement);
  return corpus.find((candidate) => candidate.key === key && candidate.locale === locale);
}

/**
 * The text a report should show for `placement` in `locale`: a matching
 * corpus entry if one exists, otherwise `composeFallbackText`'s mechanical sentence.
 * This is the guarantee #59 asks for — never `""`, whatever the corpus
 * currently holds.
 */
export function resolvePlacementText(
  placement: CorpusPlacement,
  locale: Locale,
  corpus: readonly CorpusEntry[],
): string {
  const entry = findCorpusEntry(placement, locale, corpus);
  return entry !== undefined ? entry.text : composeFallbackText(placement, locale);
}
