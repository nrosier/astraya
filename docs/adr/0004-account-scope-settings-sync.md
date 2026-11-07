# 4. Account-scope settings sync through an op-log `account` register

- **Status:** accepted (built in #1066, extended by #1220 with four more fields, section 10; the operator runbook of section 4 is [`docs/ops/ACCOUNT-PREFERENCES-RECOVERY.md`](../ops/ACCOUNT-PREFERENCES-RECOVERY.md))
- **Date:** 2026-11-04
- **Issue:** #1066 (blocks #856)
- **Extends:** [ADR 0002](0002-local-first-with-optional-sync.md) (local-first storage, opaque relay, purge amendment #308)
- **Owner decision already taken (not re-opened here):** build account sync with an op-log `account` register
  ([#1066 comment, 2026-11-03](https://github.com/nrosier/astraya/issues/1066#issuecomment-6630560233)). Reconciliation on
  sign-in follows `docs/ui/UI-UX_GUIDELINES.md` section 3.2.

## 1. Context and goals

`src/ui/settings-registry.ts` documents three settings as `scope: 'account'` (should follow a signed-in user across
devices) while every one of them is a device-local `localStorage` value with `synced: false`. The registry header names
#510 as the owner of the sync; #510 closed on 2026-10-12 without it. #856 deferred the Advanced open or closed state to
the same missing owner.

| Registry key                        | Reader module                           | Writer                                              |
| ----------------------------------- | --------------------------------------- | --------------------------------------------------- |
| `astraya:reportLocale`              | `src/ui/locale.ts`                      | `LanguageToggle.tsx`, `PreferencesView.tsx`         |
| `astraya:rulershipChoice`           | `src/ui/rulership-setting.ts`           | `RulershipSetting.tsx`, `ExtendedSettingsPanel.tsx` |
| `astraya:defaultCalculationProfile` | `src/ui/default-calculation-profile.ts` | `ExtendedSettingsPanel.tsx` ("Save as my default")  |

Goals:

1. These settings sync per account across devices, with no server migration and no `opVersion` bump (ADR 0002:
   "a new domain field ships as a client release").
2. They keep working signed out and offline (guidelines 3.2), and apply locally first.
3. On sign-in, a local choice that is newer than the account's is never silently overwritten (guidelines 3.2).
4. No cross-account bleed (ADR 0002's worst failure mode): one account's preferences never land in another account's
   store, register, cache or prompt.
5. The registry states the truth: after the build, scope, persistence and `synced` agree for every setting.

Non-goals: any change to `OP_VERSION`, `Spine`, `BODY_KEYS`, `UPCASTS`, the relay's tables or routes; moving device-scope
settings (theme, motion, density, symbols, glyphs, degree symbol, workspace rail); per-person registers (#806).

Alternatives rejected by the owner decision, recorded for completeness: a `users` column (needs a server migration, an
API change, and does not work offline or signed out); re-scoping to `'device'` (loses the cross-device behaviour the
guidelines promise).

## 2. Interface and schema contracts

### 2.1 Wire format: unchanged

An account preference is an ordinary operation. Nothing about the envelope changes.

```json
{
  "opVersion": 1,
  "hlc": "<hlc>",
  "deviceId": "<node id>",
  "entity": "account",
  "entityId": "preferences",
  "field": "locale",
  "value": "nl"
}
```

- `entity` is `account`. `entity` and `field` are an open vocabulary (`src/store/ops.ts`), so no `opVersion` bump and no
  `UPCASTS` entry. `BODY_KEYS` and `SPINE_KEYS` are untouched and the release-gate test that pins them stays green.
- `entityId` is the constant `preferences`. It is deliberately not the user id: the account boundary is already the
  per-account IndexedDB database (`astraya-user-<id>`, `src/ui/session-context.tsx`) and the relay's `user_id` scoping,
  and putting an account identifier into the plaintext body would add an identifier to every row for no isolation gain.
  The constant is frozen forever once shipped, because every device must agree on it.
- Both names pass `RESERVED_NAMES`. Value must satisfy `isJsonValue`.

### 2.2 Fields (a closed allowlist for this entity)

| Field                                       | Value                                                                       | Reader validation                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `locale`                                    | `"en"` or `"nl"`                                                            | `CORPUS_LOCALES` (`src/interpretation/schema.ts`)                                                                                                      |
| `defaultRulership`                          | `"modern"`, `"traditional"` or `"both"`                                     | `isRulershipChoice` (`src/astrology/rulership.ts`)                                                                                                     |
| `defaultCalculationProfile`                 | `{ version, settings }`, exactly `serializeCalculationSettings(settings)`   | `readCalculationSettings` strict decoder (`src/domain/person.ts`); a newer or invalid value is `unreadable`                                            |
| `orbLibrary`                                | `{ version: 1, profiles: [...] }`, at most 50 profiles (#1220)              | `readOrbLibraryStrict` (`src/astrology/orb-library.ts`); a dropped profile, a duplicate id or a version other than 1 is `unreadable`                   |
| `orbProfile.<id>`                           | `{ version: 1, ...profile }` or `null`, one per profile (#1250, section 11) | `validateOrbProfileRecord` plus `version: 1` and the field's id equal to the profile's `id`; the library folds from these and the field above          |
| `orbContextSource`                          | `{ version: 1, transit?, synastry?, natal? }` (#1220)                       | `readOrbContextSourceStrict`; a context that is not a string, or a version other than 1, is `unreadable`                                               |
| `transitFilterDaily`, `transitFilterYearly` | `{ version: 1, preset }` or `{ version: 1, custom }` (#1220)                | `readSavedTransitFilter` (`src/astrology/transit-importance.ts`); an unknown preset, a partial custom filter or a version other than 1 is `unreadable` |

Rules:

- `null` means "reset to the Astraya default". Reset is a write, never a delete or a purge (section 3.4).
- The rulership default is its own field, as `person.rulership` is its own register (#806). The existing readers of the
  saved profile use only `.settings` (`PersonFileActions.tsx`, `PreferencesView.tsx`,
  `use-calculation-settings-migration.ts`), so the `rulership` that `parseCalculationSnapshot` also returns is vestigial and
  is not stored in the new field. "Save as my default" writes both fields in one `store.mutate` batch (one durable commit).
- A structured value carries its own version (as `calculationSettings` does). A simple enum gains members by client
  release; an older client sees an unknown member as `unreadable` and keeps the log record. The four #1220 values are
  structured, so each is written with `version: 1` and a reader refuses any other version. A newer build that adds a key
  to one of them must bump the version, so an older build never reads a richer value as a complete one and rewrites it
  without the parts it cannot see (db-integrity review 2, finding B1). Within version 1 an unknown key is not preserved.
- The field names `deleted` and `purged` are reserved on this entity and ignored by its materialiser (section 3.4).
- Any other field name is ignored by the materialiser and kept in the log. The Advanced open or closed state is not an
  account field: it is a device preference (Q1, decided A, [#1066 comment](https://github.com/nrosier/astraya/issues/1066#issuecomment-6638104548)).
  No `advancedOpen.*` fields are defined on `account`.

### 2.3 Store and fold (pure layer)

New pure module `src/store/account.ts` (same role as `src/store/notes.ts`), exports:

```ts
export const ACCOUNT_ENTITY = 'account';
export const ACCOUNT_ENTITY_ID = 'preferences';
export const ACCOUNT_FIELDS: readonly string[]; // locale, defaultRulership, defaultCalculationProfile
export interface AccountRegister {
  readonly value: JsonValue;
  readonly hlc: Hlc;
}
export type AccountRegisters = Readonly<Record<string, AccountRegister>>; // by field, allowlisted only
export function foldAccount(fields: Readonly<Record<string, Register>> | undefined): AccountRegisters;
```

Changes to existing contracts (all additive):

- `fold.ts`: `KNOWN_ENTITIES` gains `ACCOUNT_ENTITY`. `State` gains `readonly account: AccountRegisters`.
  `materialise` reads only `registers.account?.[ACCOUNT_ENTITY_ID]`, ignores `deleted` and `purged` for it, and ignores
  any other `entityId`.
- Snapshot upgrade: `Snapshot.entities` stamps the known kinds and `resume` rebuilds when the set differs
  (`sameKinds`). Adding `account` therefore forces exactly one full rebuild per device on upgrade, the same mechanism #919
  used. No new code.
- Typed decoding lives in a new pure `src/domain/account-preferences.ts` (as `person.ts` holds `readRulership` for the
  fold), so `src/store/` takes no dependency on `interpretation/` or `astrology/`. It returns, per field,
  `{ kind: 'unset' } | { kind: 'value', value, hlc } | { kind: 'unreadable', hlc }`.
- Write guard (db-integrity finding 3): new `assertAccountMutation(mutation)` in `src/store/account.ts`, called next to
  `assertNoteMutation` in `write` (`mutate`) and also in `seedRecords`, for the whole batch before anything is appended.
  For `entity === 'account'` it refuses `field` `purged` or `deleted`, and any `entityId !== 'preferences'`. The relay
  treats any `purged: true` as a purge marker (`server/ops/purge.ts` `isPurgeMarker`), so this is the only thing that
  keeps a buggy setter from deny-listing the user's preferences permanently.
- `Store` interface: `purge`, `remove` and `restore` refuse `ACCOUNT_ENTITY` (throw).
- Receive side (db-integrity finding 4): `receiveIncoming` skips `ACCOUNT_ENTITY` in **both** places. (a) It is not
  collected into `purgedEntities`, so there is no `stripEntity`. (b) It is not passed to the missing-marker fan-out, which
  would otherwise append and push this device's own `account` purge marker (`entitiesPurgedWith('account')` returns
  `['account']`, `src/store/notes.ts`).
- A per-store durable marker accessor (like `getAdoptionDecision`) is added for the reconciliation marker in section 3.6.
- `oplog.ts`, `ops.ts`, `hlc.ts`: no change.

### 2.4 Client runtime (UI layer)

A module-level `account-preferences` store (same `useSyncExternalStore` shape as `locale.ts`) is the synchronous read
path, because `locale.ts` must set `<html lang>` at import time, before IndexedDB opens.

- **Read path (db-integrity blocking finding B1):** every synchronous read goes through the bound store's in-memory value
  (the `account-preferences` store). `localStorage` is read once, at import, for first paint only, and is never a source of
  truth. On the first launch of the new build, before any `bind`, the import-time read falls back to the legacy keys
  while the migration guard is unset (section 5), so an `nl` user sees `nl` on first paint. The fix point is the two
  modules that read `localStorage` directly today:
  - `src/ui/default-calculation-profile.ts`: `readDefaultCalculationProfile` and `snapshot` (lines 47 and 79).
  - `src/ui/rulership-setting.ts`: the rulership read and its fallback (lines 23 and 45).

  Once these read the bound value, the helper-using call sites follow without edits of their own. They are consumers that
  must go through the bound store, not through `localStorage`:
  - `src/ui/use-calculation-settings-migration.ts`: calls `readDefaultCalculationProfile` (line 45) and `readRulershipChoice` (line 50) for the seed inputs.
  - `src/ui/PersonFileActions.tsx`: calls `readDefaultCalculationProfile` for export (line 76).
  - `src/ui/PreferencesView.tsx`: calls `readDefaultCalculationProfile` for export (line 170).

  The change point is the hooks, not only these call sites. `useDefaultCalculationProfile` (`default-calculation-profile.ts`
  line 101), `useRulershipChoice` (`rulership-setting.ts` line 62) and `useCalculationSettingsMigration`
  (`use-calculation-settings-migration.ts` line 85) move to the bound value. Their consumers (`People.tsx`,
  `person-calculation-settings.ts`, `ExtendedSettingsPanel.tsx`, `PreferencesView.tsx`, `CompositeView.tsx`,
  `HoraryView.tsx`, `ReportView.tsx`) are covered transitively. A build check for remaining `localStorage` reads of these
  three keys must therefore run against the hooks and both fix-point modules, not stop at the call sites.

- **Cache layout (replaces the single shared cache, db-integrity finding 2):** one JSON key per database, `astraya:accountSettingsCache:<dbName>`,
  holding only the register fields that are set. First paint reads the entry for the `dbName` that `astraya:lastUserId`
  resolves to, as today. A value and its owner are one write, so there is no ordering race between a tag and its values.
  A `storage` event is applied only for the key of the tab's own bound `dbName`; every other key is ignored. A tab
  signed in as A therefore never reads another tab's signed-out values, and the reverse.
- `SessionProvider` calls `bind(store)` whenever a store becomes the active one (anonymous, account, offline-boot
  fallback, `switchTo`) and `unbind()` when it closes (`handleUnauthorized`, `signOut`).
- `bind` replaces the cache wholesale from `store.state.account`: a field unset in the register removes its cache key
  (default applies). Nothing from the previous store survives a bind. `bind` never reads or writes the legacy capture key
  (section 5).
- `unbind` leaves the cache as it is until the next `bind` (the accepted first-paint case in section 3.5). While no store
  is bound (between `handleUnauthorized` and the next `bind`, when the session status is `opening`), a setter applies
  the value in memory for this page only and writes neither the cache nor any store. This is the same fallback the three
  modules already use when storage refuses a write (db-integrity finding 7).
- A setter (a) applies the value in memory and cache at once, (b) awaits `store.mutate` of one operation per changed
  field, (c) on rejection (read-only tab, over quota) rolls back to the register's value and surfaces the failure through
  the existing status-message pattern. `store.subscribe` feeds register changes arriving from sync back into the cache.
- If `localStorage` refuses writes, the in-memory fallback pattern the three modules already use is kept.

### 2.5 Registry changes (`src/ui/settings-registry.ts`)

- The three account entries become `persistence: 'indexeddb-oplog'`, `synced: true`. The registry key keeps the legacy
  name for the stored value (`astraya:reportLocale`, `astraya:rulershipChoice`, `astraya:defaultCalculationProfile`).
  The cache key is per database (section 2.4) and is not the registry key. The legacy names survive as the one-time
  capture source (section 5) and as the registry identifiers.
- `validateSettings` gains two invariants: `synced: true` requires `persistence: 'indexeddb-oplog'`, and
  `scope: 'account'` requires `synced: true`. Request-scope settings (Tier 2 consent) must remain unpersistable and can
  never be a field of the `account` entity.
- The "#510" references in the module header and `@conventions` are removed.

### 2.6 Relay: no change

`server/` is not modified (ADR 0002, "no server migration, no server deploy"). Verified by reading, to be re-verified by
tests (section 6):

| Server path                                  | Behaviour for `account`                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST/GET /api/ops` (`server/ops/routes.ts`) | Opaque: stored and returned like any op; every query is scoped by `user_id`.                                                                                              |
| `isEntityPurged` (`server/ops/purge.ts`)     | Keyed `(user_id, entity, entity_id)`; the constant `preferences` cannot collide across users because `user_id` is in the primary key (`server/db.ts`, `purged_entities`). |
| `recordPurgeAndErase`                        | Deletes only rows of the same user whose body equals the purged `(entity, entityId)`; a person purge cannot match `account`.                                              |
| `deletion-impact.ts`                         | `KNOWN_ENTITIES = ['person', 'chart']`; `account` ops are ignored by the preview counts.                                                                                  |
| `MAX_OPS_PER_USER = 200,000` (#322)          | Each preference write is one permanent op that counts toward the quota (the log is never compacted).                                                                      |
| Key rotation, encryption at rest             | Generic over the opaque payload; unaffected.                                                                                                                              |

## 3. Semantics

### 3.1 Data flow

```text
setter -> account-preferences (memory + localStorage cache)      apply locally first
       -> store.mutate({entity:'account', entityId:'preferences', field, value})   durable, real HLC
store.subscribe -> state.account -> cache                         sync arrivals update the screen
sync engine (unchanged) <-> relay (unchanged)
SessionProvider: bind(store) on every store switch; cache replaced wholesale
```

### 3.2 HLC and op-log semantics

- Each field is an independent last-write-wins register ordered by HLC (`fold.ts` `applyRecords`). Deterministic,
  idempotent, order-independent; no cross-field atomicity, which is acceptable because the three fields are independent
  by definition.
- Local writes use `store.mutate` (real clock via `tick`). `store.seed` (minimum HLC) is **not** used: a seeded value
  would be treated as older than everything and lose silently, which defeats the sign-in reconciliation rule.
- Clock skew is the existing accepted limitation: a fast device wins until real time catches up, and the relay
  quarantines ops more than 24 hours ahead (`MAX_CLOCK_SKEW_MS`), which the engine reports through `quarantined()`.
- The write rate is low (a setting changes rarely), but the log is append-only and never compacted. Per-keystroke or
  per-toggle writes are not allowed; a setter writes only on a committed change, and never writes an unchanged value.

### 3.3 Which settings are account-scoped

In scope: `locale`, `defaultRulership`, `defaultCalculationProfile` (the registry entries with `scope: 'account'`;
guidelines 3.2 lists language, default rulership and default calculation profile), and, since #1220, the orb library
(`astraya:orbLibrary`), its per-context source (`astraya:orbContextSource`) and the default transit-filter profile
(`astraya:transitFilter:<context>`, two fields: `transitFilterDaily` and `transitFilterYearly`). The owner decided on #1149
(2026-11-06) that these are account scope, following guidelines 3.2. Every registry entry with `scope: 'account'` is now
`indexeddb-oplog` and `synced: true`, and `ACCOUNT_SYNC_TRACKED_ELSEWHERE` is empty.

Not in scope, unchanged: every `scope: 'device'` entry; `person.*` (already in the op log); the Tier 2 consent
(`request`, never persisted).

Decided: the Advanced open or closed state is a device preference, not account scope (Q1, option A). The orb library and
transit-filter default were first tracked as a separate issue, #1149 (Q4, option A), and built in #1220 (section 10).

### 3.4 Conflict rules

| Situation                                             | Rule                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same field edited on two devices                      | Higher HLC wins (`fold.ts`); both devices converge to the same value.                                                                                                                                                                                                                                                                                                                                           |
| Different fields edited on two devices                | Independent; both survive.                                                                                                                                                                                                                                                                                                                                                                                      |
| Reset on one device, set on another                   | Reset is `null` and is an ordinary LWW write.                                                                                                                                                                                                                                                                                                                                                                   |
| Winning value is unreadable (newer client, bad value) | Treated as unset for application; the field is flagged `unreadable` and a notice names it. It is never replaced automatically, only by an explicit user change (mirrors guidelines 3.1). The record stays in the log.                                                                                                                                                                                           |
| `deleted` or `purged` written for `account`           | Ignored by the materialiser. `Store.purge('account', ...)` throws. A peer's purge marker for `account` is ignored on receive. Rationale: the relay's deny-list would otherwise refuse every later preference write for that user permanently and report them as skipped (`server/ops/routes.ts`), and `stripEntity` would erase the local register.                                                             |
| Unknown field on `account`                            | Kept in the log, ignored by the fold (forward compatibility).                                                                                                                                                                                                                                                                                                                                                   |
| Older client receives `account` ops                   | Counts them as `unknownEntity` and keeps them in its log (`receiveRecords`). It never forwards them, because the engine pushes only records with its own `deviceId` (`src/sync/engine.ts` `ownOutgoing`). Nothing is lost: the relay already holds them. An older build that receives an `account` purge marker would strip its local `account` records; harmless, since older builds never write or read them. |

### 3.5 Sign-out, account switch, shared device

- Each IndexedDB store owns its own `account` register: the anonymous (signed-out) store and each `astraya-user-<id>`
  store. A signed-out user's preference changes are written to the anonymous store's register, so they work offline and
  signed out.
- Signing out unbinds the account store and binds the anonymous store; the cache is replaced from the anonymous register.
  Nothing is copied from the account store to the anonymous store (a copy would leave an account's preferences behind on a
  shared device). This is the decided behaviour (Q2, option A).
- Signing in as a different account binds that account's store; the previous account's cache is gone at bind time. Between
  page load and bind, first paint may show the previous cache (the last used account in the common case); this is cosmetic
  and low-sensitivity, and is replaced as soon as the store is ready.
- Adoption (#109) must exclude `account` records everywhere it uses the anonymous store's `outgoing()`: the emptiness
  check and the count in `completeSignIn`, and the push and the `switchTo` merge in `resolveAdoption`. Otherwise an
  accepted adoption would push them raw and let LWW overwrite silently. Preferences go only through section 3.6.

### 3.6 Reconciliation on sign-in (guidelines 3.2)

Guideline text: apply locally first; on sign-in "adopt or reconcile local and remote values explicitly"; "do not silently
overwrite a newer local choice". A legacy `localStorage` value has no timestamp, so its age is unknowable and it cannot
be compared by LWW; an op-log value has an HLC and can.

One function, two entry points. `reconcile(candidates, target)` runs per field, after the account's first completed sync
(so remote state is known; same gate as `use-calculation-settings-migration.ts`):

1. Candidate absent or `null`: nothing.
2. Target unset (no register at all): write the candidate to the target (no conflict, nothing overwritten). A `null`
   target is an explicit reset with an HLC and is **not** unset; it goes through rules 3 to 5 (db-integrity finding 5).
3. Values equal (canonical JSON): nothing.
4. Candidate has an HLC and it is older than the target's: the account's choice is newer; keep it, no prompt.
5. Otherwise (candidate newer, or age unknown): **prompt once** listing only the differing settings, each with the two
   values and a choice of "Use this device's" or "Use my account's". The choice is applied as an ordinary write (real
   HLC) when the device's value is chosen, and as no write when the account's is chosen. Dismissing equals "Use my
   account's".

Entry points:

- **Sign-in transition** (anonymous to account, in `completeSignIn`): the candidates are the anonymous store's `account`
  register, captured **before** `switchTo` closes the anonymous store. A per-account durable marker (in the account
  store) records the newest candidate HLC already reconciled; a later sign-in prompts only for candidates newer than it,
  so declining does not re-prompt forever.
- **Legacy `localStorage` migration** (first launch of the new build): see section 5.

The prompt is a UI primitive with i18n parity (`*.messages.ts` en and nl); the spec fixes only its contract:
`ReconcileProposal { field, deviceValue, accountValue }[]` in, `Resolution { field, use: 'device' | 'account' }[]` out.

### 3.7 Tabs, offline, failure modes

- Only the writer tab can write (`src/store/tab-lock.ts`, #311). A read-only tab's setter fails with the existing
  `NOT_WRITABLE` message and rolls back; the writer tab's register changes reach it through the `storage` event.
- Offline boot uses the cached account's store (`LAST_USER_KEY`); its register applies; no engine until `online`.
- Demo mode (no server) uses the anonymous store only.
- `removeAccountData` deletes the account database including its register, and deletes that account's per-database cache
  entry (`astraya:accountSettingsCache:<dbName>`); the next sign-in re-syncs the register from the relay.
- On sign-out (`signOut`, and `handleUnauthorized` when the session ends), the signed-in account's per-database cache
  entry (`astraya:accountSettingsCache:<dbName>`) is deleted, so a shared device keeps no account's preferences in
  browser storage after sign-out. The account's register stays in its IndexedDB store and re-syncs on the next sign-in.
- Durable-write failure (quota, IndexedDB error): setter rolls back and reports; no partial state.

## 4. Boundary and security rules

- Auth: unchanged. Both relay routes sit behind `requireUser`; every `ops` query filters by `user_id`.
- Sensitivity: these values are not birth data (`sensitive: false` in the registry) and are encrypted at rest on the
  server like every payload (AES-256-GCM, `server/ops/crypto.ts`).
- Validation: `decode`/`readBody` shape checks and `isJsonValue` at write time; typed per-field validation at read time;
  an invalid value is never coerced to a default (it is `unreadable`).
- Cross-account bleed controls (ADR 0002 requires a dedicated test): (a) one register per store, never merged across
  stores except through the explicit prompt; (b) cache replaced wholesale at bind; (c) nothing copied from account to
  anonymous at sign-out; (d) `account` excluded from adoption; (e) the relay's per-user scoping (section 2.6).
- Residual risk, accepted and stated: a signed-in user's own modified client can write a purge marker for `account`
  directly to the relay. The relay's deny-list would then refuse that user's later preference writes. The impact is
  confined to that user's own preferences (no cross-user path). Closing it would require the relay to learn which
  entities are purgeable, which erodes the opaque-relay rule; not recommended.
- Recovery runbook (db-integrity finding 6), to be added to `docs/ops/` by the build: the client-side signal is that
  preference HLCs come back in the push response's `skipped` list and the engine's `quarantined()` count grows after a
  preference change. Recovery is an operator action: delete the `purged_entities` row for
  `(user_id, 'account', 'preferences')`, then the user changes the preference again on any device. The relay already
  erased the old rows, so only new writes come back; the quarantined HLCs stay quarantined by design.

## 5. Migration

- **Wire and server:** none. `OP_VERSION` stays 1, no `UPCASTS` entry, no relay deployment, no database migration.
- **Snapshots:** one automatic full rebuild per device on upgrade (section 2.3).
- **Legacy `localStorage` values** (explicitly present keys only; an absent key means the user never chose, so nothing is
  migrated for it). Guarded by one global key `astraya:accountSettingsMigrated` (set only after the write or reconcile
  succeeds), because `localStorage` itself is global to the browser.
  - Capture first (db-integrity finding 1). Once the cache becomes bind-driven, `bind` would erase the legacy keys before
    the migration reads them. On the first launch of the new build, the import-time read falls back to the legacy keys
    while the guard is unset (section 2.4), so first paint is correct before the capture and bind run. So at module import of the new build, before any `bind`, and only while the guard is unset
    and the capture key is absent, copy the explicitly present legacy values into `astraya:legacyAccountSettings` (JSON).
    The migration reads **only** this capture key, never the live cache keys. It is deleted only in the same step that
    sets the guard. A tab closed before the first sync therefore loses nothing, and a sign-out mid-migration cannot feed
    one account's cached values into the anonymous store.
  - Anonymous at first launch of the new build: write the explicit values into the anonymous store's register with
    `store.mutate`. They later reach an account through section 3.6.
  - Signed in at first launch (owner decision, 2026-11-04, [#1066 comment](https://github.com/nrosier/astraya/issues/1066#issuecomment-6643499602),
    "move them into the account once"): on first sign-in, the device's existing language, rulership and calculation-profile
    values are offered once in the one prompt and written to the account if accepted. They are candidates (age unknown)
    for that account through `reconcile`, after its first sync.
  - Ownership of the shared legacy capture: the capture belongs to the account that completes the one-time prompt. If the
    user switches accounts before the first sync, or signs out and in as a different account before answering, the prompt
    is shown again for the account that signs in, and the capture is not written to any other account. Nothing from the
    capture reaches an account that did not answer the prompt. Consequence of the owner's decision above; the guard stays
    global until a prompt is answered.
  - Shared device: legacy keys were device-wide, so values set by another person on this browser can appear in the
    signed-in account's prompt. This is the device scope those keys always had, not a new bleed path, and the prompt
    makes it explicit rather than silent (db-integrity finding 9).
  - The legacy value is parsed with the existing lenient parsers (`isLocale`, `isRulershipChoice`,
    `parseCalculationSnapshot`) and written in the new strict shape.
- **Second generation of legacy values (#1220).** Most devices already set `astraya:accountSettingsMigrated` when the
  #1066 build first ran, so the orb library, its source and the two transit filters, which were `localStorage` keys of
  their own (`astraya:orbLibrary`, `astraya:orbContextSource`, `astraya:transitFilter:daily` and `:yearly`), get their own
  capture key `astraya:legacyAccountSettingsV2` and guard `astraya:accountSettingsMigratedV2`. Each generation is
  captured and guarded on its own; both go into the one reconcile plan and are retired together. They are parsed with the
  old lenient readers (a bad profile is dropped, a damaged filter is skipped), offered only when non-empty, and written
  in the new versioned shape.
- **Downgrade then upgrade:** an older build writes only `localStorage`; on the next upgrade the guard is already set and
  the register wins at bind. Rare; the older build's changes in that window are lost. Accepted. For the #1220 fields, a
  build older than #1220 still reads and writes the old device keys, which a #1220 build no longer reads: edits made
  there are not carried to the account, and the stale device values are never offered again once the guard is set.
- **Rollout order:** any. Devices on the old build ignore the `account` ops and keep working with device-local settings.

## 6. Verification strategy

Acceptance (maps to the #1066 checklist; to be copied into the build issue as `- [ ]` items):

- [ ] Registry scope, persistence and `synced` agree for every setting; "#510" references removed; the two new
      `validateSettings` invariants have tests (`test/ui-settings-registry.test.ts`).
- [ ] `locale`, `defaultRulership`, `defaultCalculationProfile` sync between two signed-in devices, and keep working
      signed out and offline.
- [ ] Sign-in reconciliation follows section 3.6, including the "newer local choice is never silently overwritten" case.
- [ ] `OP_VERSION`, `BODY_KEYS`, `SPINE_KEYS`, `UPCASTS` unchanged; `server/` unchanged.
- [ ] db-integrity review verdict (section 8) recorded and every blocking finding resolved before the build starts.
- [ ] `npm run check` passes with zero warnings; affected Playwright specs pass (UI change: prompt and preference
      controls).

Required test scenarios:

1. Fold (`test/store-fold.test.ts`): `account` folds by HLC in both arrival orders; reapplying is idempotent; `deleted`
   and `purged` are ignored; a non-`preferences` entityId is ignored; unknown field kept; an old-build known-set fixture
   counts the records as `unknownEntity` and a snapshot with the old stamp is rebuilt once.
2. Ops (`test/store-ops.test.ts`): `newRecord` accepts an `account` op at `OP_VERSION` 1; the existing key-pin release gate
   is unchanged.
3. Store (`test/store-store.test.ts`): `purge`, `remove` and `restore` for `account` throw; `mutate` and `seed` refuse
   `purged`, `deleted` and a non-`preferences` entityId for `account`, leaving the log untouched for the whole batch;
   `receive` of an `account` purge marker erases nothing and appends no marker of its own; durable-before-notify holds
   for the new field; read-only tab setter rolls back.
4. Server (`test/server-ops.test.ts`): `account` ops round-trip; two users with the same `(account, preferences)` never
   see each other's rows; a person purge for user A leaves A's `account` rows; the deny-list is per user; the
   deletion-impact preview ignores `account`; key rotation re-encrypts `account` rows.
5. Sync (`test/store-sync-properties.test.ts`, `test/sync-engine.test.ts`): two devices edit the same and different
   fields offline, converge byte-identically; a device on the old fold set keeps and forwards the records.
6. Cross-account bleed (dedicated, per ADR 0002): sign in as A, set language and default profile, sign out, sign in as B
   on the same browser; B's store, register, cache and any prompt contain none of A's values. Two tabs: tab 1 signed in
   as A, tab 2 signs out; tab 1 keeps A's values and tab 2 never shows them (per-database cache key). Tab 2, bound to the
   anonymous store, saves a default profile; tab 1 then re-renders and creates a person, and the new person gets A's
   default, not the anonymous store's (B1: reads go through the bound value).
7. Reconcile matrix: candidate absent, target unset, equal, candidate older, candidate newer, legacy (age unknown),
   dismiss, repeat sign-in with the marker, adoption excludes `account` records.
8. Migration: explicit legacy keys migrate, absent keys do not, guard set only after success, malformed legacy value is
   repaired by the lenient parser and written strictly. Bind before migration: the capture key survives a `bind` that
   empties the cache. Tab closed before the first sync: values migrate on the next launch. Sign-out mid-migration: the
   anonymous store receives nothing from A's cache.
9. i18n parity for the prompt and notice strings; MAP.md entries for new files; `docs/ops/DEPENDENCIES.md` unchanged
   (no new dependency).

## 7. Decided questions

All four questions are decided. Each answer is recorded on #1066 (linked under each question) and is not re-opened here.

- **Q1. Scope of the Advanced open or closed state (#856).** Options: (A) device preference, recommended; (B) account
  register fields `advancedOpen.<tab>`; (C) not remembered. Why A first: guidelines 3.3 reserves device scope for choices
  that reasonably differ by screen, #856's current acceptance already says device, and each toggle would be a permanent
  op in a log that is never compacted.
  **Decided: A.** The Advanced open or closed state is a device preference, not an account setting
  ([#1066 comment](https://github.com/nrosier/astraya/issues/1066#issuecomment-6638104548)).
- **Q2. What a signed-out user sees right after sign-out.** Options: (A) the signed-out store's own values, defaults if
  none, with nothing copied from the account, recommended; (B) keep the account's values in effect by copying them into
  the signed-out store. Why A first: B leaves an account's preferences on a shared device after sign-out, and the
  db-integrity review found that B conflicts with bleed controls (a) and (c) in section 4: a later account signing in on
  that browser would be prompted with the first account's values.
  **Decided: A.** After sign-out the user sees the signed-out store's own values, or defaults if none; nothing is copied
  from the account ([#1066 comment](https://github.com/nrosier/astraya/issues/1066#issuecomment-6638104548)).
- **Q3. Prompt shape when a newer local choice differs.** Options: (A) one prompt listing only the differing settings,
  recommended; (B) account always wins with a notice; (C) this device always wins with a notice. Why A first: it is the
  only option that satisfies "explicitly" and "not silently overwrite a newer local choice" for values whose age is
  unknown.
  **Decided: A.** One prompt at sign-in, listing only the settings that differ
  ([#1066 comment](https://github.com/nrosier/astraya/issues/1066#issuecomment-6638104548)).
- **Q4. Orb library and transit-filter default.** Guidelines 3.2 names "orb profile" and "default transit-filter
  profile" as user scope, but the registry omits the orb library entirely and files the transit filter as `page` scope.
  Options: (A) track as a separate issue, recommended; (B) include now. Why A first: larger JSON shapes, no registry
  entry yet, and adding fields later needs no format change.
  **Decided: A.** The orb profile and transit-filter scope mismatch is tracked as a separate issue
  ([#1066 comment](https://github.com/nrosier/astraya/issues/1066#issuecomment-6638104548)). #1149 later decided account
  scope for all three, with their sync tracked in #1220 (see 3.3).

## 8. db-integrity review

Review history: `db-integrity` review 1 (2026-11-04) ran against the first draft and returned APPROVE WITH CONDITIONS. Its
conditions were incorporated, and the re-review (APPROVE on the revised text, [#1066 comment 6643980712](https://github.com/nrosier/astraya/issues/1066#issuecomment-6643980712))
found no blocking conditions. The findings below are the review 1 record. Review 1 verified the claims
against `src/store/{oplog,ops,fold,hlc,store,notes}.ts`, `server/ops/{routes,purge,deletion-impact}.ts`, `server/db.ts`,
`src/sync/engine.ts` and `src/ui/session-context.tsx`, and ran no tests.

**Verdict: APPROVE WITH CONDITIONS.** The wire contract, the relay's per-user scoping and the purge deny-list are safe
for `account`/`preferences`. The conditions were three blocking findings. All nine findings are incorporated above:

| #   | Severity     | Finding                                                                                           | Where addressed                              |
| --- | ------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Blocking     | Bind-driven cache erases the legacy values before the migration reads them                        | Section 5 (capture key), test 8              |
| 2   | Blocking     | One global cache shared by tabs bound to different stores                                         | Section 2.4 (per-database cache key), test 6 |
| 3   | Blocking     | `purged`/`deleted` refused only in `purge()`; `mutate`/`seed`/`remove`/`restore` still write them | Section 2.3 (write guard), test 3            |
| 4   | Non-blocking | Receive-side purge fan-out must skip `account` in two places                                      | Section 2.3, test 3                          |
| 5   | Non-blocking | Reconcile rule 2 treated a `null` reset as unset                                                  | Section 3.6 rule 2                           |
| 6   | Non-blocking | No recovery path for a deny-listed `account`                                                      | Section 4 runbook                            |
| 7   | Non-blocking | Setter behaviour while no store is bound was undefined                                            | Section 2.4                                  |
| 8   | Non-blocking | Older clients keep but do not forward `account` ops                                               | Section 3.4                                  |
| 9   | Non-blocking | Legacy shared-device values; Q2(B) conflicts with bleed controls                                  | Section 5, Q2                                |

Its answer to the owner's precondition: purge, the `purged_entities` deny-list, `deletion-impact` and per-user scoping all
handle a non-person entity. Every `ops` query filters by `user_id`. `purged_entities` is keyed
`(user_id, entity, entity_id)`. `recordPurgeAndErase` matches both `entity` and `entityId`, so a person purge cannot touch
`account`. `deletion-impact` ignores the kind. The one real risk is a client sending an `account` purge marker, and
findings 3 and 4 close that.

The reviewer could not verify some claims from the files it read: the registry contents, guidelines section 3.2, which
fields the profile readers use, and key rotation. The author checked the first three against `src/ui/settings-registry.ts`,
`docs/ui/UI-UX_GUIDELINES.md` and the three reader call sites. Key rotation (`server/ops/rotate-key.ts`) is covered by
test 4 rather than by reading. The re-review confirmed the conditions as met on the revised text.

### 8.1 Review 2 (#1220, 2026-11-06)

`db-integrity` reviewed the four added fields and returned **BLOCK**, then the findings below were fixed. The wire
contract, the relay, the purge paths and the cross-account controls were unchanged and correct for the new fields.

| #   | Severity     | Finding                                                                                                                  | Where addressed                                                         |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| B1  | Blocking     | The three new structured values carried no version, so an older build rewrote a newer build's richer value and lost data | Section 2.2 rules: `version: 1`, other versions `unreadable`; tests     |
| B2  | Blocking     | Saving a 51st profile made the whole library unreadable on every device, and the next save replaced it                   | The editor refuses a 51st profile (`MAX_ORB_PROFILES`); test            |
| B3  | Blocking     | An unreadable library or source could be overwritten from an editor that showed it empty                                 | The editor is read-only while the value is unreadable; test             |
| B3b | Blocking     | The sign-in prompt showed an unreadable account value as the default                                                     | `ReconcileProposal.accountUnreadable`; the prompt names it; test        |
| N1  | Non-blocking | `serializeAccountValue` ran a JSON round trip before the JSON check, so a NaN became a null                              | The check runs on the value as it stands; a non-JSON value throws; test |
| N2  | Non-blocking | The ADR was not amended                                                                                                  | This section and section 10                                             |
| N3  | Non-blocking | Storage is not bounded in bytes                                                                                          | Accepted, section 10                                                    |
| N4  | Non-blocking | The first-paint cache was rewritten on every store notification                                                          | Written only when its text changed                                      |
| N5  | Non-blocking | A stale older-build tab can briefly hide the new fields in a read-only tab                                               | Accepted, section 10                                                    |
| N6  | Non-blocking | Removing a profile was two commits                                                                                       | One `setAccountPreferences` call with both fields                       |
| N7  | Non-blocking | A legacy value reaches an account that never set the field without a prompt                                              | Accepted, section 10                                                    |

## 9. Build notes (#1066)

Choices the build made where the text above leaves room. None changes the wire contract, the relay, or a decided question.

- **Legacy values after bind.** Until the global guard is set, a field the bound store has never written shows the captured legacy value, not only on first paint. Without this, binding the store on the first launch would show the Astraya default until the one-time move finishes (for an account, until its first sync). It is the device scope those values always had (section 5, finding 9). A field the store has written, including a `null` reset, always shows the store's value.
- **Read-only tabs.** A tab whose store is read-only never writes the first-paint cache. It reads the writer tab's changes from the cache through the `storage` event.
- **Prompt default.** Each differing setting in the reconcile prompt starts on this device's value, which is the newer one or the one of unknown age. Dismissing still means "Use my account's".
- **Offline account store.** An account store reconciles only once its sync engine reports `synced`. A store opened offline at boot, with no engine yet, waits.
- **Registry exception.** `validateSettings` requires `synced: true` to mean `persistence: 'indexeddb-oplog'`, and `scope: 'account'` to mean `synced: true`. An account-scope entry whose sync is not part of the build can be named in `ACCOUNT_SYNC_TRACKED_ELSEWHERE` with its issue, so the gap is visible and not silent. The list held the transit filter, then the orb library and its source (#1149), and has been empty since #1220.
- **Test 4.** The relay tests cover the round trip, per-user isolation, a person purge leaving `account` rows, and a deny-listed `account` entity confined to its user, with the recovery step. The deletion-impact preview and key rotation are generic over the payload and have no `account`-specific test.

## 10. Amendment: the orb library, its source and the saved transit filters (#1220)

Four more fields on the same entity (section 2.2), by the owner's decision on #1149. Nothing about the envelope, the
spine, `OP_VERSION`, `BODY_KEYS`, `UPCASTS` or the relay changed: the field names are the only new frozen contract, and
they do not collide with the reserved `deleted` and `purged`.

- **Shapes.** Each is a versioned plain-JSON value (section 2.2). The library was rewritten whole on each staged save;
  **section 11 (#1250) replaced that with one register per profile**, so the next two bullets and the 50-profile reader
  rule describe the #1220 build. The editor still refuses a new 51st profile.
- **Size.** There is no per-op or body limit in `src/store/ops.ts` below the depth cap (16; the library nests about 5).
  A maximal library is roughly 100 KB of JSON, under the push batch budget (256 KB, and one oversized op is sent alone)
  and the server's 1 MB body limit. `MAX_OPS_PER_USER` counts ops, not bytes, so a save is one op whatever its size. Each
  save keeps up to about 100 KB permanently in IndexedDB and on the relay, which is accepted at the staged save rate.
- **Readers and screens.** `orb-library-store.ts` and `useTransitFilter` read the `account-preferences` snapshot and save
  through `setAccountPreferences`; nothing reads these values from `localStorage` any more. An unreadable value reads as
  empty, is listed in the unreadable notice, and the library editor is read-only for it, so a save can never replace a
  value the reader cannot see (the single-value fields of #1066 are replaced by an informed choice; a collection is not).
- **Migration.** A second capture generation, section 5. The sign-in prompt shows the new fields with readable
  summaries, and names an account value this build cannot read instead of calling it the default.
- **Accepted limits.** (a) Rule 2 writes a legacy device value into an account that never set the field without asking, so
  on a shared browser the first account to sign in after the upgrade receives that browser's orb library (the device scope
  those keys always had; finding 9). (b) While a #1066-build tab and a #1220-build tab are open together, the older tab's
  three-field cache can briefly hide the four new fields in the newer tab's `storage` handler; nothing is lost in the log.
  (c) A pre-#1220 build ignores the four fields and keeps its own device values (section 5, downgrade).

## 11. Amendment: the orb library is one register per profile (#1250)

The db-integrity review of #1220 found that the whole orb library was one last-write-wins value, so a profile added on
one device while offline was lost when another device saved later (defect A). The owner decided on #1250 (2026-11-07):
each profile is its own synced value, keyed by its id, so concurrent additions merge. This amends sections 2.2 and 10.

- **Wire contract: unchanged.** Still the one entity `account`/`preferences`, still ordinary operations, `OP_VERSION` 1,
  no change to the spine, `BODY_KEYS`, `UPCASTS`, the relay or `src/store/{ops,oplog,hlc}.ts`. The only new frozen
  contract is a field-name family on the existing open `field` vocabulary: **`orbProfile.<profile id>`**, where the id
  matches `^[A-Za-z0-9_-]{1,64}$` (the profile id rule). The prefix `orbProfile.` is frozen forever once shipped. It does
  not collide with the reserved `deleted` and `purged`, or with any existing field.
- **Value.** `{ version: 1, id, name, revision, scalePercent, aspectOrbs, bodyOrbs }`: one profile, the same record the
  library held, plus the version every structured value carries. `null` removes the profile (a write, never a delete or
  a purge, section 3.4). The `id` inside the value must equal the id in the field name; a mismatch is unreadable.
- **Fold (`foldOrbLibrary`, `src/domain/account-preferences.ts`).** `store/account.ts` materialises every well-formed
  `orbProfile.<id>` register next to the allowlisted fields; a malformed name stays in the log and is ignored. The library
  is the whole-library `orbLibrary` register (the shape before #1250, the **base**) with each `orbProfile.<id>` register
  that is **newer than the base** layered on it: a value sets that profile, a `null` removes it. A profile register older
  than the base is superseded by it, so a replacement (the sign-in prompt writing the whole library) is never undone by
  a stale part. The result depends on HLC order only, not on arrival order, and reapplying changes nothing.
- **What the screens still see.** One `orbLibrary` value: `orbLibraryRegister` presents the folded library as a
  synthetic whole-library register stamped with the newest of its parts. The first-paint cache, the snapshot, the
  reconciliation and the notices read that, so none of them changed shape.
- **Writes.** A save writes only the profiles that changed (`orbLibraryWrites`): a value for each new or edited profile,
  a `null` for each removed one. A library the store never wrote (a legacy device value shown before the move) is
  written in full. Nothing writes the whole-library `orbLibrary` register any more except the sign-in reconciliation,
  which replaces the library as a unit by the reader's explicit choice.
- **Concurrent edits.** Two devices that each add a profile write different fields, so both profiles survive. An edit of
  one profile and a removal of another both stand. Two devices that edit the same profile still resolve last-write-wins
  for that profile, and the later revision number wins with it (the earlier edit is superseded, as before; accepted).
- **Id collisions.** The ids are random (#1254), so a collision is not expected. If one happens, it costs only that
  profile (last write wins) and never another profile; a context's source naming an id falls back to the card when no
  such profile exists (`sourceForContext`).
- **The 50-profile cap.** The editor still refuses a new 51st profile. The reader no longer requires at most 50: two
  devices can each add profiles up to the cap, and a library that grew past 50 by merging must stay readable and
  editable, or one more device's save would make everyone's library unreadable. A profile can still be edited or
  removed over the cap. Size grows with the profile count, not with each save: a save is now one small op per changed
  profile (about 1 to 2 KB), where it was the whole library (about 44 to 137 KB, section 10), so the per-save storage
  cost drops by about two orders of magnitude.
- **Migration.** None needed for stored data. An existing whole-library `orbLibrary` register is read as the base and
  keeps working; the first edit after the upgrade writes per-profile registers newer than it. The legacy `localStorage`
  capture (section 5) is unchanged and still produces a whole-library candidate for the prompt. **Older builds** (the
  #1220 build) read only `orbLibrary`, so they show the base, not the profiles added or removed since: their view of the
  library is stale until they update, and an edit they make rewrites the whole library as a newer base, which replaces
  newer per-profile registers (the loss this section removes, for the window in which both builds run; accepted, as the
  #1220 build shipped on 2026-11-07). The same window has one more case: on an account with no `orbLibrary` base yet (only
  `orbProfile.*` registers), a device on the older build shows an empty library, and a save there can overwrite newer
  per-profile registers. This is accepted, for the same reason: the older build has no way to read per-profile registers,
  and the window closes when that build is updated.
- **Triage of D and E (#1250), with reasons.**
  - **D, accepted.** The prompt still chooses the library and its source on their own. A source that names a profile the
    chosen library lacks falls back to the card (`sourceForContext`), so nothing breaks and no profile is lost; the
    reader sees the card's orbs for that context and can choose again. Grouping the two choices would change the
    prompt's design for a rare case. The pre-#1220 `astraya:orbLibrary` device key is deliberately left in place: it is
    the rollback copy for a downgrade (section 5), and deleting a reader's data without being asked is the larger risk.
  - **E, deferred to the next change to the sync or the relay.** `GET /api/ops` returns at most 500 rows with no byte
    cap. It is the pull-side counterpart of the push cap (#919), lives in `server/ops/routes.ts` (a frozen-contract
    review file), and is not made worse by this change: per-profile ops are smaller than the whole-library op they
    replace. Tracked on #1250's comments.
