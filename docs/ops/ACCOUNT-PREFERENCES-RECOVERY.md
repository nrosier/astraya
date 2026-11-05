# Recovering a deny-listed account preferences entity

Runbook for operators (#1066, [ADR 0004](../adr/0004-account-scope-settings-sync.md) section 4, db-integrity finding 6).

## What can go wrong

A reader's language, default rulership and default calculation profile sync as operations on one entity: `account`, id `preferences`. The app never writes a `purged` or `deleted` field for this entity. `mutate` and `seed` refuse it, `purge`, `remove` and `restore` throw, and a peer's purge marker for it is ignored on receive.

The relay does not know which entities are purgeable. Any operation with `purged: true` is a purge marker to it (`server/ops/purge.ts`, `isPurgeMarker`). So a modified client, or a bug in an older or future build, could still send `{ entity: "account", entityId: "preferences", field: "purged", value: true }` for one user. The relay would then:

1. record `(user_id, 'account', 'preferences')` in `purged_entities`;
2. erase that user's stored `account` rows;
3. refuse every later preference write for that user, and report each refused operation in the push response's `skipped` list.

The impact is limited to that one user's own preferences. `purged_entities` is keyed by `user_id`, so no other user is affected.

## How it shows

- A preference change does not reach the user's other devices.
- The client's sync engine reports a growing quarantined count (`quarantined()` in `src/sync/engine.ts`) after each preference change, because the relay names those operations in `skipped`.
- The server's database has a row in `purged_entities` with `entity = 'account'` and `entity_id = 'preferences'` for that user.

## Recovery

This is an operator action on the server's SQLite database. Take a backup first.

1. Find the user's id, for example by username:

   ```sql
   SELECT id FROM users WHERE username = 'the-username';
   ```

2. Remove the deny-list entry for that user's preferences:

   ```sql
   DELETE FROM purged_entities
   WHERE user_id = 'the-user-id' AND entity = 'account' AND entity_id = 'preferences';
   ```

3. Ask the user to change any preference again, on any device. That write is new, so the relay stores it and the other devices pick it up on their next sync.

The relay already erased the old `account` rows, so only new writes come back. The operations that were quarantined stay quarantined by design: the client never retries a quarantined timestamp. Each device keeps its own local register until a newer write reaches it.

## What not to do

- Do not delete other rows of `purged_entities`. A person's purge must stay permanent.
- Do not try to restore the erased `account` rows from a backup into `ops`. The next preference change replaces them anyway, and restoring rows by hand bypasses the relay's encryption and sequence handling.
