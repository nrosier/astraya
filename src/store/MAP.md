# src/store/ — Map

IndexedDB-backed op-log (local source of truth). HLC-ordered operations, folded into current state. "Spine" of synced ops frozen forever (ADR 0002).

- `db.ts` — IndexedDB persistence: schema/migrations, CRUD for op records, snapshot, device/sync metadata. Durability before UI success. Deps: ops, fold.
- `fold.ts` — Append-only log → people/charts (deterministic, byte-identical state on two devices). Last-write-wins field registers, materialization, snapshot. Deps: domain/chart, domain/person, hlc, ops.
- `hlc.ts` — Hybrid logical clock: causally-total timestamps across devices (encode/decode, tick, receive, device-id generation/validation, drift detection). Deps: none.
- `oplog.ts` — Append-only log: append mutations, merge peer records (duplicate/collision detection), slice for push, entity purge. Deps: hlc, ops, fold.
- `ops.ts` — Operation envelope shape (disk/wire contract, forward-compatible decoding). Validates/decodes stored/incoming records (known/future/corrupt verdict), builds records, version-upcast machinery. Deps: hlc.
- `persist.ts` — Request storage persistence from browser, tri-state `PersistenceState`, user-facing warning copy. Deps: none.
- `store.ts` — Single live object for UI, concentrates impurity (db I/O, device-id, notifications). Exports `mutate`/`remove`/`restore`/`purge`/`outgoing`/`receive`/subscribe. Deps: db, fold, oplog, hlc, ops, persist, tab-lock, trace.
- `tab-lock.ts` — Web Locks exclusivity per database (one writer, prevents HLC timestamp collisions across tabs). Fallback to always-writable. Deps: none.
