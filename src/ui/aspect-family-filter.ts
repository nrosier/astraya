/**
 * @module ui/aspect-family-filter
 * @purpose Aspect-family filters for the wheel and the matrix, and the on-demand consultation presets built on them (#1063).
 * @conventions Pure, no React. Aspect keys are the existing `ASPECTS` keys (`astrology/aspects`); a family lists only keys that catalogue holds, so Decile, Septile and Novile (no catalogue entry) are not offered. No selection means no filter, which is the default view; Orb caps hide a contact whose orb is wider than the cap and never widen one.
 * @exports ConsultationPreset, PresetSwitches, CONSULTATION_PRESETS, AspectFamilyKey, AspectFamily, ASPECT_FAMILIES, FILTERABLE_FAMILIES, CATALOGUE_KEYS, OrbCaps, isContactShown, orbCapFor, toggleFamily
 */
import { ASPECTS } from '../astrology/aspects.js';

export type AspectFamilyKey = 'major' | 'hardMinor' | 'softMinor' | 'parallels' | 'nodalAngular';

export interface AspectFamily {
  readonly key: AspectFamilyKey;
  /** The `ASPECTS` keys the family holds; empty for a family defined by the bodies involved or by declination. */
  readonly aspectKeys: readonly string[];
  /** Contacts to any of these bodies belong to the family whatever their aspect. */
  readonly bodyKeys: readonly string[];
}

/** Families as recorded on #1063 (comment of 2026-11-05), limited to aspects the catalogue holds. */
export const ASPECT_FAMILIES: readonly AspectFamily[] = [
  { key: 'major', aspectKeys: ['conjunction', 'sextile', 'square', 'trine', 'opposition'], bodyKeys: [] },
  { key: 'hardMinor', aspectKeys: ['semisquare', 'sesquiquadrate', 'quincunx', 'semisextile'], bodyKeys: [] },
  { key: 'softMinor', aspectKeys: ['quintile', 'biquintile'], bodyKeys: [] },
  // Parallels are declination contacts: the wheel and the matrix draw none, so this family has no line to show.
  { key: 'parallels', aspectKeys: [], bodyKeys: [] },
  {
    key: 'nodalAngular',
    aspectKeys: [],
    bodyKeys: ['meanNode', 'trueNode', 'southNode', 'asc', 'mc', 'ic', 'dsc', 'vertex', 'partOfFortune'],
  },
];

/** The families that own at least one line on the wheel or cell in the matrix, i.e. the ones worth offering as a filter. */
export const FILTERABLE_FAMILIES: readonly AspectFamily[] = ASPECT_FAMILIES.filter(
  (family) => family.aspectKeys.length > 0 || family.bodyKeys.length > 0,
);

/** Orb limits in degrees: a pair with a luminary uses `luminary`, any other pair `planet`. */
export interface OrbCaps {
  readonly luminary: number;
  readonly planet: number;
}

const LUMINARIES: ReadonlySet<string> = new Set(['sun', 'moon']);

export function orbCapFor(aKey: string, bKey: string, caps: OrbCaps): number {
  return LUMINARIES.has(aKey) || LUMINARIES.has(bKey) ? caps.luminary : caps.planet;
}

/**
 * Whether a contact stays drawn. With no family selected and no cap there is no filter. With families
 * selected, a contact stays when its aspect belongs to a selected family or it touches a body of a
 * selected body-defined family. The cap, when given, then hides a contact wider than it.
 */
export function isContactShown(
  contact: {
    readonly aKey: string;
    readonly bKey: string;
    readonly aspectKey: string;
    readonly orb?: number | undefined;
  },
  families: ReadonlySet<AspectFamilyKey>,
  caps?: OrbCaps,
): boolean {
  if (families.size > 0) {
    const inFamily = ASPECT_FAMILIES.some(
      (family) =>
        families.has(family.key) &&
        (family.aspectKeys.includes(contact.aspectKey) ||
          family.bodyKeys.includes(contact.aKey) ||
          family.bodyKeys.includes(contact.bKey)),
    );
    if (!inFamily) return false;
  }
  if (caps !== undefined && contact.orb !== undefined) {
    return contact.orb <= orbCapFor(contact.aKey, contact.bKey, caps);
  }
  return true;
}

/** `families` with `key` switched on or off, as a new set. */
export function toggleFamily(
  families: ReadonlySet<AspectFamilyKey>,
  key: AspectFamilyKey,
  on: boolean,
): ReadonlySet<AspectFamilyKey> {
  const next = new Set(families);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}

export interface ConsultationPreset {
  readonly key: 'standardOverview' | 'natalCore' | 'predictiveTiming' | 'dynamicSynastry';
  readonly families: readonly AspectFamilyKey[];
  /** Orb limits for natal contacts; absent when the spec gives none that apply to the wheel and matrix (transit and solar arc orbs). */
  readonly orbs?: OrbCaps;
  /** What the preset switches on the chart's own screen (#1190); absent means the preset leaves those choices as they are. */
  readonly switches?: PresetSwitches;
}

/**
 * The layer, chart-facts and orb choices a preset sets on the chart screen (#1190), as recorded on #1063 (2026-11-05).
 * A layer left out is not touched. Orbs are degrees: the transit limit (3) and the solar arc limit (1) are the strict
 * values #1063 names; 1 is also the window `SOLAR_ARC_ACTIVE_ORB_DEG` uses for an active solar arc contact.
 */
export interface PresetSwitches {
  readonly layers?: Partial<Record<'transit' | 'progressed' | 'directed' | 'solarArc', boolean>>;
  /** Essential dignities, sect and Almuten Figuris shown. */
  readonly chartFacts?: boolean;
  readonly transitOrb?: number;
  readonly solarArcOrb?: number;
  /** Draw the contacts between the rings, so the orb limits above have contacts to limit. */
  readonly interRingAspects?: boolean;
}

/** Contents as recorded on #1063 (2026-11-05); owner sign-off of these contents is still to come. */
export const CONSULTATION_PRESETS: readonly ConsultationPreset[] = [
  {
    key: 'standardOverview',
    families: ['major', 'nodalAngular'],
    orbs: { luminary: 8, planet: 6 },
    switches: { layers: { transit: true }, chartFacts: true, transitOrb: 3 },
  },
  {
    key: 'natalCore',
    families: ['major', 'parallels'],
    orbs: { luminary: 7, planet: 5 },
    switches: {
      layers: { transit: false, progressed: false, directed: false, solarArc: false },
      chartFacts: true,
    },
  },
  {
    key: 'predictiveTiming',
    families: ['major', 'hardMinor'],
    switches: {
      layers: { transit: true, solarArc: true },
      transitOrb: 3,
      solarArcOrb: 1,
      interRingAspects: true,
    },
  },
  { key: 'dynamicSynastry', families: ['major', 'nodalAngular'], orbs: { luminary: 6, planet: 6 } },
];

/** Every key in `ASPECTS`, so a test can check each family only names catalogue entries. */
export const CATALOGUE_KEYS: readonly string[] = ASPECTS.map((aspect) => aspect.key);
