/**
 * Typed reading and sign-in reconciliation of the account preferences (#1066, ADR 0004).
 *
 * The fold keeps the account registers as raw values. This module gives each field its meaning: a language, a
 * rulership model, a calculation profile, an orb library or source, or a saved transit filter. A value this build cannot read (a newer client's, or a bad one) is
 * `unreadable`: it is never repaired with a default, because that would silently change the reader's choice. A
 * `null` is an explicit reset to the Astraya default and is distinct from a field that was never written.
 *
 * **Reconciliation** (ADR 0004 section 3.6) decides, per field, what to do with a candidate value from this device (the
 * signed-out store's register, or a pre-#1066 device setting of unknown age) against the account's register:
 *
 * 1. Candidate absent, `null` or unreadable: nothing.
 * 2. Account field never written: write the candidate (nothing is overwritten).
 * 3. Values equal: nothing.
 * 4. Candidate older than the account's value: the account's choice is newer; keep it.
 * 5. Otherwise (candidate newer, or its age unknown): ask the reader, listing only the differing settings.
 *
 * Pure: no store, no clock, no storage.
 *
 * @module domain/account-preferences
 * @purpose Decodes the account preference registers into typed values and plans the sign-in reconciliation between this device's candidates and the account's registers.
 * @conventions Unreadable values stay unreadable and are never coerced to defaults; `null` means an explicit reset; values are compared as canonical JSON; reconciliation never writes over a newer account value and never decides an unknown-age conflict itself.
 * @exports ACCOUNT_VALUE_VERSION, OrbLibraryFold, foldOrbLibrary, orbLibraryRegister, orbLibraryWrites, serializeOrbProfile, readOrbProfileValue, AccountFieldRead, AccountPreferenceValues, AccountPreferencesRead, readAccountPreferences, readAccountFieldValue, serializeAccountValue, ReconcileCandidate, ReconcileCandidates, ReconcileProposal, ReconcileResolution, ReconcilePlan, planReconcile, resolutionWrites, canonicalJson
 */
import {
  readOrbContextSourceStrict,
  readOrbLibraryStrict,
  validateOrbProfileRecord,
  type OrbContextSource,
  type OrbLibrary,
  type OrbProfileRecord,
} from '../astrology/orb-library.js';
import { isRulershipChoice, type RulershipChoice } from '../astrology/rulership.js';
import { readSavedTransitFilter, type SavedTransitFilter } from '../astrology/transit-importance.js';
import type { ExtendedSettings } from '../chart/extended-settings.js';
import { CORPUS_LOCALES, type Locale } from '../interpretation/schema.js';
import {
  ACCOUNT_ENTITY,
  ACCOUNT_ENTITY_ID,
  ACCOUNT_FIELDS,
  ACCOUNT_LOCALE_FIELD,
  ACCOUNT_ORB_LIBRARY_FIELD,
  ACCOUNT_ORB_SOURCE_FIELD,
  ACCOUNT_PROFILE_FIELD,
  ACCOUNT_RULERSHIP_FIELD,
  ACCOUNT_TRANSIT_FILTER_DAILY_FIELD,
  ACCOUNT_TRANSIT_FILTER_YEARLY_FIELD,
  orbProfileField,
  orbProfileIdOf,
  type AccountField,
  type AccountOrbProfileField,
  type AccountRegister,
  type AccountRegisters,
} from '../store/account.js';
import { compareHlc, type Hlc } from '../store/hlc.js';
import type { Mutation } from '../store/oplog.js';
import { isJsonValue, type JsonValue } from '../store/ops.js';
import { readCalculationSettings, serializeCalculationSettings } from './person.js';

/**
 * The version every structured value of the #1220 fields carries (ADR 0004 section 2.2: a structured value carries its
 * own version). A reader that does not know a value's version treats it as unreadable, so an older build never rewrites
 * a newer build's richer shape without the parts it cannot see. A newer shape bumps this number.
 */
export const ACCOUNT_VALUE_VERSION = 1;

function hasCurrentVersion(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && (value as { version?: unknown }).version === ACCOUNT_VALUE_VERSION
  );
}

/** What one account field holds. `default` is an explicit reset (`null`); `unset` was never written. */
export type AccountFieldRead<T> =
  | { readonly kind: 'unset' }
  | { readonly kind: 'default'; readonly hlc: Hlc }
  | { readonly kind: 'value'; readonly value: T; readonly hlc: Hlc }
  | { readonly kind: 'unreadable'; readonly hlc: Hlc };

/** The typed value of each field. */
export interface AccountPreferenceValues {
  readonly [ACCOUNT_LOCALE_FIELD]: Locale;
  readonly [ACCOUNT_RULERSHIP_FIELD]: RulershipChoice;
  readonly [ACCOUNT_PROFILE_FIELD]: ExtendedSettings;
  readonly [ACCOUNT_ORB_LIBRARY_FIELD]: OrbLibrary;
  readonly [ACCOUNT_ORB_SOURCE_FIELD]: OrbContextSource;
  readonly [ACCOUNT_TRANSIT_FILTER_DAILY_FIELD]: SavedTransitFilter;
  readonly [ACCOUNT_TRANSIT_FILTER_YEARLY_FIELD]: SavedTransitFilter;
}

export interface AccountPreferencesRead {
  readonly [ACCOUNT_LOCALE_FIELD]: AccountFieldRead<Locale>;
  readonly [ACCOUNT_RULERSHIP_FIELD]: AccountFieldRead<RulershipChoice>;
  readonly [ACCOUNT_PROFILE_FIELD]: AccountFieldRead<ExtendedSettings>;
  readonly [ACCOUNT_ORB_LIBRARY_FIELD]: AccountFieldRead<OrbLibrary>;
  readonly [ACCOUNT_ORB_SOURCE_FIELD]: AccountFieldRead<OrbContextSource>;
  readonly [ACCOUNT_TRANSIT_FILTER_DAILY_FIELD]: AccountFieldRead<SavedTransitFilter>;
  readonly [ACCOUNT_TRANSIT_FILTER_YEARLY_FIELD]: AccountFieldRead<SavedTransitFilter>;
}

function isLocale(value: unknown): value is Locale {
  return CORPUS_LOCALES.some((locale) => locale === value);
}

/** The typed value of one non-null field value, or `undefined` when this build cannot read it. */
export function readAccountFieldValue<F extends AccountField>(
  field: F,
  value: unknown,
): AccountPreferenceValues[F] | undefined {
  if (field === ACCOUNT_LOCALE_FIELD) {
    return (isLocale(value) ? value : undefined) as AccountPreferenceValues[F] | undefined;
  }
  if (field === ACCOUNT_RULERSHIP_FIELD) {
    return (isRulershipChoice(value) ? value : undefined) as AccountPreferenceValues[F] | undefined;
  }
  if (field === ACCOUNT_ORB_LIBRARY_FIELD) {
    // No count cap: two devices can each add a profile at the cap, and the editor alone enforces it (#1250).
    return (hasCurrentVersion(value) ? readOrbLibraryStrict(value, Number.POSITIVE_INFINITY) : undefined) as
      AccountPreferenceValues[F] | undefined;
  }
  if (field === ACCOUNT_ORB_SOURCE_FIELD) {
    return (hasCurrentVersion(value) ? readOrbContextSourceStrict(value) : undefined) as
      AccountPreferenceValues[F] | undefined;
  }
  if (field === ACCOUNT_TRANSIT_FILTER_DAILY_FIELD || field === ACCOUNT_TRANSIT_FILTER_YEARLY_FIELD) {
    return (hasCurrentVersion(value) ? readSavedTransitFilter(value) : undefined) as
      AccountPreferenceValues[F] | undefined;
  }
  const read = readCalculationSettings(value);
  return (read?.kind === 'settings' ? read.settings : undefined) as AccountPreferenceValues[F] | undefined;
}

/** The register value written for a field: a plain string, the versioned settings shape a person uses (#806), or a versioned #1220 value. */
export function serializeAccountValue<F extends AccountField>(field: F, value: AccountPreferenceValues[F]): JsonValue {
  if (field === ACCOUNT_PROFILE_FIELD) return serializeCalculationSettings(value as ExtendedSettings);
  // The #1220 values are plain data (strings, finite numbers, booleans, lists and maps of them) under a version.
  const versioned =
    field === ACCOUNT_ORB_LIBRARY_FIELD
      ? { version: ACCOUNT_VALUE_VERSION, profiles: sortedProfiles((value as OrbLibrary).profiles) }
      : field === ACCOUNT_ORB_SOURCE_FIELD
        ? { version: ACCOUNT_VALUE_VERSION, ...(value as OrbContextSource) }
        : field === ACCOUNT_TRANSIT_FILTER_DAILY_FIELD || field === ACCOUNT_TRANSIT_FILTER_YEARLY_FIELD
          ? { version: ACCOUNT_VALUE_VERSION, ...(value as SavedTransitFilter) }
          : undefined;
  if (versioned === undefined) return value as string;
  // Checked as it stands, never through a JSON round trip: that would turn a NaN into a null before this ran.
  if (!isJsonValue(versioned)) throw new Error(`The "${field}" preference is not a JSON value`);
  return versioned;
}

// --- the orb library: one register per profile (#1250, ADR 0004 section 11) ---------------------------------

/** Plain code-unit order of two strings, the same on every device. */
function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Profiles in the one order every device shows: name, then id. */
function sortedProfiles(profiles: readonly OrbProfileRecord[]): readonly OrbProfileRecord[] {
  return [...profiles].sort((a, b) => byCodeUnits(a.name, b.name) || byCodeUnits(a.id, b.id));
}

/** The register value of one profile: its record under a version. `null` (a removal) is written by the caller. */
export function serializeOrbProfile(profile: OrbProfileRecord): JsonValue {
  const versioned = { version: ACCOUNT_VALUE_VERSION, ...profile };
  if (!isJsonValue(versioned)) throw new Error('The orb profile is not a JSON value');
  return versioned;
}

/** The profile a register holds for `id`, or `undefined` when this build cannot read it (another version, another id). */
export function readOrbProfileValue(id: string, value: unknown): OrbProfileRecord | undefined {
  if (!hasCurrentVersion(value)) return undefined;
  const profile = validateOrbProfileRecord(value);
  return profile?.id === id ? profile : undefined;
}

/** What the orb library's registers hold: nothing written, a value this build cannot read, or the library. */
export type OrbLibraryFold =
  | { readonly kind: 'unset' }
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'value'; readonly library: OrbLibrary };

/**
 * Fold the library from its registers (#1250, ADR 0004 section 11).
 *
 * The whole-library `orbLibrary` register is the **base**: the library as it stood when it was written (every build
 * before #1250 wrote only this, and a reconciliation still writes it to replace the library). Each `orbProfile.<id>`
 * register then **layers on top, only when it is newer than the base**: a value sets that profile, a `null` removes it.
 * A profile register older than the base is superseded by it, so a replacement is never undone by a stale part.
 *
 * Two devices that each add a profile write different fields, so both profiles survive. Each profile is still
 * last-write-wins on its own. One unreadable part makes the whole library unreadable, so a save can never replace
 * what the reader cannot see (ADR 0004 section 10). The result does not depend on the order the registers arrive in.
 */
export function foldOrbLibrary(registers: AccountRegisters): OrbLibraryFold {
  const base = registers[ACCOUNT_ORB_LIBRARY_FIELD];
  const byId = new Map<string, OrbProfileRecord>();
  let written = false;
  if (base !== undefined) {
    written = true;
    if (base.value !== null) {
      const library = readAccountFieldValue(ACCOUNT_ORB_LIBRARY_FIELD, base.value);
      if (library === undefined) return { kind: 'unreadable' };
      for (const profile of library.profiles) byId.set(profile.id, profile);
    }
  }
  for (const [field, register] of Object.entries(registers) as [string, AccountRegister][]) {
    const id = orbProfileIdOf(field);
    if (id === undefined) continue;
    if (base !== undefined && compareHlc(register.hlc, base.hlc) <= 0) continue;
    written = true;
    if (register.value === null) {
      byId.delete(id);
      continue;
    }
    const profile = readOrbProfileValue(id, register.value);
    if (profile === undefined) return { kind: 'unreadable' };
    byId.set(id, profile);
  }
  return written ? { kind: 'value', library: { profiles: sortedProfiles([...byId.values()]) } } : { kind: 'unset' };
}

/** The newest timestamp among the library's registers, or `undefined` when none is written. */
function newestLibraryHlc(registers: AccountRegisters): Hlc | undefined {
  let newest: Hlc | undefined;
  for (const [field, register] of Object.entries(registers) as [string, AccountRegister][]) {
    if (field !== ACCOUNT_ORB_LIBRARY_FIELD && orbProfileIdOf(field) === undefined) continue;
    if (newest === undefined || compareHlc(register.hlc, newest) > 0) newest = register.hlc;
  }
  return newest;
}

/**
 * The library as one synthetic `orbLibrary` register: the whole-library value every reader, the first-paint cache and
 * the reconciliation already understand, stamped with the newest of its parts. `undefined` when no part is written. An
 * unreadable part gives a value no reader accepts (version 0), so it is reported as unreadable and never shown as the
 * default.
 */
export function orbLibraryRegister(registers: AccountRegisters): AccountRegister | undefined {
  const hlc = newestLibraryHlc(registers);
  if (hlc === undefined) return undefined;
  const base = registers[ACCOUNT_ORB_LIBRARY_FIELD];
  const layered = Object.entries(registers).some(
    ([field, register]) =>
      register !== undefined &&
      orbProfileIdOf(field) !== undefined &&
      (base === undefined || compareHlc(register.hlc, base.hlc) > 0),
  );
  // An explicit reset of the whole library, with nothing written after it, stays a reset (not an empty library).
  if (base?.value === null && !layered) return base;
  const folded = foldOrbLibrary(registers);
  if (folded.kind === 'unset') return undefined;
  if (folded.kind === 'unreadable') return { value: { version: 0 }, hlc };
  return { value: serializeAccountValue(ACCOUNT_ORB_LIBRARY_FIELD, folded.library), hlc };
}

/**
 * The writes that make the library `next` from `current`: one per profile that is new or changed, and a `null` for each
 * one that is gone. Unchanged profiles are not written, so an edit of one profile never touches another.
 */
export function orbLibraryWrites(next: OrbLibrary, current: OrbLibrary): readonly Mutation[] {
  const before = new Map(current.profiles.map((profile) => [profile.id, profile]));
  const after = new Set(next.profiles.map((profile) => profile.id));
  const writes: Mutation[] = [];
  for (const profile of next.profiles) {
    const old = before.get(profile.id);
    const value = serializeOrbProfile(profile);
    if (old !== undefined && canonicalJson(serializeOrbProfile(old)) === canonicalJson(value)) continue;
    writes.push(accountWrite(orbProfileField(profile.id), value));
  }
  for (const profile of current.profiles) {
    if (!after.has(profile.id)) writes.push(accountWrite(orbProfileField(profile.id), null));
  }
  return writes;
}

function readField<F extends AccountField>(
  registers: AccountRegisters,
  field: F,
): AccountFieldRead<AccountPreferenceValues[F]> {
  const register = field === ACCOUNT_ORB_LIBRARY_FIELD ? orbLibraryRegister(registers) : registers[field];
  if (register === undefined) return { kind: 'unset' };
  if (register.value === null) return { kind: 'default', hlc: register.hlc };
  const value = readAccountFieldValue(field, register.value);
  return value === undefined ? { kind: 'unreadable', hlc: register.hlc } : { kind: 'value', value, hlc: register.hlc };
}

/** Read every field. Never throws. */
export function readAccountPreferences(registers: AccountRegisters): AccountPreferencesRead {
  return {
    [ACCOUNT_LOCALE_FIELD]: readField(registers, ACCOUNT_LOCALE_FIELD),
    [ACCOUNT_RULERSHIP_FIELD]: readField(registers, ACCOUNT_RULERSHIP_FIELD),
    [ACCOUNT_PROFILE_FIELD]: readField(registers, ACCOUNT_PROFILE_FIELD),
    [ACCOUNT_ORB_LIBRARY_FIELD]: readField(registers, ACCOUNT_ORB_LIBRARY_FIELD),
    [ACCOUNT_ORB_SOURCE_FIELD]: readField(registers, ACCOUNT_ORB_SOURCE_FIELD),
    [ACCOUNT_TRANSIT_FILTER_DAILY_FIELD]: readField(registers, ACCOUNT_TRANSIT_FILTER_DAILY_FIELD),
    [ACCOUNT_TRANSIT_FILTER_YEARLY_FIELD]: readField(registers, ACCOUNT_TRANSIT_FILTER_YEARLY_FIELD),
  };
}

/** JSON with object keys sorted, so two equal values compare equal whatever order their keys were written in. */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${(value as readonly JsonValue[]).map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Readonly<Record<string, JsonValue>>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

/** A value offered from this device. `hlc` is absent for a pre-#1066 device setting, whose age is unknown. */
export interface ReconcileCandidate {
  readonly value: JsonValue;
  readonly hlc?: Hlc;
}

export type ReconcileCandidates = Readonly<Partial<Record<AccountField, ReconcileCandidate>>>;

/** One differing setting the reader is asked about. Both values are readable, non-null register values. */
export interface ReconcileProposal {
  readonly field: AccountField;
  readonly deviceValue: JsonValue;
  readonly accountValue: JsonValue | null;
  /** Set when the account holds a value this build cannot read (a newer build's), so it is not shown as the default. */
  readonly accountUnreadable?: true;
}

export interface ReconcileResolution {
  readonly field: AccountField;
  readonly use: 'device' | 'account';
}

export interface ReconcilePlan {
  /** Writes that overwrite nothing (the account field was never written). */
  readonly writes: readonly Mutation[];
  /** Settings to ask about, in field order. Empty means nothing to ask. */
  readonly proposals: readonly ReconcileProposal[];
}

function accountWrite(field: AccountField | AccountOrbProfileField, value: JsonValue): Mutation {
  return { entity: ACCOUNT_ENTITY, entityId: ACCOUNT_ENTITY_ID, field, value };
}

/** The registers with the library's parts replaced by the one `orbLibrary` register they fold to. */
function withFoldedLibrary(registers: AccountRegisters): AccountRegisters {
  const out: Partial<Record<AccountField, AccountRegister>> = {};
  for (const field of ACCOUNT_FIELDS) {
    const register = registers[field];
    if (register !== undefined && field !== ACCOUNT_ORB_LIBRARY_FIELD) out[field] = register;
  }
  const library = orbLibraryRegister(registers);
  if (library !== undefined) out[ACCOUNT_ORB_LIBRARY_FIELD] = library;
  return out;
}

/** Plan the reconciliation of this device's candidates against the account's registers (rules 1 to 5 above). */
export function planReconcile(candidates: ReconcileCandidates, accountRegisters: AccountRegisters): ReconcilePlan {
  // The library is compared as the one value it folds to, whichever registers hold it (#1250).
  const target: AccountRegisters = withFoldedLibrary(accountRegisters);
  const writes: Mutation[] = [];
  const proposals: ReconcileProposal[] = [];
  for (const field of ACCOUNT_FIELDS) {
    const candidate = candidates[field];
    // Rule 1. An unreadable candidate is not offered: it would overwrite a readable choice with one nobody can see.
    if (candidate === undefined || candidate.value === null) continue;
    if (readAccountFieldValue(field, candidate.value) === undefined) continue;
    const existing = target[field];
    // Rule 2. A `null` target is an explicit reset with its own timestamp, not "never written".
    if (existing === undefined) {
      writes.push(accountWrite(field, candidate.value));
      continue;
    }
    // Rule 3.
    if (existing.value !== null && canonicalJson(existing.value) === canonicalJson(candidate.value)) continue;
    // Rule 4.
    if (candidate.hlc !== undefined && compareHlc(candidate.hlc, existing.hlc) < 0) continue;
    // Rule 5. An unreadable account value is not shown as a choice; the device's value is still offered against it.
    const readable = existing.value !== null && readAccountFieldValue(field, existing.value) !== undefined;
    const unreadable = existing.value !== null && !readable;
    proposals.push({
      field,
      deviceValue: candidate.value,
      accountValue: readable ? existing.value : null,
      ...(unreadable ? { accountUnreadable: true as const } : {}),
    });
  }
  return { writes, proposals };
}

/** The writes a reader's answers produce: one per setting where they chose this device's value. */
export function resolutionWrites(
  proposals: readonly ReconcileProposal[],
  resolutions: readonly ReconcileResolution[],
): readonly Mutation[] {
  const chosen = new Set(resolutions.filter((resolution) => resolution.use === 'device').map(({ field }) => field));
  return proposals
    .filter(({ field }) => chosen.has(field))
    .map(({ field, deviceValue }) => accountWrite(field, deviceValue));
}
