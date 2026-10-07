# src/store/ — Map

The IndexedDB-backed op-log: the local source of truth. HLC-ordered operations, folded
into current state. The "spine" of ops already synced is frozen forever (ADR 0002).

### `db.ts`
**Domain purpose:** Owns the actual IndexedDB persistence for a user whose only copy of their data may live entirely in the browser — schema changes must never discard a record, and a write must be durable before the UI claims success. **Responsibility:** Opens/migrates the database, and provides CRUD-ish primitives for op records, the materialised snapshot, and device/sync metadata, waiting for transaction *commit* rather than request success. **Key dependencies:** Imports `ops.ts` (`OpRecord`) and `fold.ts` (`Snapshot`); used by `store.ts`.

### `fold.ts`
**Domain purpose:** Turns the append-only log into the people/charts a screen can actually render, deterministically, which is what makes two devices holding the same records converge on byte-identical state. **Responsibility:** Implements last-write-wins field registers (`applyRecords`), materialisation into live/deleted/orphan entities (`materialise`), and snapshot build/resume logic for fast startup. **Key dependencies:** Imports `../domain/chart.js`, `../domain/person.js` (entity builders), `hlc.ts` (`compareHlc`) and `ops.ts` (`decode`); used by `store.ts` and `oplog.ts` (for the `PURGED_FIELD` constant).

### `hlc.ts`
**Domain purpose:** Gives every operation a timestamp that totally and causally orders edits across devices even when wall clocks disagree or run backwards — the mechanism last-write-wins conflict resolution depends on. **Responsibility:** Implements the hybrid logical clock: encoding/decoding, `tick` (local stamp) and `receive` (merge a remote stamp, with drift detection), plus device-id generation/validation. **Key dependencies:** No internal imports; used by `ops.ts`, `oplog.ts`, `fold.ts`, `store.ts`, and `sync/engine.ts`.

### `oplog.ts`
**Domain purpose:** Implements the append-only log itself — the authoritative record of a user's data, from which all state is derived rather than stored directly, which is what makes merging two devices tractable. **Responsibility:** Appending local mutations (`append`), merging a peer's records with duplicate/collision detection (`receiveRecords`), slicing for push (`since`/`latest`), and entity purge (`purgeEntity`). **Key dependencies:** Imports `hlc.ts` (clock operations) and `ops.ts` (`decode`/`newRecord`) and `fold.ts` (`PURGED_FIELD`); used by `store.ts`.

### `ops.ts`
**Domain purpose:** Defines the operation envelope's exact shape, on disk and on the wire, under the constraint that an operation written today must stay interpretable by every future version of the app, with no migration window. **Responsibility:** Validates and decodes stored/incoming records into a `known`/`future`/`corrupt` verdict, builds new records (`newRecord`), and carries the version-upcast machinery (`UPCASTS`/`upcastBody`). **Key dependencies:** Imports `hlc.ts` (`isHlc`/`isNodeId`/`decodeHlc`); used by `oplog.ts`, `fold.ts`, `store.ts`, and `sync/engine.ts`.

### `persist.ts`
**Domain purpose:** Asks the browser not to evict the origin's storage, since for a user who never signs in IndexedDB holds the *only* copy of their data, and surfaces what the browser actually promised so the app can prompt an export before data is lost. **Responsibility:** Calls `navigator.storage.persist()`/`persisted()`/`estimate()` behind feature detection, reporting a tri-state `PersistenceState`, and provides user-facing warning copy per state. **Key dependencies:** No internal imports; used by `store.ts`.

### `store.ts`
**Domain purpose:** Is the single live object the UI talks to, concentrating all the impurity (database I/O, device-id generation, change notification) that the rest of the store module is deliberately free of. **Responsibility:** Opens the database, resumes/rebuilds state, serialises mutations through a tail-promise queue, and exposes `mutate`/`remove`/`restore`/`purge`/`outgoing`/`receive`/sync-cursor/subscribe. **Key dependencies:** Imports `db.ts`, `fold.ts`, `oplog.ts`, `hlc.ts`, `ops.ts`, `persist.ts`, `tab-lock.ts`, and `../trace.js`; this is the module `src/sync/engine.ts` and the UI's React layer depend on.

### `tab-lock.ts`
**Domain purpose:** Prevents two browser tabs of the same origin — which share a device id but each run an independent in-memory clock — from both writing and minting colliding HLC timestamps (#311). **Responsibility:** Requests an exclusive Web Lock per database name and reports whether this tab is the writer, falling back to always-writable where the Web Locks API is unavailable. **Key dependencies:** No internal imports; used by `store.ts`.
