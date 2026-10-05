/**
 * How a saved AI interpretation says what it is and what it was based on (#423), in the interface
 * language: "AI interpretation of the entire chart", "AI interpretation of Mars (natal)", "Local
 * interpretation of Sun in Gemini, Moon in the 3rd house".
 *
 * Every kind in `RESULT_KINDS` must have wording here in both languages — `test/result-basis.test.ts`
 * enforces it — so a new kind of AI interpretation is distinguishable in the history from the day it
 * ships. An entry saved before the basis was recorded says so instead of guessing.
 */
import { kindForMode, type ResultBasis, type ResultKind } from '../interpretation/result-basis.js';
import type { Locale } from '../interpretation/schema.js';
import { bodyDisplayName } from './astro-names.messages.js';
import { labelForKey } from './placement-label.js';

/** How many placements are named before "and N more". */
const MAX_NAMED_PLACEMENTS = 3;

interface Wording {
  /** The kind, as the lead of an entry: "AI interpretation" / "Local interpretation". */
  readonly kinds: Readonly<Record<ResultKind, string>>;
  readonly entireChart: string;
  readonly bothCharts: string;
  readonly notRecorded: string;
  readonly natal: string;
  readonly transit: string;
  readonly of: string;
  readonly and: (count: number) => string;
}

const WORDING: Readonly<Record<Locale, Wording>> = {
  en: {
    kinds: {
      placements: 'Local interpretation',
      'whole-chart': 'AI interpretation',
      focus: 'AI interpretation',
      relationship: 'AI pairing reading',
    },
    entireChart: 'the entire chart',
    bothCharts: 'both charts',
    notRecorded: 'basis not recorded',
    natal: 'natal',
    transit: 'transit',
    of: 'of',
    and: (count) => `and ${String(count)} more`,
  },
  nl: {
    kinds: {
      placements: 'Lokale interpretatie',
      'whole-chart': 'AI-interpretatie',
      focus: 'AI-interpretatie',
      relationship: 'AI-relatieduiding',
    },
    entireChart: 'de hele horoscoop',
    bothCharts: 'beide horoscopen',
    notRecorded: 'grondslag niet vastgelegd',
    natal: 'geboortehoroscoop',
    transit: 'transit',
    of: 'van',
    and: (count) => `en ${String(count)} meer`,
  },
};

/** What the basis is, without the kind: "the entire chart", "Mars (natal)", "Sun in Gemini, Moon in the 3rd house". */
export function basisLabel(basis: ResultBasis, locale: Locale): string {
  const words = WORDING[locale];
  switch (basis.kind) {
    case 'whole-chart':
      return words.entireChart;
    case 'focus':
      return `${bodyDisplayName(basis.body, locale)} (${basis.perspective === 'transit' ? words.transit : words.natal})`;
    case 'relationship':
      return words.bothCharts;
    case 'placements': {
      const named = basis.keys.slice(0, MAX_NAMED_PLACEMENTS).map((key) => labelForKey(key, locale));
      const rest = basis.keys.length - named.length;
      return rest > 0 ? `${named.join(', ')} ${words.and(rest)}` : named.join(', ');
    }
  }
}

/**
 * The type-and-basis phrase of one history entry: "AI interpretation of Mars (natal)". `kind` and
 * `basis` are what the server stored; an older entry has only its `mode`, which still names the kind.
 */
export function savedKindLabel(
  saved: { readonly mode: string; readonly kind?: ResultKind | null; readonly basis?: ResultBasis | null },
  locale: Locale,
): string {
  const words = WORDING[locale];
  const kind = saved.kind ?? kindForMode(saved.mode);
  if (kind === undefined) return saved.mode;
  const lead = words.kinds[kind];
  if (saved.basis === undefined || saved.basis === null) return `${lead}, ${words.notRecorded}`;
  return `${lead} ${words.of} ${basisLabel(saved.basis, locale)}`;
}

/** Just the kind's name ("AI interpretation"), for places that already show the basis separately. */
export function kindLabel(kind: ResultKind, locale: Locale): string {
  return WORDING[locale].kinds[kind];
}
