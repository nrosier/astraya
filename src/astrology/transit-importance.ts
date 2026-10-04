/**
 * Which transits matter (#416): a fixed, documented rule set that separates the few contacts a
 * reading rests on from the long tail, a filter the user can adjust, and a deterministic score
 * that ranks what is left.
 *
 * The engine is fixed — orbs, applying/separating and the score below are computed the same way
 * everywhere — and only the *display* is the user's: presets, an orb scale, aspect groups and an
 * applying-only switch decide what is shown, never what is calculated.
 *
 * Traditions weigh transits differently, so the defaults are a stated convention, not a finding.
 * Reading Jupiter–Pluto plus the Sun and Mars for timing, and treating the fast bodies as daily
 * weather, is a widely shared working convention, not a measured result or one author's rule.
 *
 * **Two defaults, because a day and a year ask different questions:**
 *
 * - **Daily** (the Transits screen: one chosen date) — fast triggers. Transiting Sun, Moon,
 *   Mercury, Venus and Mars, plus the slow planets *only* when within 1° of exact (a live peak).
 *   Natal targets: the Sun, Moon, Mercury, Venus, Mars, and the chart ruler. Hard and soft
 *   aspects (conjunction, square, opposition, sextile, trine) within 1.5°, the Moon within 1°:
 *   the Moon covers ~13° a day, so a 7° orb is half a day of constant, low-signal contact.
 * - **Yearly** (the Forecast screen) — the long chapters. Transiting Jupiter, Saturn, Uranus,
 *   Neptune, Pluto and Chiron; the inner planets pass over every degree several times a year
 *   and so mark no era. Natal targets: all the planets and the nodes. The five major aspects
 *   within 3.5°, wide enough to follow a multi-pass retrograde cycle as it builds and separates.
 *
 * **The angles are not covered yet.** The Ascendant and Midheaven matter as natal targets, but
 * Astraya's transit contacts are between bodies only, and the wheel has no point to draw a line
 * to. They are not in the lists below; the chart ruler (the planet ruling the Ascendant's sign, by the reader's rulership choice: modern by default, both co-rulers under Both; #426)
 * stands in for the Ascendant's weight.
 *
 * **Score** `S = W_transit × W_natal × W_aspect × orb multiplier × applying bonus`:
 *
 * - `W_transit` by speed: Pluto, Neptune, Uranus 1.0; Saturn, Jupiter 0.85; Mars 0.6; Sun,
 *   Mercury, Venus 0.3; Moon 0.15. (Chiron 0.5 and any other point 0.15 are this module's choice.)
 * - `W_natal` by the authority of the point touched: chart ruler 1.5; Sun and Moon 1.3; Mercury,
 *   Venus, Mars 1.0; Jupiter–Pluto 0.7; nodes, Chiron and the rest 0.5.
 * - `W_aspect`: conjunction, square, opposition 1.0; sextile, trine 0.7; minor aspects 0.4.
 * - orb multiplier `1 − orb / limit`, where `limit` is the orb allowed for that transiting body
 *   (so an exact contact scores in full, one at the edge of what is shown scores nothing).
 * - applying bonus ×1.15 while the contact is still building.
 *
 * The score only orders the list; the user can still sort by any column.
 */
import { DEFAULT_ORB_CONFIG, type Aspect, type OrbConfig } from './aspects.js';
import { bodyById } from './bodies.js';
import { DEFAULT_RULERSHIP_CHOICE, rulersOf, type RulershipChoice } from './rulership.js';

export type TransitContext = 'daily' | 'yearly';
export type TransitPreset = 'important' | 'outer' | 'personal' | 'all';
export type OrbSensitivity = 'tight' | 'balanced' | 'wide';

export interface TransitFilter {
  /** `BodyDefinition.key`s of the transiting bodies to show. */
  readonly transiting: readonly string[];
  /** Keys of the natal points to show. */
  readonly natal: readonly string[];
  /** Aspect keys to show. */
  readonly aspects: readonly string[];
  /** The widest orb shown, in degrees, for a transiting body without an entry in `orbOverrides`. */
  readonly maxOrb: number;
  /** Narrower limits for particular transiting bodies (key → degrees). */
  readonly orbOverrides: Readonly<Record<string, number>>;
  /** Scales every limit: tight caps them at 1.5°, wide lifts them to at least 5°. */
  readonly orbSensitivity: OrbSensitivity;
  readonly applyingOnly: boolean;
}

/** What a preset needs to know that the filter itself does not. */
export interface TransitRuleContext {
  readonly everyBodyKey: readonly string[];
  readonly context: TransitContext;
  /** The planets ruling the natal Ascendant's sign (two under Both, #426); none without an Ascendant. */
  readonly chartRulerKeys?: readonly string[] | undefined;
}

export const OUTER_PLANET_KEYS = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] as const;
export const PERSONAL_PLANET_KEYS = ['sun', 'moon', 'mercury', 'venus', 'mars'] as const;
const NODE_KEYS = ['meanNode', 'trueNode'] as const;
export const HARD_ASPECT_KEYS = ['conjunction', 'square', 'opposition'] as const;
export const SOFT_ASPECT_KEYS = ['sextile', 'trine'] as const;
/** The minor aspects Astraya calculates for transits (the semisextile and quintiles are left out). */
export const MINOR_ASPECT_KEYS = ['semisquare', 'sesquiquadrate', 'quincunx'] as const;
const MAJOR_ASPECT_KEYS = [...HARD_ASPECT_KEYS, ...SOFT_ASPECT_KEYS] as const;

/**
 * The orbs transits are calculated with: the defaults, plus the three minor aspects the filter can
 * show. The engine always calculates them; whether they are shown is the filter's business.
 */
export const TRANSIT_ORB_CONFIG: OrbConfig = { ...DEFAULT_ORB_CONFIG, enabledMinorAspects: [...MINOR_ASPECT_KEYS] };

/** The widest orb a contact can have under the default orb rules (a luminary's major aspect). */
export const WIDEST_ORB_DEG = 10;
export const TIGHT_ORB_CAP_DEG = 1.5;
export const WIDE_ORB_FLOOR_DEG = 5;

const DAILY_ORB_DEG = 1.5;
const DAILY_MOON_ORB_DEG = 1;
const DAILY_SLOW_PLANET_ORB_DEG = 1;
const YEARLY_ORB_DEG = 3.5;

function withRulers(keys: readonly string[], chartRulerKeys: readonly string[] | undefined): readonly string[] {
  const missing = (chartRulerKeys ?? []).filter((key) => !keys.includes(key));
  return missing.length === 0 ? keys : [...keys, ...missing];
}

/** The filter for a preset. `important` is the daily or yearly rule set, by context. */
export function transitPreset(preset: TransitPreset, rules: TransitRuleContext): TransitFilter {
  const common = { orbSensitivity: 'balanced', applyingOnly: false, orbOverrides: {} } as const;
  switch (preset) {
    case 'important':
      return rules.context === 'daily'
        ? {
            ...common,
            transiting: [...PERSONAL_PLANET_KEYS, ...OUTER_PLANET_KEYS],
            natal: withRulers(PERSONAL_PLANET_KEYS, rules.chartRulerKeys),
            aspects: [...MAJOR_ASPECT_KEYS],
            maxOrb: DAILY_ORB_DEG,
            orbOverrides: {
              moon: DAILY_MOON_ORB_DEG,
              ...Object.fromEntries(OUTER_PLANET_KEYS.map((key) => [key, DAILY_SLOW_PLANET_ORB_DEG])),
            },
          }
        : {
            ...common,
            transiting: [...OUTER_PLANET_KEYS, 'chiron'],
            natal: withRulers([...PERSONAL_PLANET_KEYS, ...OUTER_PLANET_KEYS, ...NODE_KEYS], rules.chartRulerKeys),
            aspects: [...MAJOR_ASPECT_KEYS],
            maxOrb: YEARLY_ORB_DEG,
          };
    case 'outer':
      return {
        ...common,
        transiting: [...OUTER_PLANET_KEYS],
        natal: rules.everyBodyKey,
        aspects: [...MAJOR_ASPECT_KEYS],
        maxOrb: WIDEST_ORB_DEG,
      };
    case 'personal':
      return {
        ...common,
        transiting: [...PERSONAL_PLANET_KEYS],
        natal: rules.everyBodyKey,
        aspects: [...MAJOR_ASPECT_KEYS],
        maxOrb: WIDEST_ORB_DEG,
      };
    case 'all':
      return {
        ...common,
        transiting: rules.everyBodyKey,
        natal: rules.everyBodyKey,
        aspects: [...MAJOR_ASPECT_KEYS, ...MINOR_ASPECT_KEYS],
        maxOrb: WIDEST_ORB_DEG,
      };
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key) => b.includes(key));
}

function sameLimits(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/** The preset a filter equals exactly, or `undefined` for a custom one. */
export function presetOf(filter: TransitFilter, rules: TransitRuleContext): TransitPreset | undefined {
  const presets: readonly TransitPreset[] = ['important', 'outer', 'personal', 'all'];
  return presets.find((preset) => {
    const candidate = transitPreset(preset, rules);
    return (
      sameSet(candidate.transiting, filter.transiting) &&
      sameSet(candidate.natal, filter.natal) &&
      sameSet(candidate.aspects, filter.aspects) &&
      candidate.maxOrb === filter.maxOrb &&
      sameLimits(candidate.orbOverrides, filter.orbOverrides) &&
      candidate.orbSensitivity === filter.orbSensitivity &&
      candidate.applyingOnly === filter.applyingOnly
    );
  });
}

/** The widest orb shown for a contact by this transiting body, after the sensitivity scale. */
export function orbLimitFor(filter: TransitFilter, transitingKey: string): number {
  const base = filter.orbOverrides[transitingKey] ?? filter.maxOrb;
  switch (filter.orbSensitivity) {
    case 'tight':
      return Math.min(base, TIGHT_ORB_CAP_DEG);
    case 'wide':
      return Math.min(Math.max(base, WIDE_ORB_FLOOR_DEG), WIDEST_ORB_DEG);
    case 'balanced':
      return base;
  }
}

function keyOf(body: Aspect['bodyA']): string {
  return bodyById(body)?.key ?? '';
}

/** Whether a contact passes the filter. Transiting is `bodyA`, the natal point `bodyB`. */
export function passesTransitFilter(contact: Aspect, filter: TransitFilter): boolean {
  const transiting = keyOf(contact.bodyA);
  return (
    filter.transiting.includes(transiting) &&
    filter.natal.includes(keyOf(contact.bodyB)) &&
    filter.aspects.includes(contact.aspect.key) &&
    contact.orb <= orbLimitFor(filter, transiting) &&
    (!filter.applyingOnly || contact.applying)
  );
}

export function filterTransits(contacts: readonly Aspect[], filter: TransitFilter): readonly Aspect[] {
  return contacts.filter((contact) => passesTransitFilter(contact, filter));
}

/** The keys of the planets ruling the sign an Ascendant longitude is in: one, or the two co-rulers under Both. */
export function chartRulerKeysOf(
  ascendantLongitude: number,
  rulership: RulershipChoice = DEFAULT_RULERSHIP_CHOICE,
): readonly string[] {
  if (!Number.isFinite(ascendantLongitude)) return [];
  const sign = Math.floor((((ascendantLongitude % 360) + 360) % 360) / 30);
  return rulersOf(sign, rulership).map((id) => bodyById(id)?.key ?? '');
}

const TRANSITING_WEIGHT: Readonly<Record<string, number>> = {
  pluto: 1,
  neptune: 1,
  uranus: 1,
  saturn: 0.85,
  jupiter: 0.85,
  chiron: 0.5,
  mars: 0.6,
  sun: 0.3,
  venus: 0.3,
  mercury: 0.3,
  moon: 0.15,
};
const OTHER_TRANSITING_WEIGHT = 0.15;
const CHART_RULER_WEIGHT = 1.5;
const LUMINARY_WEIGHT = 1.3;
const PERSONAL_WEIGHT = 1;
const OUTER_NATAL_WEIGHT = 0.7;
const MINOR_POINT_WEIGHT = 0.5;
const SOFT_ASPECT_WEIGHT = 0.7;
const MINOR_ASPECT_WEIGHT = 0.4;
const APPLYING_BONUS = 1.15;

function natalWeight(natalKey: string, chartRulerKeys: readonly string[]): number {
  if (chartRulerKeys.includes(natalKey)) return CHART_RULER_WEIGHT;
  if (natalKey === 'sun' || natalKey === 'moon') return LUMINARY_WEIGHT;
  if (natalKey === 'mercury' || natalKey === 'venus' || natalKey === 'mars') return PERSONAL_WEIGHT;
  if ((OUTER_PLANET_KEYS as readonly string[]).includes(natalKey)) return OUTER_NATAL_WEIGHT;
  return MINOR_POINT_WEIGHT;
}

function aspectWeight(aspectKey: string): number {
  if ((HARD_ASPECT_KEYS as readonly string[]).includes(aspectKey)) return 1;
  if ((SOFT_ASPECT_KEYS as readonly string[]).includes(aspectKey)) return SOFT_ASPECT_WEIGHT;
  return MINOR_ASPECT_WEIGHT;
}

/** How much a contact matters, for ordering — see the file doc for the formula. Higher is more. */
export function transitImportance(
  contact: Aspect,
  filter: TransitFilter,
  chartRulerKeys: readonly string[] = [],
): number {
  const transitingKey = keyOf(contact.bodyA);
  const limit = orbLimitFor(filter, transitingKey);
  const orbMultiplier = Math.max(0, 1 - contact.orb / limit);
  return (
    (TRANSITING_WEIGHT[transitingKey] ?? OTHER_TRANSITING_WEIGHT) *
    natalWeight(keyOf(contact.bodyB), chartRulerKeys) *
    aspectWeight(contact.aspect.key) *
    orbMultiplier *
    (contact.applying ? APPLYING_BONUS : 1)
  );
}

/** The contacts most important first; ties keep their input order. */
export function rankTransits(
  contacts: readonly Aspect[],
  filter: TransitFilter,
  chartRulerKeys: readonly string[] = [],
): readonly Aspect[] {
  return contacts
    .map((contact, index) => ({ contact, index, score: transitImportance(contact, filter, chartRulerKeys) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ contact }) => contact);
}
