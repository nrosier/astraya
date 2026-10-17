/**
 * Named, revisioned orb profiles a practitioner keeps on this device (#590), and the choice of which orbs
 * transit and synastry use. A profile is a value: its orbs are copied into a chart's settings when the chart
 * is drawn, so editing a profile later never changes a chart already calculated, and every saved chart records
 * the revision it used. The card's orbs stay the default for every context.
 */
/**
 * @module astrology/orb-library
 * @purpose Pure model of the device's named orb profiles (#590): validation, revisions, the per-context source choice, and resolving a context to the orbs it uses.
 * @conventions Plain objects only, validated as a whole. A profile id is stable across revisions; each edit increments `revision`. A context's source is `'card'` (the Extended settings' orbs) or a profile id; an unknown id falls back to the card rather than failing. Synastry's tightening is applied by `computeSynastry`, not here.
 * @exports OrbProfileRecord, OrbLibrary, OrbContextSource, OrbSourceChoice, CARD_SOURCE, validateOrbProfileRecord, validateOrbLibrary, nextRevision, sourceForContext, orbSettingsFor
 */
import { citedPresetSettings, isCitedOrbPresetId, validateOrbRules, type OrbRulesValue } from './orb-profiles.js';

/** A named, revisioned set of orbs (#590). */
export interface OrbProfileRecord {
  readonly id: string;
  readonly name: string;
  /** Starts at 1; each saved edit increments it, so two saves of the same name stay distinguishable. */
  readonly revision: number;
  readonly scalePercent: number;
  readonly aspectOrbs: OrbRulesValue['aspectOrbs'];
  readonly bodyOrbs: OrbRulesValue['bodyOrbs'];
}

export interface OrbLibrary {
  readonly profiles: readonly OrbProfileRecord[];
}

/** The marker for "use the Extended settings' orbs". Profile ids cannot collide with it: `ID_PATTERN` allows it, so `validateOrbProfileRecord` rejects the id `card`. */
export const CARD_SOURCE = 'card';
/** Where a context takes its orbs from: `CARD_SOURCE`, or a named profile's id. */
export type OrbSourceChoice = string;

/** The source each context uses. Absent means the card, so a device that never chose one is unchanged. */
export interface OrbContextSource {
  readonly transit?: OrbSourceChoice;
  readonly synastry?: OrbSourceChoice;
  readonly natal?: OrbSourceChoice;
}

const MAX_NAME_LENGTH = 80;
const MAX_PROFILES = 50;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const SCALE_RANGE = { min: -90, max: 90 } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates one saved profile as a whole: a malformed part drops the whole profile, never part of it (#590). */
export function validateOrbProfileRecord(value: unknown): OrbProfileRecord | undefined {
  if (!isRecord(value)) return undefined;
  const { id, name, revision, scalePercent } = value;
  if (typeof id !== 'string' || !ID_PATTERN.test(id) || id === CARD_SOURCE || isCitedOrbPresetId(id)) return undefined;
  if (typeof name !== 'string' || name.trim() === '' || name.length > MAX_NAME_LENGTH) return undefined;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) return undefined;
  if (typeof scalePercent !== 'number' || !Number.isFinite(scalePercent)) return undefined;
  if (scalePercent < SCALE_RANGE.min || scalePercent > SCALE_RANGE.max) return undefined;
  const rules = validateOrbRules({ aspectOrbs: value.aspectOrbs, bodyOrbs: value.bodyOrbs });
  if (rules === undefined) return undefined;
  return { id, name: name.trim(), revision, scalePercent, aspectOrbs: rules.aspectOrbs, bodyOrbs: rules.bodyOrbs };
}

/** Validates a stored library. Any profile that fails is dropped on its own, and duplicate ids keep the first. */
export function validateOrbLibrary(value: unknown): OrbLibrary {
  if (!isRecord(value) || !Array.isArray(value.profiles)) return { profiles: [] };
  const seen = new Set<string>();
  const profiles: OrbProfileRecord[] = [];
  for (const item of value.profiles.slice(0, MAX_PROFILES)) {
    const profile = validateOrbProfileRecord(item);
    if (profile === undefined || seen.has(profile.id)) continue;
    seen.add(profile.id);
    profiles.push(profile);
  }
  return { profiles };
}

/** The revision a saved edit of `profile` gets: one more than it had, or 1 for a new profile. */
export function nextRevision(profile: OrbProfileRecord | undefined): number {
  return profile === undefined ? 1 : profile.revision + 1;
}

/** The source a context uses, falling back to the card when the choice names no profile that exists. */
export function sourceForContext(
  library: OrbLibrary,
  sources: OrbContextSource,
  context: keyof OrbContextSource,
): OrbSourceChoice {
  const choice = sources[context] ?? CARD_SOURCE;
  if (choice === CARD_SOURCE) return CARD_SOURCE;
  // A cited preset (#590) is built in, so it needs no library entry.
  if (isCitedOrbPresetId(choice)) return choice;
  return library.profiles.some((profile) => profile.id === choice) ? choice : CARD_SOURCE;
}

/**
 * The orb settings a context calculates with: the card's (`card`), or a named profile's scale and rules.
 * The profile's orbs are copied, not referenced, so the result is a value a chart can record.
 */
export function orbSettingsFor(
  library: OrbLibrary,
  choice: OrbSourceChoice,
  card: {
    readonly scalePercent: number;
    readonly aspectOrbs?: OrbRulesValue['aspectOrbs'];
    readonly bodyOrbs?: OrbRulesValue['bodyOrbs'];
  },
): {
  readonly scalePercent: number;
  readonly aspectOrbs?: OrbRulesValue['aspectOrbs'];
  readonly bodyOrbs?: OrbRulesValue['bodyOrbs'];
} {
  if (choice === CARD_SOURCE) return { ...card };
  if (isCitedOrbPresetId(choice)) {
    const preset = citedPresetSettings(choice);
    return { scalePercent: preset.scalePercent, aspectOrbs: {}, bodyOrbs: { ...preset.bodyOrbs } };
  }
  const profile = library.profiles.find((candidate) => candidate.id === choice);
  if (profile === undefined) return { ...card };
  return {
    scalePercent: profile.scalePercent,
    aspectOrbs: { ...profile.aspectOrbs },
    bodyOrbs: { ...profile.bodyOrbs },
  };
}
