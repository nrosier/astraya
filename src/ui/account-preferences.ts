/**
 * The account preferences at runtime (#1066, ADR 0004): language, default rulership, default calculation profile, and
 * (#1220) the orb library, its per-context source and the saved transit filters.
 *
 * The values live in the op log, on the `account` entity of whichever store is open (the signed-out store, or a
 * signed-in account's own). This module is the synchronous read path the screens need, because `locale.ts` must set
 * `<html lang>` before IndexedDB has opened:
 *
 * - **Reads come from memory**, never from `localStorage` directly. Memory is filled from the bound store's registers
 *   on every `bind` and on every store change, so one tab can never read another account's values (db-integrity
 *   finding B1).
 * - **A per-database cache** (`astraya:accountSettingsCache:<dbName>`) exists only for first paint after a reload. A
 *   value and its owner are one write; a `storage` event is applied only for this tab's own database.
 * - **Setters apply locally first**, then write one operation per changed field. A write that fails (a read-only tab,
 *   storage over quota) rolls back to the register's value and is reported through `failure`.
 * - **While no store is bound** (between a session ending and the next store opening) a setter applies its value in
 *   memory for this page only, and writes neither the cache nor a store.
 *
 * **Legacy values** (before #1066 these were device-wide `localStorage` keys) are captured once, at import, into
 * `astraya:legacyAccountSettings`, before any bind. Until the one-time move into the op log is done (the global guard
 * `astraya:accountSettingsMigrated`), a field the bound store has never written shows the legacy value, so nobody's
 * language flips back to English on the first launch of this build. `useAccountPreferencesReconcile` performs the move.
 *
 * @module ui/account-preferences
 * @purpose Synchronous, store-bound read path and local-first setters for the account-scope preferences, with the per-database first-paint cache and the one-time legacy capture.
 * @conventions Module-level `useSyncExternalStore` store (stable snapshot replaced only on change); reads never touch `localStorage`; the cache is written only by a writable bound store and replaced wholesale at bind; storage access is best-effort and never throws; a setter never writes an unchanged value.
 * @exports AccountPreferencesSnapshot, LEGACY_ORB_LIBRARY_KEY, LEGACY_ORB_SOURCE_KEY, LEGACY_TRANSIT_FILTER_DAILY_KEY, LEGACY_TRANSIT_FILTER_YEARLY_KEY, LEGACY_ACCOUNT_SETTINGS_V2_KEY, ACCOUNT_SETTINGS_MIGRATED_V2_KEY, getAccountPreferences, subscribeAccountPreferences, useAccountPreferences, setAccountPreferences, bindAccountPreferences, unbindAccountPreferences, boundAccountStore, accountCacheKey, forgetAccountPreferencesCache, LEGACY_ACCOUNT_SETTINGS_KEY, ACCOUNT_SETTINGS_MIGRATED_KEY, LEGACY_LOCALE_KEY, LEGACY_RULERSHIP_KEY, LEGACY_PROFILE_KEY, isAccountMigrationDone, legacyCandidates, completeLegacyMigration, captureSignInCandidates, persistSignInCandidates, clearAccountPreferenceFailure, forgetAccountPreferenceField, resetAccountPreferencesForTests
 */
import { useSyncExternalStore } from 'react';
import { validateOrbLibrary, type OrbContextSource, type OrbLibrary } from '../astrology/orb-library.js';
import { DEFAULT_RULERSHIP_CHOICE, isRulershipChoice, type RulershipChoice } from '../astrology/rulership.js';
import { readSavedTransitFilter, type SavedTransitFilter } from '../astrology/transit-importance.js';
import type { ExtendedSettings } from '../chart/extended-settings.js';
import {
  canonicalJson,
  orbLibraryRegister,
  orbLibraryWrites,
  readAccountFieldValue,
  serializeAccountValue,
  type AccountPreferenceValues,
  type ReconcileCandidates,
} from '../domain/account-preferences.js';
import { parseCalculationSnapshot } from '../domain/calculation-snapshot.js';
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
  type AccountField,
  type AccountRegister,
  type AccountRegisters,
} from '../store/account.js';
import { compareHlc } from '../store/hlc.js';
import { DB_NAME } from '../store/db.js';
import type { JsonValue } from '../store/ops.js';
import type { Store } from '../store/store.js';

/** The pre-#1066 device keys. Read once, at import, as the one-time capture source; never written by this build. */
export const LEGACY_LOCALE_KEY = 'astraya:reportLocale';
export const LEGACY_RULERSHIP_KEY = 'astraya:rulershipChoice';
export const LEGACY_PROFILE_KEY = 'astraya:defaultCalculationProfile';

/**
 * The device keys of the settings #1220 moved into the op log. Same names the registry has always used; read once as
 * a second, separate capture because most devices already passed the first guard.
 */
export const LEGACY_ORB_LIBRARY_KEY = 'astraya:orbLibrary';
export const LEGACY_ORB_SOURCE_KEY = 'astraya:orbContextSource';
export const LEGACY_TRANSIT_FILTER_DAILY_KEY = 'astraya:transitFilter:daily';
export const LEGACY_TRANSIT_FILTER_YEARLY_KEY = 'astraya:transitFilter:yearly';

/** The captured legacy values, kept until the one-time move succeeds. */
export const LEGACY_ACCOUNT_SETTINGS_KEY = 'astraya:legacyAccountSettings';
/** Global guard: set once the legacy values have been moved into an op log (or there were none). */
export const ACCOUNT_SETTINGS_MIGRATED_KEY = 'astraya:accountSettingsMigrated';
/** The same pair for the second generation of settings (#1220): the orb library, its source and the transit filters. */
export const LEGACY_ACCOUNT_SETTINGS_V2_KEY = 'astraya:legacyAccountSettingsV2';
export const ACCOUNT_SETTINGS_MIGRATED_V2_KEY = 'astraya:accountSettingsMigratedV2';

/** Same key `session-context.tsx` keeps, read here only to pick the first-paint cache. */
const LAST_USER_KEY = 'astraya:lastUserId';
const CACHE_PREFIX = 'astraya:accountSettingsCache:';

/** The first-paint cache key of one database. */
export function accountCacheKey(dbName: string): string {
  return `${CACHE_PREFIX}${dbName}`;
}

/** What every screen reads. `undefined` profile means none is saved: callers fall back to the Astraya default. */
export interface AccountPreferencesSnapshot {
  readonly locale: Locale;
  readonly defaultRulership: RulershipChoice;
  readonly defaultCalculationProfile: ExtendedSettings | undefined;
  /** The named orb profiles (#590); empty when none were saved. */
  readonly orbLibrary: OrbLibrary;
  /** Which orb profile each chart type uses; empty means the card's orbs for all. */
  readonly orbContextSource: OrbContextSource;
  /** The saved default transit filter per context (#489); `undefined` means the Important preset. */
  readonly transitFilterDaily: SavedTransitFilter | undefined;
  readonly transitFilterYearly: SavedTransitFilter | undefined;
  /** Fields whose winning value this build cannot read. Shown as a notice; never replaced automatically. */
  readonly unreadable: readonly AccountField[];
  /** The last failed save, until it is dismissed or a later save succeeds. */
  readonly failure: string | undefined;
}

const EMPTY_ORB_LIBRARY: OrbLibrary = { profiles: [] };
const EMPTY_ORB_SOURCE: OrbContextSource = {};

/** One field as memory holds it: a raw register value (`null` is an explicit reset). Absent means never written. */
type FieldValues = Partial<Record<AccountField, JsonValue>>;

// --- best-effort storage -------------------------------------------------------------------------

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered for the next launch; memory still holds it for this page.
  }
}

function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clean up when storage cannot be used.
  }
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLocale(value: unknown): value is Locale {
  return CORPUS_LOCALES.some((locale) => locale === value);
}

// --- legacy capture ------------------------------------------------------------------------------

function isGenerationDone(guardKey: string): boolean {
  return storageGet(guardKey) !== null;
}

/** Whether every generation of legacy values has been moved into an op log (or there were none). */
export function isAccountMigrationDone(): boolean {
  return isGenerationDone(ACCOUNT_SETTINGS_MIGRATED_KEY) && isGenerationDone(ACCOUNT_SETTINGS_MIGRATED_V2_KEY);
}

/** Copy the explicitly present device keys of one generation into its capture key, unless already done or captured. */
function captureGeneration(
  guardKey: string,
  captureKey: string,
  keys: readonly (readonly [AccountField, string])[],
): void {
  if (isGenerationDone(guardKey) || storageGet(captureKey) !== null) return;
  const captured: Record<string, string> = {};
  for (const [field, legacyKey] of keys) {
    const raw = storageGet(legacyKey);
    if (raw !== null) captured[field] = raw;
  }
  if (Object.keys(captured).length > 0) storageSet(captureKey, JSON.stringify(captured));
}

/**
 * Copy the explicitly present legacy keys into the capture keys, once, before any bind (db-integrity finding 1). An
 * absent key means the reader never chose, so nothing is captured for it.
 */
function captureLegacy(): void {
  captureGeneration(ACCOUNT_SETTINGS_MIGRATED_KEY, LEGACY_ACCOUNT_SETTINGS_KEY, [
    [ACCOUNT_LOCALE_FIELD, LEGACY_LOCALE_KEY],
    [ACCOUNT_RULERSHIP_FIELD, LEGACY_RULERSHIP_KEY],
    [ACCOUNT_PROFILE_FIELD, LEGACY_PROFILE_KEY],
  ]);
  captureGeneration(ACCOUNT_SETTINGS_MIGRATED_V2_KEY, LEGACY_ACCOUNT_SETTINGS_V2_KEY, [
    [ACCOUNT_ORB_LIBRARY_FIELD, LEGACY_ORB_LIBRARY_KEY],
    [ACCOUNT_ORB_SOURCE_FIELD, LEGACY_ORB_SOURCE_KEY],
    [ACCOUNT_TRANSIT_FILTER_DAILY_FIELD, LEGACY_TRANSIT_FILTER_DAILY_KEY],
    [ACCOUNT_TRANSIT_FILTER_YEARLY_FIELD, LEGACY_TRANSIT_FILTER_YEARLY_KEY],
  ]);
}

/** The orb source a legacy device value names, read leniently as the old store did. */
function legacyOrbSource(value: unknown): OrbContextSource | undefined {
  if (!isRecord(value)) return undefined;
  const source: { transit?: string; synastry?: string; natal?: string } = {};
  for (const context of ['transit', 'synastry', 'natal'] as const) {
    const choice = value[context];
    if (typeof choice === 'string') source[context] = choice;
  }
  return Object.keys(source).length > 0 ? source : undefined;
}

/**
 * The captured legacy values as reconcile candidates of unknown age, parsed with the old lenient parsers and written
 * in the new strict shape. Empty once the move is done.
 */
export function legacyCandidates(): ReconcileCandidates {
  const out: Partial<Record<AccountField, { readonly value: JsonValue }>> = {};
  if (!isGenerationDone(ACCOUNT_SETTINGS_MIGRATED_KEY)) {
    const raw = parseJson(storageGet(LEGACY_ACCOUNT_SETTINGS_KEY));
    if (isRecord(raw)) {
      const locale = raw[ACCOUNT_LOCALE_FIELD];
      if (isLocale(locale)) out[ACCOUNT_LOCALE_FIELD] = { value: locale };
      const rulership = raw[ACCOUNT_RULERSHIP_FIELD];
      if (isRulershipChoice(rulership)) out[ACCOUNT_RULERSHIP_FIELD] = { value: rulership };
      const profile = raw[ACCOUNT_PROFILE_FIELD];
      if (typeof profile === 'string') {
        const parsed = parseJson(profile);
        if (parsed !== undefined) {
          out[ACCOUNT_PROFILE_FIELD] = {
            value: serializeAccountValue(ACCOUNT_PROFILE_FIELD, parseCalculationSnapshot(parsed).settings),
          };
        }
      }
    }
  }
  if (!isGenerationDone(ACCOUNT_SETTINGS_MIGRATED_V2_KEY)) {
    const raw = parseJson(storageGet(LEGACY_ACCOUNT_SETTINGS_V2_KEY));
    if (isRecord(raw)) {
      const fromText = (field: AccountField): unknown => {
        const text = raw[field];
        return typeof text === 'string' ? parseJson(text) : undefined;
      };
      // An empty library or an empty source is the absence of a choice, not one worth offering.
      const library = validateOrbLibrary(fromText(ACCOUNT_ORB_LIBRARY_FIELD));
      if (library.profiles.length > 0) {
        out[ACCOUNT_ORB_LIBRARY_FIELD] = { value: serializeAccountValue(ACCOUNT_ORB_LIBRARY_FIELD, library) };
      }
      const source = legacyOrbSource(fromText(ACCOUNT_ORB_SOURCE_FIELD));
      if (source !== undefined) {
        out[ACCOUNT_ORB_SOURCE_FIELD] = { value: serializeAccountValue(ACCOUNT_ORB_SOURCE_FIELD, source) };
      }
      for (const field of [ACCOUNT_TRANSIT_FILTER_DAILY_FIELD, ACCOUNT_TRANSIT_FILTER_YEARLY_FIELD] as const) {
        const saved = readSavedTransitFilter(fromText(field));
        if (saved !== undefined) out[field] = { value: serializeAccountValue(field, saved) };
      }
    }
  }
  return out;
}

/** Finish the one-time move: the guards first, then the captures (a leftover capture with its guard set is harmless). */
export function completeLegacyMigration(): void {
  storageSet(ACCOUNT_SETTINGS_MIGRATED_KEY, '1');
  storageSet(ACCOUNT_SETTINGS_MIGRATED_V2_KEY, '1');
  storageRemove(LEGACY_ACCOUNT_SETTINGS_KEY);
  storageRemove(LEGACY_ACCOUNT_SETTINGS_V2_KEY);
  recompute();
}

// --- state ---------------------------------------------------------------------------------------

interface Bound {
  readonly store: Store;
  readonly unsubscribe: () => void;
}

let bound: Bound | undefined;
/** The bound store's registers (or, unbound, the cache read at import plus this page's own changes). */
let fields: FieldValues = {};
/** Values being saved, shown over `fields` until the store confirms or refuses them. */
const inflight = new Map<AccountField, JsonValue>();
/** The legacy values shown for never-written fields until the one-time move is done. */
let legacy: FieldValues = {};
let failure: string | undefined;
const listeners = new Set<() => void>();
let snapshot: AccountPreferencesSnapshot = build();

function firstPaintDbName(): string {
  const userId = storageGet(LAST_USER_KEY);
  return userId === null ? DB_NAME : `astraya-user-${userId}`;
}

function readCache(dbName: string): FieldValues {
  const raw = parseJson(storageGet(accountCacheKey(dbName)));
  if (!isRecord(raw)) return {};
  const out: FieldValues = {};
  for (const field of ACCOUNT_FIELDS) {
    const value = raw[field];
    if (value !== undefined) out[field] = value as JsonValue;
  }
  return out;
}

/** What was last written to each database's cache, so an unchanged value is not rewritten on every store notification. */
const lastCacheText = new Map<string, string>();

function writeCache(store: Store, values: FieldValues): void {
  // A read-only tab's store is never newer than the writer tab's, so it leaves the cache to the writer.
  if (!store.writable) return;
  const key = accountCacheKey(store.dbName);
  const text = Object.keys(values).length === 0 ? '' : JSON.stringify(values);
  if (lastCacheText.get(key) === text) return;
  lastCacheText.set(key, text);
  if (text === '') storageRemove(key);
  else storageSet(key, text);
}

function legacyFields(): FieldValues {
  const out: FieldValues = {};
  for (const [field, candidate] of Object.entries(legacyCandidates())) out[field as AccountField] = candidate.value;
  return out;
}

function effective(field: AccountField): { readonly raw: JsonValue | undefined; readonly written: boolean } {
  if (inflight.has(field)) return { raw: inflight.get(field), written: true };
  if (field in fields) return { raw: fields[field], written: true };
  return { raw: legacy[field], written: false };
}

function typed<F extends AccountField>(field: F): AccountPreferenceValues[F] | undefined {
  const { raw } = effective(field);
  return raw === undefined || raw === null ? undefined : readAccountFieldValue(field, raw);
}

function build(): AccountPreferencesSnapshot {
  const unreadable = ACCOUNT_FIELDS.filter((field) => {
    const { raw, written } = effective(field);
    return written && raw !== undefined && raw !== null && readAccountFieldValue(field, raw) === undefined;
  });
  return {
    locale: typed(ACCOUNT_LOCALE_FIELD) ?? 'en',
    defaultRulership: typed(ACCOUNT_RULERSHIP_FIELD) ?? DEFAULT_RULERSHIP_CHOICE,
    defaultCalculationProfile: typed(ACCOUNT_PROFILE_FIELD),
    orbLibrary: typed(ACCOUNT_ORB_LIBRARY_FIELD) ?? EMPTY_ORB_LIBRARY,
    orbContextSource: typed(ACCOUNT_ORB_SOURCE_FIELD) ?? EMPTY_ORB_SOURCE,
    transitFilterDaily: typed(ACCOUNT_TRANSIT_FILTER_DAILY_FIELD),
    transitFilterYearly: typed(ACCOUNT_TRANSIT_FILTER_YEARLY_FIELD),
    unreadable,
    failure,
  };
}

/** Two values of one structured field are the same when they serialize to the same canonical JSON. */
function sameStructured<F extends AccountField>(
  field: F,
  a: AccountPreferenceValues[F] | undefined,
  b: AccountPreferenceValues[F] | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return canonicalJson(serializeAccountValue(field, a)) === canonicalJson(serializeAccountValue(field, b));
}

function same(a: AccountPreferencesSnapshot, b: AccountPreferencesSnapshot): boolean {
  return (
    a.locale === b.locale &&
    a.defaultRulership === b.defaultRulership &&
    a.failure === b.failure &&
    a.unreadable.join() === b.unreadable.join() &&
    sameStructured(ACCOUNT_PROFILE_FIELD, a.defaultCalculationProfile, b.defaultCalculationProfile) &&
    sameStructured(ACCOUNT_ORB_LIBRARY_FIELD, a.orbLibrary, b.orbLibrary) &&
    sameStructured(ACCOUNT_ORB_SOURCE_FIELD, a.orbContextSource, b.orbContextSource) &&
    sameStructured(ACCOUNT_TRANSIT_FILTER_DAILY_FIELD, a.transitFilterDaily, b.transitFilterDaily) &&
    sameStructured(ACCOUNT_TRANSIT_FILTER_YEARLY_FIELD, a.transitFilterYearly, b.transitFilterYearly)
  );
}

function recompute(): void {
  legacy = isAccountMigrationDone() ? {} : legacyFields();
  const next = build();
  if (same(next, snapshot)) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

/** The store's registers by field. The orb library is one value here, folded from its per-profile registers (#1250). */
function registersOf(store: Store): FieldValues {
  const out: FieldValues = {};
  for (const field of ACCOUNT_FIELDS) {
    const register = foldedRegister(store.state.account, field);
    if (register !== undefined) out[field] = register.value;
  }
  return out;
}

function foldedRegister(registers: AccountRegisters, field: AccountField): AccountRegister | undefined {
  return field === ACCOUNT_ORB_LIBRARY_FIELD ? orbLibraryRegister(registers) : registers[field];
}

function refreshFromStore(): void {
  if (bound === undefined) return;
  fields = registersOf(bound.store);
  writeCache(bound.store, fields);
  recompute();
}

function init(): void {
  captureLegacy();
  lastCacheText.clear();
  bound = undefined;
  inflight.clear();
  failure = undefined;
  // First paint: the cache of the database this tab is about to open. Legacy values cover never-written fields.
  fields = readCache(firstPaintDbName());
  legacy = isAccountMigrationDone() ? {} : legacyFields();
  snapshot = build();
}

init();

if (typeof window !== 'undefined') {
  // Another tab (the writer tab of the same database) changed the cache. Applied only for this tab's own database,
  // so a tab bound to one account never shows another tab's values (db-integrity finding 2).
  window.addEventListener('storage', (event) => {
    if (bound === undefined || event.key !== accountCacheKey(bound.store.dbName)) return;
    fields = readCache(bound.store.dbName);
    recompute();
  });
}

// --- public API ----------------------------------------------------------------------------------

export function getAccountPreferences(): AccountPreferencesSnapshot {
  return snapshot;
}

export function subscribeAccountPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

export function useAccountPreferences(): AccountPreferencesSnapshot {
  return useSyncExternalStore(subscribeAccountPreferences, getAccountPreferences, getAccountPreferences);
}

/** The store the preferences are read from and written to, if any. */
export function boundAccountStore(): Store | undefined {
  return bound?.store;
}

/**
 * Make `store` the source of the preferences. Called by `SessionProvider` whenever a store becomes the active one.
 * Memory and the cache are replaced wholesale from its registers: nothing from the previous store survives.
 */
export function bindAccountPreferences(store: Store): void {
  if (bound?.store === store) return;
  bound?.unsubscribe();
  inflight.clear();
  bound = { store, unsubscribe: store.subscribe(refreshFromStore) };
  refreshFromStore();
}

/** The active store closed. Memory stays as it was until the next bind; setters then apply to this page only. */
export function unbindAccountPreferences(): void {
  bound?.unsubscribe();
  bound = undefined;
  inflight.clear();
}

/** Remove one database's first-paint cache, so a shared device keeps no account's preferences after sign-out. */
export function forgetAccountPreferencesCache(dbName: string): void {
  lastCacheText.delete(accountCacheKey(dbName));
  storageRemove(accountCacheKey(dbName));
}

export function clearAccountPreferenceFailure(): void {
  if (failure === undefined) return;
  failure = undefined;
  recompute();
}

/**
 * Save preference changes: applied at once, then written as one operation per changed field in one batch (one
 * durable commit). Resolves once durable; on failure the change is rolled back, `failure` is set, and it rejects.
 */
export async function setAccountPreferences(changes: Partial<AccountPreferenceValues>): Promise<void> {
  /** What the screens see change, one entry per setting. */
  const changed: { readonly field: AccountField; readonly value: JsonValue }[] = [];
  /** What is appended: the same, except that the orb library is one operation per changed profile. */
  const writes: { readonly field: string; readonly value: JsonValue }[] = [];
  for (const field of ACCOUNT_FIELDS) {
    if (!(field in changes)) continue;
    const next = changes[field];
    if (next === undefined) continue;
    const value = serializeAccountValue(field, next);
    const current = typed(field);
    if (current !== undefined && canonicalJson(serializeAccountValue(field, current)) === canonicalJson(value)) {
      continue;
    }
    changed.push({ field, value });
    if (field === ACCOUNT_ORB_LIBRARY_FIELD) {
      // One register per profile, so a profile added on another device is never replaced by this save (#1250). A
      // library the store never wrote (a legacy value shown from the device) is written in full.
      const base = effective(field).written ? (current as OrbLibrary | undefined) : undefined;
      for (const write of orbLibraryWrites(next as OrbLibrary, base ?? EMPTY_ORB_LIBRARY)) {
        writes.push({ field: write.field, value: write.value });
      }
    } else {
      writes.push({ field, value });
    }
  }
  if (changed.length === 0) return;

  const target = bound?.store;
  if (target === undefined) {
    // No store open: this page only, nothing durable (ADR 0004 section 2.4).
    fields = { ...fields, ...Object.fromEntries(changed.map(({ field, value }) => [field, value])) };
    recompute();
    return;
  }

  for (const { field, value } of changed) inflight.set(field, value);
  failure = undefined;
  recompute();
  try {
    await target.mutate(
      writes.map(({ field, value }) => ({ entity: ACCOUNT_ENTITY, entityId: ACCOUNT_ENTITY_ID, field, value })),
    );
  } catch (error) {
    // Roll back only if this store is still the bound one; a newer bind already replaced everything.
    if (bound?.store === target) {
      for (const { field } of changed) inflight.delete(field);
      failure = error instanceof Error ? error.message : String(error);
      recompute();
    }
    throw error;
  }
  if (bound?.store === target) {
    for (const { field, value } of changed) if (inflight.get(field) === value) inflight.delete(field);
    refreshFromStore();
  }
}

/** The signed-out store's preferences, as sign-in candidates. A `null` (reset) is not a choice worth offering. */
export function captureSignInCandidates(anonymous: Store): AccountRegisters {
  const out: Partial<Record<AccountField, AccountRegister>> = {};
  for (const field of ACCOUNT_FIELDS) {
    const register = foldedRegister(anonymous.state.account, field);
    if (register !== undefined && register.value !== null) out[field] = register;
  }
  return out;
}

/**
 * Keep the sign-in candidates in the account store's meta, before the signed-out store closes. Only candidates newer
 * than the marker are kept: one already reconciled (or declined) is not offered again.
 */
export async function persistSignInCandidates(account: Store, candidates: AccountRegisters): Promise<void> {
  const state = await account.getAccountReconcile();
  const fresh: Partial<Record<AccountField, AccountRegister>> = { ...state.pending };
  let added = false;
  for (const field of ACCOUNT_FIELDS) {
    const candidate = candidates[field];
    if (candidate === undefined) continue;
    if (state.marker !== undefined && compareHlc(candidate.hlc, state.marker) <= 0) continue;
    fresh[field] = candidate;
    added = true;
  }
  if (!added) return;
  await account.setAccountReconcile({
    ...(state.marker === undefined ? {} : { marker: state.marker }),
    pending: fresh,
  });
}

/** For tests: forget one field's page-only value, as the old modules' memory resets did. */
export function forgetAccountPreferenceField(field: AccountField): void {
  if (bound !== undefined || !(field in fields)) return;
  fields = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== field));
  recompute();
}

/** For tests: start over as if the module had just been imported. */
export function resetAccountPreferencesForTests(): void {
  bound?.unsubscribe();
  init();
  for (const listener of listeners) listener();
}
