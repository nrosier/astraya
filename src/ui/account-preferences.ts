/**
 * The account preferences at runtime (#1066, ADR 0004): language, default rulership and default calculation profile.
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
 * @exports AccountPreferencesSnapshot, getAccountPreferences, subscribeAccountPreferences, useAccountPreferences, setAccountPreferences, bindAccountPreferences, unbindAccountPreferences, boundAccountStore, accountCacheKey, forgetAccountPreferencesCache, LEGACY_ACCOUNT_SETTINGS_KEY, ACCOUNT_SETTINGS_MIGRATED_KEY, LEGACY_LOCALE_KEY, LEGACY_RULERSHIP_KEY, LEGACY_PROFILE_KEY, isAccountMigrationDone, legacyCandidates, completeLegacyMigration, captureSignInCandidates, persistSignInCandidates, clearAccountPreferenceFailure, forgetAccountPreferenceField, resetAccountPreferencesForTests
 */
import { useSyncExternalStore } from 'react';
import { DEFAULT_RULERSHIP_CHOICE, isRulershipChoice, type RulershipChoice } from '../astrology/rulership.js';
import type { ExtendedSettings } from '../chart/extended-settings.js';
import {
  canonicalJson,
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
  ACCOUNT_PROFILE_FIELD,
  ACCOUNT_RULERSHIP_FIELD,
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

/** The captured legacy values, kept until the one-time move succeeds. */
export const LEGACY_ACCOUNT_SETTINGS_KEY = 'astraya:legacyAccountSettings';
/** Global guard: set once the legacy values have been moved into an op log (or there were none). */
export const ACCOUNT_SETTINGS_MIGRATED_KEY = 'astraya:accountSettingsMigrated';

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
  /** Fields whose winning value this build cannot read. Shown as a notice; never replaced automatically. */
  readonly unreadable: readonly AccountField[];
  /** The last failed save, until it is dismissed or a later save succeeds. */
  readonly failure: string | undefined;
}

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

export function isAccountMigrationDone(): boolean {
  return storageGet(ACCOUNT_SETTINGS_MIGRATED_KEY) !== null;
}

/**
 * Copy the explicitly present legacy keys into the capture key, once, before any bind (db-integrity finding 1). An
 * absent key means the reader never chose, so nothing is captured for it.
 */
function captureLegacy(): void {
  if (isAccountMigrationDone() || storageGet(LEGACY_ACCOUNT_SETTINGS_KEY) !== null) return;
  const captured: Record<string, string> = {};
  const locale = storageGet(LEGACY_LOCALE_KEY);
  const rulership = storageGet(LEGACY_RULERSHIP_KEY);
  const profile = storageGet(LEGACY_PROFILE_KEY);
  if (locale !== null) captured[ACCOUNT_LOCALE_FIELD] = locale;
  if (rulership !== null) captured[ACCOUNT_RULERSHIP_FIELD] = rulership;
  if (profile !== null) captured[ACCOUNT_PROFILE_FIELD] = profile;
  if (Object.keys(captured).length > 0) storageSet(LEGACY_ACCOUNT_SETTINGS_KEY, JSON.stringify(captured));
}

/**
 * The captured legacy values as reconcile candidates of unknown age, parsed with the old lenient parsers and written
 * in the new strict shape. Empty once the move is done.
 */
export function legacyCandidates(): ReconcileCandidates {
  if (isAccountMigrationDone()) return {};
  const raw = parseJson(storageGet(LEGACY_ACCOUNT_SETTINGS_KEY));
  if (!isRecord(raw)) return {};
  const out: Partial<Record<AccountField, { readonly value: JsonValue }>> = {};
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
  return out;
}

/** Finish the one-time move: the guard first, then the capture (a leftover capture with the guard set is harmless). */
export function completeLegacyMigration(): void {
  storageSet(ACCOUNT_SETTINGS_MIGRATED_KEY, '1');
  storageRemove(LEGACY_ACCOUNT_SETTINGS_KEY);
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

function writeCache(store: Store, values: FieldValues): void {
  // A read-only tab's store is never newer than the writer tab's, so it leaves the cache to the writer.
  if (!store.writable) return;
  const key = accountCacheKey(store.dbName);
  if (Object.keys(values).length === 0) storageRemove(key);
  else storageSet(key, JSON.stringify(values));
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
    unreadable,
    failure,
  };
}

function same(a: AccountPreferencesSnapshot, b: AccountPreferencesSnapshot): boolean {
  return (
    a.locale === b.locale &&
    a.defaultRulership === b.defaultRulership &&
    a.failure === b.failure &&
    a.unreadable.join() === b.unreadable.join() &&
    (a.defaultCalculationProfile === b.defaultCalculationProfile ||
      (a.defaultCalculationProfile !== undefined &&
        b.defaultCalculationProfile !== undefined &&
        canonicalJson(serializeAccountValue(ACCOUNT_PROFILE_FIELD, a.defaultCalculationProfile)) ===
          canonicalJson(serializeAccountValue(ACCOUNT_PROFILE_FIELD, b.defaultCalculationProfile))))
  );
}

function recompute(): void {
  legacy = isAccountMigrationDone() ? {} : legacyFields();
  const next = build();
  if (same(next, snapshot)) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function registersOf(store: Store): FieldValues {
  const out: FieldValues = {};
  for (const field of ACCOUNT_FIELDS) {
    const register = store.state.account[field];
    if (register !== undefined) out[field] = register.value;
  }
  return out;
}

function refreshFromStore(): void {
  if (bound === undefined) return;
  fields = registersOf(bound.store);
  writeCache(bound.store, fields);
  recompute();
}

function init(): void {
  captureLegacy();
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
  const writes: { readonly field: AccountField; readonly value: JsonValue }[] = [];
  for (const field of ACCOUNT_FIELDS) {
    if (!(field in changes)) continue;
    const next = changes[field];
    if (next === undefined) continue;
    const value = serializeAccountValue(field, next);
    const current = typed(field);
    if (current !== undefined && canonicalJson(serializeAccountValue(field, current)) === canonicalJson(value)) {
      continue;
    }
    writes.push({ field, value });
  }
  if (writes.length === 0) return;

  const target = bound?.store;
  if (target === undefined) {
    // No store open: this page only, nothing durable (ADR 0004 section 2.4).
    fields = { ...fields, ...Object.fromEntries(writes.map(({ field, value }) => [field, value])) };
    recompute();
    return;
  }

  for (const { field, value } of writes) inflight.set(field, value);
  failure = undefined;
  recompute();
  try {
    await target.mutate(
      writes.map(({ field, value }) => ({ entity: ACCOUNT_ENTITY, entityId: ACCOUNT_ENTITY_ID, field, value })),
    );
  } catch (error) {
    // Roll back only if this store is still the bound one; a newer bind already replaced everything.
    if (bound?.store === target) {
      for (const { field } of writes) inflight.delete(field);
      failure = error instanceof Error ? error.message : String(error);
      recompute();
    }
    throw error;
  }
  if (bound?.store === target) {
    for (const { field, value } of writes) if (inflight.get(field) === value) inflight.delete(field);
    refreshFromStore();
  }
}

/** The signed-out store's preferences, as sign-in candidates. A `null` (reset) is not a choice worth offering. */
export function captureSignInCandidates(anonymous: Store): AccountRegisters {
  const out: Partial<Record<AccountField, AccountRegister>> = {};
  for (const field of ACCOUNT_FIELDS) {
    const register = anonymous.state.account[field];
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
