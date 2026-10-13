/**
 * Named, versioned traditional scheme bundles (#549): one coherent choice of bounds table and
 * orb profile instead of letting a user mix settings "no historical practitioner would combine"
 * (the audit's own phrasing). A pure selector, never a second computation path — the five
 * dignity-table modules, `reception.ts`, and `almuten.ts` still take explicit parameters and
 * never know a scheme exists; a scheme bundle is just a named, immutable combination of what
 * those parameters should be.
 *
 * Mechanically, this project implements exactly two bounds tables (`bounds.ts`'s `BoundsScheme`:
 * Egyptian and Ptolemaic) and three orb profiles (`orb-profiles.ts`). That is a genuinely
 * limited axis to differentiate three named historical periods along — the mapping below is
 * this project's own practical choice, not a settled scholarly consensus. One claim is made with
 * real confidence: William Lilly's Christian Astrology reproduces Ptolemy's own bound table
 * (distinct from the Egyptian/Dorothean one), which is why the Renaissance-Lilly bundle below
 * uses `'ptolemaic'`. The other two bundles' choices (which bounds table the earlier Hellenistic
 * and medieval Arabic/Persian traditions used, and which orb width best fits each) are this
 * project's own reasonable-but-not-independently-verified defaults, not a specific citation —
 * said plainly rather than implying more certainty than this change actually checked.
 */
/**
 * @module astrology/calculation-scheme
 * @purpose Named, versioned bundles of bounds table + orb profile (+ traditional rulership), so switching one named scheme changes several related settings atomically.
 * @conventions Each bundle is immutable once published — a correction creates a new id/version rather than editing one in place, matching `chart/calculation-profiles.ts`'s and `orb-profiles.ts`'s own convention. Rulership is always `'traditional'` for every named bundle: the almuten/dignity/reception techniques these bundles configure are medieval/traditional techniques, and a scheme choosing modern rulers would contradict itself.
 * @exports CalculationSchemeId, CALCULATION_SCHEME_IDS, CalculationScheme, CALCULATION_SCHEMES, matchCalculationScheme
 */
import type { BoundsScheme } from './bounds.js';
import type { OrbProfileId } from './orb-profiles.js';

export type CalculationSchemeId = 'hellenistic-v1' | 'medieval-arabic-v1' | 'renaissance-lilly-v1';

export const CALCULATION_SCHEME_IDS: readonly CalculationSchemeId[] = [
  'hellenistic-v1',
  'medieval-arabic-v1',
  'renaissance-lilly-v1',
];

export interface CalculationScheme {
  readonly id: CalculationSchemeId;
  readonly name: string;
  readonly description: string;
  /** Always `'traditional'` — see the module's own doc comment. */
  readonly rulershipScheme: 'traditional';
  readonly boundsScheme: BoundsScheme;
  readonly orbProfileId: OrbProfileId;
}

export const CALCULATION_SCHEMES: Readonly<Record<CalculationSchemeId, CalculationScheme>> = {
  'hellenistic-v1': {
    id: 'hellenistic-v1',
    name: 'Hellenistic',
    description:
      'Egyptian bounds (the older table, predating Ptolemy’s own proposal), standard orbs, traditional rulers.',
    rulershipScheme: 'traditional',
    boundsScheme: 'egyptian',
    orbProfileId: 'standard-v1',
  },
  'medieval-arabic-v1': {
    id: 'medieval-arabic-v1',
    name: 'Medieval Arabic',
    description: 'Egyptian bounds, tight orbs, traditional rulers.',
    rulershipScheme: 'traditional',
    boundsScheme: 'egyptian',
    orbProfileId: 'tight-v1',
  },
  'renaissance-lilly-v1': {
    id: 'renaissance-lilly-v1',
    name: 'Renaissance (Lilly)',
    description:
      'Ptolemaic bounds — Christian Astrology reproduces Ptolemy’s own bound table, distinct from the Egyptian one — wide orbs, traditional rulers.',
    rulershipScheme: 'traditional',
    boundsScheme: 'ptolemaic',
    orbProfileId: 'wide-v1',
  },
};

/** Which named scheme a given (boundsScheme, orbProfileId) pair matches exactly, or `undefined` for "Custom" — the same convention `orb-profiles.ts`'s `matchOrbProfile` and `chart/calculation-profiles.ts`'s `matchCalculationProfile` use. */
export function matchCalculationScheme(
  boundsScheme: BoundsScheme,
  orbProfileId: OrbProfileId,
): CalculationSchemeId | undefined {
  return CALCULATION_SCHEME_IDS.find((id) => {
    const scheme = CALCULATION_SCHEMES[id];
    return scheme.boundsScheme === boundsScheme && scheme.orbProfileId === orbProfileId;
  });
}
