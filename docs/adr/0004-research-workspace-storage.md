# 4. Research workspace storage: saved queries, pins and annotations

- **Status:** proposed (seven owner decisions open, see "Open owner decisions"; `db-integrity` verdict: approve with changes, applied)
- **Date:** 2026-11-04
- **Issue:** #1061 (split from #616, decision 5)
- **Builds on:** ADR 0002 (local-first, frozen spine, opaque relay), `docs/ui/UI-UX_GUIDELINES.md` section 3

## 1. Context and goals

The research workspace lets a reader keep results from the research tools (today: Event search, `src/ui/EventSearchView.tsx`).
It has three parts, shipped as slices:

1. **Saved queries.** Save the parameters of an event search under a name, list them, reopen one. **First slice.**
2. **Pins.** Mark a result as worth keeping. Follow-up slice.
3. **Annotations.** Free text attached to a pin. Follow-up slice.

This note settles which entities exist, whose data each is (scope), how each syncs, and whether the operation log
must change. It fixes slice 1 completely. Slices 2 and 3 are fixed only to the level that stops slice 1 from
painting them into a corner; each needs a short addendum to this note before it starts.

Constraints that are not negotiable here:

- ADR 0002: the spine (`opVersion`, `hlc`, `deviceId`) is frozen forever and only the body is versioned; the relay is
  opaque; nothing is ever dropped; cross-account data bleed is the worst failure mode.
- Guidelines section 3: every stored thing has an owner and a lifetime; page state is not written to `localStorage`
  unless the user explicitly chooses to.
- `docs/ui/UI-UX_IMPLEMENTATION_PLAN.md` section 4 (storage contracts): do not bump `OP_VERSION` for UI work.
- Domain integrity: no invented numbers. Any limit below either cites an existing constant or is an owner decision.

### Result in one paragraph

Saved queries are **user data owned by the account**, stored as a **new entity kind `savedQuery` in the existing
operation log**, with no change to the envelope, the spine, `OP_VERSION`, `oplog.ts`, `ops.ts`, `hlc.ts`, the sync
engine or the relay. The store code that changes is the **fold** (`src/store/fold.ts`), which must learn the new
kind; the **write guard** (one call in `Store.write()` in `src/store/store.ts`); one id prefix (`src/domain/id.ts`);
and one new pure module (`src/store/saved-queries.ts`). Section 3.1 lists every file. That is the same shape as the
#919 notes change. Because the fold changes, the `db-integrity` review in section 6 is required and its verdict is
recorded there.

## 2. Entities, scope and sync

### 2.1 Scope table (guidelines section 3)

| Entity       | Scope           | Why this scope                                                                                                                                | Persistence             | Sync                                         | Slice |
| ------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------- | ----- |
| `savedQuery` | User / account  | A reader's stable working set, independent of any person. Event search is person-independent by design (`src/domain/event-search.ts` header). | IndexedDB operation log | With the account's other ops, when signed in | 1     |
| `pin`        | User / account  | A pin on a sky event is person-independent. A pin on person-derived output is not; see 2.4.                                                   | IndexedDB operation log | As above                                     | 2     |
| `annotation` | Follows its pin | Text the user writes is potentially sensitive and must die with whatever it describes. See 2.4.                                               | IndexedDB operation log | As above                                     | 3     |

None of these is **person** scope in slice 1: a saved event-search query contains no birth data, so it must not be
filed under a person, and a person purge must not touch it. None is **device** scope under the recommended answer to
open decision D1; the device-scope alternative is specified in 2.5 so the owner can choose between two complete designs.

### 2.2 Why the operation log, and not `localStorage`

- Guidelines section 3 puts user-owned, cross-device working data in the User/account row: "Local-first; sync across
  the user's devices when signed in". It works signed out, and anonymous use stays private because nothing leaves the
  device (ADR 0002).
- The operation log already supplies what a hand-rolled store would have to rebuild: per-account database separation
  (`store.dbName`), the cross-account-bleed guard (#109), the adoption flow, durable-before-notify writes, multi-tab
  write exclusion, HLC ordering, tombstones with undo, and erasure that reaches peers and the relay (#308).
- Every other registry entry that is `'account'`-scoped but device-local today (`src/ui/settings-registry.ts`:
  language, rulership choice) is a documented gap that Phase 3 (#510) exists to close. New account-scoped data should
  not add to that gap.

The 2026-10-17 investigation comment on #616 suggested "device-local" for this first slice. That predates the owner's
2026-10-20 decision 5 and the issue's own acceptance criterion ("scope and sync per guidelines section 3"); it is
treated here as a suggestion, not a decision, and open decision D1 asks the owner to confirm.

### 2.3 Slice 1 entity: `savedQuery`

One entity per saved query. The `entityId` is the query's own id, so purging a query erases exactly that query.

| Register     | Field name   | Value                                     | Merge                                             |
| ------------ | ------------ | ----------------------------------------- | ------------------------------------------------- |
| Name         | `name`       | JSON string                               | Last write wins (LWW), like every field           |
| Definition   | `definition` | JSON object, see 3.2; one atomic register | LWW as a whole value, never merged field by field |
| Tombstone    | `deleted`    | `true` / `false` (`DELETED_FIELD`)        | LWW; undo is another write                        |
| Purge marker | `purged`     | `true` (`PURGED_FIELD`)                   | Once set, never unset                             |

Design choices and the reasoning behind them:

- **The definition is one register.** If each parameter were its own register, a query edited on two devices could
  fold to a combination (dates from one, bodies from the other) that nobody ever saved and that does not reproduce
  anything. One atomic value means a query is always one coherent, saved state. The cost is that two offline edits to
  the same query keep only the later whole definition. ADR 0002 already accepts this trade for "records created once
  and rarely edited", and the UI offers "Save as new" so a reader can keep both.
- **Name and definition are separate registers**, so a rename on one device never overwrites a parameter change on
  another.
- **Delete is a tombstone with undo** (the people pattern). A separate permanent erase is open decision D3.
- **The definition carries its own schema version** inside the value (`version`), the way the `calculationSettings`
  register does (guidelines section 3.1). The envelope's `opVersion` is not touched: `entity` and `field` are an open
  vocabulary and adding a kind does not change the operation shape (`ops.ts` header, rule 2).
- **No creation timestamp is stored.** The fold would have to derive one from a register's HLC, which changes on every
  edit. The list sorts by name (locale-aware, for presentation), then by id using a plain code-unit comparison, not
  `localeCompare`, so the tiebreak cannot differ between devices with different ICU data. Map iteration order is not
  part of the contract (see "Determinism" in section 4).

### 2.4 Follow-up entities (provisional; each gets an addendum before it starts)

These constraints are fixed now so slice 1 does not contradict them.

- **`pin`** (slice 2). Entity `pin`, `entityId` is the pin id. Registers: `target` (one atomic JSON value naming the
  tool and the result's identity, for an event-search result the same identity `eventSearchToIcs` already hashes
  into its UID: kind, instant to the second, bodies, aspect) and `deleted`. Open for the addendum: random pin ids
  against ids derived from the target (derived ids make two offline devices pinning one event converge to one pin;
  random ids do not). `src/domain/event-search-ics.ts` uses a 32-bit hash, which is not collision-safe for an
  identity, so a derived id must use the full canonical identity, not that hash.
- **`annotation`** (slice 3). Annotation text is user-authored and potentially sensitive. Whole-text LWW would
  silently drop one of two concurrent edits, which `src/store/notes.ts` (#919) exists to prevent for notes. So an
  annotation must use immutable revisions with parents and forks, not a single text register, and must share the
  existing 50,000 code-point limit (`NOTE_MAX_CHARACTERS`, owner decision 2026-11-02, enforced for notes by
  `assertNoteMutation`). Open decision D7 asks the owner to confirm.
- **Anything that must disappear when a person is purged** (a pin or annotation about a person's chart, open decision
  D6) must use the notes convention: `entityId` is the **person id** and the entity's own id is encoded in `field`.
  The relay's erasure is keyed on `(entity, entityId)` (`server/ops/purge.ts`), and `entitiesPurgedWith` in
  `notes.ts` is the client fan-out; a person-attached entity with its own id as `entityId` would survive a person
  purge on both the device and the relay. This is the one rule that, if broken later, leaks data after erasure.
  Four consequences the addendum for such an entity must handle (found by the `db-integrity` review):
  1. **Client fan-out.** Add the new kinds to `NOTE_ENTITIES` or to `entitiesPurgedWith` in `notes.ts`, so a purge
     of a person writes a marker for each.
  2. **Fold.** `materialise` needs an `erased(personId)` check for each new kind, as `materialiseNotes` has. The
     fan-out alone does not hide an entity on a device that has not yet received the markers.
  3. **Older builds.** A build without the new kinds purging a person writes markers only for the kinds it knows, so
     the new kinds survive on peers and the relay until a newer build receives the person marker and repairs it
     (`store.ts` `receiveIncoming`). The addendum must state this window.
  4. **No per-item erase.** Keyed by person id, `purge(entity, personId)` erases every item of that kind for the
     person; one pin or annotation cannot be erased alone. The per-query erase in D3 works only because `savedQuery`
     is keyed by its own id. An annotation's `entityId` is not decided here (it is "follows its pin" in 2.1 only as
     a lifetime rule) and is a required decision of the slice 3 addendum.

### 2.5 The device-scope alternative (open decision D1, option B)

If the owner chooses "this device only":

- No operation-log change at all, and no sync. Store the list under one `localStorage` key that **includes the
  account database name**, `astraya:savedQueries:<store.dbName>`, the same keying `use-note-autosave.ts` uses for its
  journal. A key without `dbName` would show account A's queries to account B on a shared device, which is the
  cross-account bleed ADR 0002 names as the worst failure.
- Add a `SETTINGS` entry in `src/ui/settings-registry.ts` with scope `'device'`, persistence `'local-storage'`,
  `synced: false`, and label it "This device" in the UI (guidelines 3.3).
- Cost: queries do not follow the reader across devices, an anonymous reader loses them on browser eviction with no
  backup, and the registry gains data that is not a setting. The adoption flow (#109) moves only operation-log
  records, so queries saved while anonymous would be stranded in the anonymous database's `localStorage` key after
  sign-in; they would not leak to another account, but they would not follow the reader either.

## 3. Interface and schema contracts

### 3.1 Operation log: what changes and what does not

| Item                                                                | Change?                 |
| ------------------------------------------------------------------- | ----------------------- |
| Spine keys `opVersion`, `hlc`, `deviceId` (`SPINE_KEYS`)            | None                    |
| Body keys `entity`, `entityId`, `field`, `value` (`BODY_KEYS`)      | None                    |
| `OP_VERSION` (1) and `UPCASTS` (empty)                              | None                    |
| `src/store/ops.ts`, `oplog.ts`, `hlc.ts`                            | None                    |
| `src/store/db.ts` (IndexedDB schema, database version)              | None                    |
| `src/sync/engine.ts` push and pull                                  | None                    |
| `server/ops/routes.ts`, `crypto.ts`, `purge.ts`, SQLite `ops` table | None                    |
| `src/store/fold.ts`                                                 | **Yes**, see below      |
| `src/domain/id.ts`                                                  | **Yes**, one prefix     |
| `src/store/store.ts` `write()`                                      | **Yes**, one guard call |
| `src/store/store.ts` `openStore` snapshot write after a rebuild     | Optional, see below     |
| New `src/store/saved-queries.ts`                                    | New, pure               |

Changes to `fold.ts`:

- Add `SAVED_QUERY_ENTITY` to the private `KNOWN_ENTITIES` list. This changes the `entities` stamp of every snapshot,
  so every existing snapshot fails `sameKinds` and is rebuilt from the log on upgrade. That is the mechanism #919
  added for exactly this case, and a rebuild is correct (`resume` doc). The reverse direction is also safe: a
  snapshot written by this build, opened by an older build, has a kind the older build does not know, fails
  `sameKinds`, and is rebuilt. **The rebuild is not guaranteed to happen only once.** After a rebuild the next
  snapshot is written only when a commit pushes `sinceSnapshot` past `SNAPSHOT_EVERY` (50). A reader with a long
  log who only opens and reads therefore rebuilds on every launch until enough records arrive, and two builds
  sharing one IndexedDB during a staged rollout each fail the other's stamp. This is a cost, not a correctness
  problem. The slice 1 plan should have `openStore` persist a snapshot right after a `rebuilt: true` resume, or
  accept and state the cost; this is a small additional `store.ts` change either way.
- `State` gains `savedQueries: ReadonlyMap<string, SavedQuery>` and `deleted.savedQueries`
  (`ReadonlyMap<string, SavedQuery>`), so a restore list can name what it offers to bring back. Every place that
  builds a `State` literal must be updated.
- `materialise` skips purged entities first, then splits deleted from live, exactly as it does for people.

How an older build behaves with a `savedQuery` record it receives or already holds: `decode` returns `known` (the
vocabulary is open), `receiveRecords` stores and forwards it, and the older fold counts it in
`FoldSkips.unknownEntity` and ignores it. Nothing is dropped, nothing is rejected, nothing is misread. This is already
covered by the `unknownEntity` path in `applyRecords` and its test (`test/store-fold.test.ts`).

### 3.2 Types (contract, not implementation)

New module `src/store/saved-queries.ts` (pure; no IndexedDB, no clock; sibling of `notes.ts`). Needs the `@module`
header (`@purpose`, `@conventions`, `@exports`) the lint rule requires.

```ts
export const SAVED_QUERY_ENTITY = 'savedQuery';
export const SAVED_QUERY_NAME_FIELD = 'name';
export const SAVED_QUERY_DEFINITION_FIELD = 'definition';

/** Exactly the parameters Event search holds today (`Parameters` in EventSearchView.tsx), moved to the domain. */
export interface EventSearchQueryParameters {
  readonly from: string; // 'YYYY-MM-DD', as the date inputs hold it; never a Julian day
  readonly to: string; // 'YYYY-MM-DD'
  readonly kinds: readonly EventSearchKind[]; // 'station' | 'ingress' | 'lunation' | 'aspect'
  readonly stationBody: string; // a body key, see `bodyByKey`
  readonly ingressBody: string;
  readonly aspectBodyA: string;
  readonly aspectBodyB: string;
  readonly aspectKey: string;
}

export interface SavedQueryDefinition {
  readonly tool: 'event-search'; // discriminator so later tools can reuse the entity
  readonly version: 1; // definition schema version, independent of opVersion
  readonly parameters: EventSearchQueryParameters;
}

export type SavedQueryUnreadable = 'future-version' | 'unknown-tool' | 'invalid' | 'incomplete';

export type SavedQuery =
  | { readonly status: 'ready'; readonly id: string; readonly name: string; readonly definition: SavedQueryDefinition }
  | {
      readonly status: 'unreadable';
      readonly id: string;
      readonly name: string;
      readonly reason: SavedQueryUnreadable;
    };

export type SavedQueryRefusal = 'invalid' | 'name-too-long';

/**
 * Folds one entity id's registers. Pure, total (never throws), deterministic. Returns `undefined` only when the
 * entity holds neither a `name` nor a `definition` register (nothing to show). A missing or non-string `name`
 * folds to the empty string; the UI shows a localised "Unnamed query" for it.
 */
export function foldSavedQuery(id: string, fields: Readonly<Record<string, NoteFieldRegister>>): SavedQuery | undefined;

/** Mutations for a new query: the `name` and `definition` writes, committed in one `Store.mutate` batch. */
export function savedQueryCreate(id: string, name: string, definition: SavedQueryDefinition): readonly Mutation[];
export function savedQueryRename(id: string, name: string): Mutation;

/** Refuse a saved-query mutation the store must not write; other entities pass through. Mirrors `assertNoteMutation`. */
export function assertSavedQueryMutation(mutation: Mutation): void; // throws a refusal carrying a code, never prose
```

An entity with a `name` but no `definition` (or the reverse) is **incomplete** and folds to
`unreadable: 'incomplete'`, which is listed with a notice and can be deleted. It is not hidden. It is usually
transient: pull pages (`MAX_PAGE_SIZE` 500) and push batches are independent of the one local commit that wrote both,
so the `name` op can arrive a page before the `definition` op, and the entry becomes `ready` when the definition
lands. It can also be permanent: the relay skips an op more than `MAX_CLOCK_SKEW_MS` (24 hours) ahead of its own
clock, and the sender then quarantines that `hlc` for good (`src/sync/engine.ts`), so a peer would hold a name with no
definition forever. Hiding such an entity would be silent loss, which section 4 rule 6 forbids; listing it lets the
reader see and remove it. (This differs from `orphanCharts`, which have no meaningful display of their own.)

Delete, restore and permanent erase use the **existing** `Store.remove`, `Store.restore` and `Store.purge`, which are
generic over the entity kind. No new Store method is added.

`src/domain/id.ts`: add prefix `q` to `IdPrefix` and to `ID_PATTERN` (`/^[pcrq]-[a-z2-7]{16}$/`), so a query id reads
`q-` plus 16 characters from the same 80-bit generator. Prefix `r` is already a note revision and must not be reused.
An older build's `isId` rejects `q-` ids, which is harmless because an older build never reads a `savedQuery` record.
Keep the existing id tests green.

### 3.3 Wire examples

Two records, shown as a JSON array:

```json
[
  {
    "opVersion": 1,
    "hlc": "000001762300000000-00000-a1b2c3d4e5f60718",
    "deviceId": "a1b2c3d4e5f60718",
    "entity": "savedQuery",
    "entityId": "q-abcdefghijklmnop",
    "field": "name",
    "value": "Outer planet stations 2027"
  },
  {
    "opVersion": 1,
    "hlc": "000001762300000000-00001-a1b2c3d4e5f60718",
    "deviceId": "a1b2c3d4e5f60718",
    "entity": "savedQuery",
    "entityId": "q-abcdefghijklmnop",
    "field": "definition",
    "value": {
      "tool": "event-search",
      "version": 1,
      "parameters": {
        "from": "2027-01-01",
        "to": "2027-12-31",
        "kinds": ["station"],
        "stationBody": "mercury",
        "ingressBody": "sun",
        "aspectBodyA": "jupiter",
        "aspectBodyB": "saturn",
        "aspectKey": "conjunction"
      }
    }
  }
]
```

Both values pass `isJsonValue` and stay within `MAX_VALUE_DEPTH` (16): the deepest value is nested three levels.

### 3.4 Settings-metadata declaration (guidelines section 3)

A saved query is user data, not a setting, so it does not get a `SETTINGS` registry entry under the recommended
scope. For completeness, the declaration section 3 asks for:

| Property              | Value                                                                   |
| --------------------- | ----------------------------------------------------------------------- |
| Stable key            | entity kind `savedQuery`                                                |
| Scope and owner       | User / account                                                          |
| Default               | none (an empty list)                                                    |
| Persistence           | IndexedDB operation log                                                 |
| Sync                  | With the account's ops when signed in                                   |
| Editing surface       | Event search page: Save query, Saved queries list                       |
| Commit mode           | Immediate, one explicit "Save" action                                   |
| Reset target          | Not applicable; Delete with Undo                                        |
| Serialization version | `definition.version` = 1                                                |
| Sensitive             | The name is free text and may contain personal data; parameters are not |

## 4. Boundary and security rules

1. **No birth data in a saved query.** `EventSearchQueryParameters` holds dates, body keys, kinds and one aspect key.
   Event search is person-independent by contract; a query must never gain a person id, a chart id or coordinates. A
   tool that needs a person is out of scope for this entity (it would be person scope, 2.4).
2. **The name is the only free text.** It is rendered as text by React, never as HTML. It can hold personal data, so it
   is treated as sensitive: it is encrypted at rest by the relay like every payload, and open decision D3 asks whether
   a permanent erase is offered.
3. **The relay learns nothing new.** The relay already parses `entity`, `entityId`, `field` and `value` on push for the
   purge-marker check, and for nothing else (ADR 0002 amendment, `server/ops/purge.ts`). `savedQuery` adds no
   interpretation and no new exception. `previewDeletionImpact` counts only `person` and `chart`, so an account-delete
   preview will not mention saved queries; acceptable, since they carry no birth data.
4. **Cross-account bleed.** Under the recommended scope, queries live in the per-account database, so a second account
   on the same device sees none of the first account's queries, and the adoption flow (#109) moves or declines them with
   the rest of the anonymous log, with no special case. Under the device alternative the `dbName` key rule in 2.5 is
   mandatory.
5. **Writes are guarded, reads are total.** `assertSavedQueryMutation` runs in `Store.write()` for the whole batch
   before anything is appended (the `assertNoteMutation` pattern). It allows only `name` (string, within the name
   limit, D4), `definition` (valid shape) and `deleted`; every other field is refused with a code. The fold must not
   rely on that guard, because records also arrive from peers, which only the envelope validates.
   `foldSavedQuery` therefore never throws and treats any wrong-typed or out-of-range value as `unreadable: 'invalid'`.
6. **Reopen is exact or it says so.** A definition whose `version` is above 1 is `unreadable: 'future-version'`; a
   `tool` this build does not know is `'unknown-tool'`; a body key, aspect key or kind that is not in this build's
   vocabulary, or a date that `parseDate` rejects, is `'invalid'`. An unreadable query is **listed with its name and a
   notice, kept, and never silently replaced by defaults**, mirroring guidelines 3.1. Substituting a default body for an
   unknown one would reopen a different search than the one the reader saved.
7. **Limits.** Reused constants only: a push batch is capped at `MAX_BATCH_SIZE` (500) ops and by encoded bytes, the
   request body at 1 MiB (`bodyLimit`), and the account at `MAX_OPS_PER_USER` (200,000). A query is two to three ops, so
   these are far from binding for a person. No separate cap on the number of queries is proposed; a cap would be a new
   invented number. The name length limit is open decision D4, not a number chosen here.
8. **Failure modes.** A refused write (invalid, name too long, read-only tab) throws before the log is touched and the
   UI shows the refusal's code as a message. A save that cannot be made durable is an error, not a success
   (durable-before-notify). An unreadable or incomplete entity never blocks the list or sync.
9. **Reopening does not execute.** Opening a query fills the form; running the search stays the explicit action it is
   today. No query runs on page load.
10. **Fold ordering for erased entities.** `purgeEntity` leaves only the `purged` register
    (`oplog.ts`), so a purged query looks incomplete to `foldSavedQuery`. `materialise` must test `isPurged` before
    any incomplete, deleted or unreadable logic, as it does for people, so a purged query appears in neither the
    live list nor the restore list. The relay refuses a later `name` or `definition` op for a purged id through its
    deny-list (`server/ops/routes.ts`); locally `materialise` still hides it.
11. **Guard coverage is exactly `mutate`, `remove` and `restore`.** `Store.purge` appends directly and `seed` skips
    the guard, as for notes. Any importer (D5) must write through `mutate`, or `assertSavedQueryMutation` is bypassed.
    `State` also gains `deleted.savedQueries`, a shape change that makes every `State` literal in the tests fail to
    compile, which is the intended signal.

### Determinism (ADR 0002: byte-identical state on two devices)

Registers are plain objects, so `Object.entries` order follows arrival order, which can differ between a fresh fold and
a snapshot resume. Nothing about `savedQueries` may depend on that order: the selector that feeds the list sorts by name
then by id (code-unit comparison, see 2.3), and tests compare sorted output.

## 5. Verification strategy

### Acceptance criteria for the design (this note)

- [ ] The stored entities, their scope and their sync behaviour are stated (sections 2.1 to 2.5).
- [ ] The note states whether the op-log changes and lists every file affected (section 3.1).
- [ ] The `db-integrity` verdict is recorded (section 6) and every finding it raises is resolved or listed as open.
- [ ] Open owner decisions are listed as exact multiple-choice questions, recommended first (section 7).

### Acceptance criteria for slice 1 (implementation, for the planner)

- [ ] A saved query can be created from Event search with a name, listed, reopened into the form, renamed (if the
      editing surface offers it), deleted and the delete undone.
- [ ] Saved queries survive reload and appear on a second device after sync; a query written on device A while B is
      offline reaches B and folds to the same state on both.
- [ ] `OP_VERSION`, `SPINE_KEYS`, `BODY_KEYS` and `UPCASTS` are unchanged; `test/store-ops.test.ts` passes unmodified.
- [ ] `server/ops/*` is unchanged; a `savedQuery` op round-trips through the relay byte-for-byte.
- [ ] A reader on an older build keeps and forwards `savedQuery` records and loses nothing (fold test using the `known`
      parameter of `applyRecords` to simulate the older kind set).
- [ ] An existing snapshot is rebuilt on upgrade, never resumed with the wrong kind set, and (if the optional 3.1
      item is taken) persisted straight after the rebuild so the next launch resumes
      (`test/store-snapshot-upgrade.test.ts` pattern).
- [ ] A definition with a future `version`, an unknown `tool`, an unknown body key, a bad date and a wrong-typed value
      each fold to a listed, kept, `unreadable` entry and never to defaults.
- [ ] A partial sync (name arrived, definition not yet) is listed as `incomplete` and becomes `ready` when the
      definition lands; a permanently missing definition stays listed and deletable.
- [ ] Two concurrent edits to one definition converge to the same value on both devices (property test in the style of
      `test/store-sync-properties.test.ts`); a concurrent rename and definition edit both survive.
- [ ] Permanent erase, if offered (D3), removes the query's records on the device, a peer and the relay and leaves only
      the marker.
- [ ] A second account on the same device sees none of the first account's queries.
- [ ] en and nl messages with parity; `npm run check` passes with zero warnings; the affected e2e spec passes
      (`npm run test:e2e`, UI change).
- [ ] `src/store/MAP.md` lists `saved-queries.ts`; the new module carries its `@module` header.

Pins (slice 2) and annotations (slice 3) each need their own addendum and acceptance list before starting, covering at
least: the pin identity choice (2.4), person purge fan-out if person-attached, and the annotation revision model.

## 6. db-integrity review

Reviewer: the project's `db-integrity` agent (`.claude/agents/db-integrity.md`), run read-only on the first draft of
this note against `src/store/oplog.ts`, `ops.ts`, `fold.ts`, `hlc.ts`, `store.ts`, `notes.ts`, `src/sync/engine.ts`,
`server/ops/routes.ts`, `server/ops/purge.ts` and ADR 0002.

**Verdict: APPROVE WITH CHANGES.** The core design holds (new `savedQuery` kind, no envelope or relay change, atomic
definition register) and the reviewer found no cross-account or replay-breaking hole in slice 1. Limits of the review,
as the reviewer stated them: it did not open the tests (every test statement is inferred from file names and code), and
it did not re-audit every `user_id` clause in `routes.ts` and `auth/*`; it confirmed only that the purge deny-list check
is scoped by `user.id`.

Claims it confirmed: no change to `ops.ts`, `oplog.ts`, `hlc.ts`, the spine, `OP_VERSION`, the sync engine or the relay
(the gate is `known.includes(entity)` in `applyRecords`; erasure is kind-generic); an older build stores, forwards and
ignores a `savedQuery` record, and erases it correctly on a `savedQuery` purge marker; no wrong resume from a snapshot;
the per-account database (`accountDbName(user.id)`) and adoption need no special case.

Findings and how this note resolves each:

| #   | Finding                                                                                                                                      | Resolution in this note                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | "Exactly one rebuild" is false for a read-only session; rebuild repeats until 50 more records                                                | Claim corrected in 3.1; snapshot write after a rebuild added as an optional plan item                             |
| 2   | An entity missing its `definition` op is hidden forever if the relay skipped it                                                              | Folds to `unreadable: 'incomplete'`, listed and deletable (3.2); name fallback specified; acceptance item changed |
| 3   | The person-attached convention omits client fan-out for new kinds, the fold `erased` check, the older-build purge window, and per-item erase | Four consequences added to 2.4                                                                                    |
| 4   | A purged `savedQuery` looks incomplete; fold must test `isPurged` first                                                                      | Rule 10 in section 4                                                                                              |
| 5   | Locale-aware sort differs by ICU across devices; the id tiebreak must be code-unit                                                           | 2.3 and Determinism                                                                                               |
| 6   | The guard covers only `mutate`, `remove`, `restore`; an importer must use `mutate`                                                           | Rule 11 in section 4                                                                                              |
| 7   | Option B: adoption does not carry a `localStorage` list                                                                                      | Cost added to 2.5                                                                                                 |
| 8   | The result paragraph contradicted the file table                                                                                             | Result paragraph corrected                                                                                        |

The reviewer was run on the first draft, not on this revision. The revision applies its findings and adds nothing
else of substance, but it has not been re-reviewed; re-run `db-integrity` on the slice 1 implementation diff, which is
the review ADR 0002 and the issue's first criterion call for when the fold actually changes.

## 7. Open owner decisions

Each is a multiple-choice question with the recommended option first. None is decided by this note except where the
recommended option is already the only reading of an existing rule, and that is said.

- **D1. Where do saved queries live?**
  A. Account: stored in the operation log and synced when signed in (recommended: guidelines section 3, ADR 0002).
  B. This device only: `localStorage` keyed per account database, never synced (the 2026-10-17 suggestion on #616).
- **D2. What does a saved date range mean?**
  A. The exact `from` and `to` dates as entered (recommended: reproducible, matches the parameters the CSV export
  already writes into its header).
  B. A relative window such as "the next 12 months", re-based each time the query is opened.
  C. Both, chosen when saving.
- **D3. How are saved queries removed?**
  A. Delete with Undo, plus a separate permanent Erase, because the name is free text that may hold personal data
  (recommended: erasure machinery is generic and already propagates to peers and the relay).
  B. Delete with Undo only in slice 1.
- **D4. How long may a saved query's name be?**
  A. 500 code points, reusing the existing cap on a user-written custom AI instruction
  (`MAX_CUSTOM_PROMPT_LENGTH` in `src/interpretation/prompt-guardrail.ts`) (recommended: reuses an existing
  constant rather than inventing one; note it was set for a different field).
  B. 50,000 code points, the note limit (`NOTE_MAX_CHARACTERS`).
  C. A different number the owner names.
- **D5. Are saved queries included in the full export and restore?**
  A. Yes, as an additive optional field, which `docs/domain/EXPORT_SCHEMA.md` says needs no version bump
  (recommended: for a reader who never signs in, the export is the only backup).
  B. Not in slice 1; track as a follow-up.
- **D6. Which results can be pinned in the follow-up slices?**
  A. Sky events first (person-independent, account scope); results derived from a person's chart later, under person
  scope with the person-id convention in 2.4 (recommended).
  B. Both from the start.
  C. Sky events only.
- **D7. How do two concurrent edits to one annotation resolve?**
  A. Immutable revisions with forks, as notes do (#919), so no text is ever lost (recommended).
  B. Last write wins on the whole text.

Not asked, but worth the owner knowing: the repository has no `docs/design/` directory, and `docs/MAP.md` sends a
one-time decision with lasting rationale to `docs/adr/`, so this note is ADR 0004 with status "proposed".
