# src/store/ — Map

IndexedDB-backed op-log (local source of truth). HLC-ordered operations, folded into current state. "Spine" of synced ops frozen forever (ADR 0002).

- `db.ts` — IndexedDB persistence: schema/migrations, CRUD for op records, snapshot, device/sync metadata. Durability before UI success. Deps: ops, fold.
- `fold.ts` — Append-only log → people/charts/notes (deterministic, byte-identical state on two devices). Last-write-wins field registers, note folding, materialization, snapshot. Deps: domain/chart, domain/person, hlc, notes, ops.
- `hlc.ts` — Hybrid logical clock: causally-total timestamps across devices (encode/decode, tick, receive, device-id generation/validation, drift detection). Deps: none.
- `oplog.ts` — Append-only log: append mutations (and `appendAt` for seeds), merge peer records (duplicate/collision detection), slice for push, entity purge. Deps: hlc, ops, fold.
- `notes.ts` — Birth Record and Consultation notes as immutable revisions: head, forks, grow-only delete, legacy `person.notes` root, 50,000-character limit (shared predicate for import and sync), purge fan-out. Deps: `hlc`, `oplog` (type).
- `ops.ts` — Operation envelope shape (disk/wire contract, forward-compatible decoding). Validates/decodes stored/incoming records (known/future/corrupt verdict), builds records, version-upcast machinery. Deps: hlc.
- `persist.ts` — Request storage persistence from browser, tri-state `PersistenceState`, user-facing warning copy. Deps: none.
- `store.ts` — Single live object for UI, concentrates impurity (db I/O, device-id, database name `dbName` (#919), notifications). Exports `mutate` (refuses invalid or oversized notes)/`seed` (minimum-HLC defaults that lose to any real write)/`remove`/`restore`/`purge` (person purge also erases notes)/`outgoing`/`receive`/subscribe. Deps: db, fold, notes, oplog, hlc, ops, persist, tab-lock, trace.
- `tab-lock.ts` — Web Locks exclusivity per database (one writer, prevents HLC timestamp collisions across tabs). Fallback to always-writable. Deps: none.
