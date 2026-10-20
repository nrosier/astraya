/**
 * @module astrology/kite-registry
 * @purpose Cited definitions of the Kite aspect pattern (#741): the school, the required aspects, the orb policy, and the authority for each. Data only; detection lives in aspect-patterns.ts.
 * @conventions Each entry carries its authority and its page reference. An entry whose citation is not checked against a copy in the repository says so in its authority string. No orb value is invented: the orb policy names the rule, and the numbers come from the existing orb configuration.
 * @exports KiteAspectRequirement, KiteDefinition, KITE_DEFINITIONS
 */

/** One row of the aspects a kite requires, by role rather than by body name. */
export interface KiteAspectRequirement {
  readonly aspect: 'trine' | 'sextile' | 'opposition';
  /** Which pair of bodies the aspect joins, by role: 'focal-vertex' is the focal point and a Grand Trine vertex; 'vertex-vertex' is two Grand Trine vertices; 'focal-opposed' is the focal point and the vertex it opposes. */
  readonly between: 'focal-vertex' | 'vertex-vertex' | 'focal-opposed';
  readonly count: number;
}

/** A cited definition of the Kite aspect pattern. */
export interface KiteDefinition {
  readonly id: string;
  readonly name: string;
  /** The author or school the definition follows, e.g. "Huber". */
  readonly school: string;
  readonly requiredAspects: readonly KiteAspectRequirement[];
  /** The rule for orbs, in words. Every leg must be within its own orb under the active orb configuration. */
  readonly orbPolicy: string;
  /** The citation, with the edition and the printed page. Say plainly when a citation is not checked against a copy in the repository. */
  readonly authority: string;
}

export const KITE_DEFINITIONS: readonly KiteDefinition[] = [
  {
    id: 'huber-2019',
    name: 'Kite',
    school: 'Huber',
    requiredAspects: [
      { aspect: 'trine', between: 'vertex-vertex', count: 3 },
      { aspect: 'opposition', between: 'focal-opposed', count: 1 },
      { aspect: 'sextile', between: 'focal-vertex', count: 2 },
    ],
    orbPolicy:
      'Every leg must be within its own orb under the active orb configuration (the same rule as the other aspect patterns). No separate kite orb.',
    authority:
      'Huber, Bruno and Louise, Aspect Pattern Astrology (HopeWell, 2019 second edition; first English edition 2005; German original 1999), p. 152, chapter 5, two-coloured aspect figures: five blue aspects around one red opposition. Checked against the 2019 page image, held locally in docs/references/ (git-ignored, not committed).',
  },
];
