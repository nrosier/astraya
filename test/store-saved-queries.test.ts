/**
 * Saved event-search queries (#1061, ADR 0005): the pure fold and guard rules, and the live store round trip.
 *
 * The store tests use real `openStore()` stores over fake IndexedDB. They cover save, reopen after a reopen of the
 * database, delete with Undo, the permanent Erase, the 500-character cap, signed-out use, and the cross-account
 * boundary: a second account's database must see none of the first account's queries.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_CUSTOM_PROMPT_LENGTH } from '../src/interpretation/prompt-guardrail.js';
import { newId } from '../src/domain/id.js';
import { materialise, applyRecords, EMPTY_REGISTERS, resume, snapshotOf, fold } from '../src/store/fold.js';
import { openStore, type Store } from '../src/store/store.js';
import { createClock } from '../src/store/hlc.js';
import { append, emptyLog, type Mutation } from '../src/store/oplog.js';
import {
  SAVED_QUERY_BODY_KEYS,
  SAVED_QUERY_ENTITY,
  SAVED_QUERY_NAME_MAX_CHARACTERS,
  SavedQueryRefusedError,
  assertSavedQueryMutation,
  foldSavedQuery,
  isSavedQueryNameTooLong,
  parseSearchDate,
  savedQueryCreate,
  savedQueryRename,
  sortedSavedQueries,
  type EventSearchQueryParameters,
  type SavedQuery,
  type SavedQueryDefinition,
} from '../src/store/saved-queries.js';
import type { NoteFieldRegister } from '../src/store/notes.js';
import type { OpRecord } from '../src/store/ops.js';

const PARAMETERS: EventSearchQueryParameters = {
  from: '2027-01-01',
  to: '2027-12-31',
  kinds: ['station', 'aspect'],
  stationBody: 'mercury',
  ingressBody: 'sun',
  aspectBodyA: 'jupiter',
  aspectBodyB: 'saturn',
  aspectKey: 'conjunction',
};

const DEFINITION: SavedQueryDefinition = { tool: 'event-search', version: 1, parameters: PARAMETERS };
const T0 = 1_780_963_200_000;

function register(value: unknown, millis = T0): NoteFieldRegister {
  return { value, hlc: `${String(millis).padStart(18, '0')}-00000-a1b2c3d4e5f60718` };
}

function fieldsOf(name: unknown, definition: unknown, deleted?: boolean): Record<string, NoteFieldRegister> {
  return {
    ...(name === undefined ? {} : { name: register(name) }),
    ...(definition === undefined ? {} : { definition: register(definition) }),
    ...(deleted === undefined ? {} : { deleted: register(deleted) }),
  };
}

const QUERY_ID = 'q-abcdefghijklmnop';

describe('saved query id prefix (#1061)', () => {
  it('mints a q- id that the id pattern accepts', () => {
    expect(newId('q')).toMatch(/^q-[a-z2-7]{16}$/);
  });
});

describe('parseSearchDate', () => {
  it('accepts a civil date as the form holds it and rejects anything else', () => {
    expect(parseSearchDate('2027-06-15')).toEqual([2027, 6, 15]);
    expect(parseSearchDate('2027-13-01')).toBeUndefined();
    expect(parseSearchDate('2027-02-00')).toBeUndefined();
    expect(parseSearchDate('27-02-01')).toBeUndefined();
    expect(parseSearchDate('not a date')).toBeUndefined();
  });
});

describe('the name cap (D4)', () => {
  it('is the existing custom-prompt cap, 500 characters', () => {
    expect(SAVED_QUERY_NAME_MAX_CHARACTERS).toBe(MAX_CUSTOM_PROMPT_LENGTH);
    expect(SAVED_QUERY_NAME_MAX_CHARACTERS).toBe(500);
  });

  it('counts code points, so 500 astral characters fit and 501 do not', () => {
    const fits = '\u{1F30C}'.repeat(500);
    expect(fits.length).toBeGreaterThan(500);
    expect(isSavedQueryNameTooLong(fits)).toBe(false);
    expect(isSavedQueryNameTooLong('\u{1F30C}'.repeat(501))).toBe(true);
    expect(isSavedQueryNameTooLong('a'.repeat(500))).toBe(false);
    expect(isSavedQueryNameTooLong('a'.repeat(501))).toBe(true);
  });

  it('refuses an over-long name at the write guard, with a code', () => {
    const write = savedQueryCreate(QUERY_ID, 'a'.repeat(501), DEFINITION)[0];
    expect(write).toBeDefined();
    if (write === undefined) return;
    try {
      assertSavedQueryMutation(write);
      expect.unreachable('an over-long name must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(SavedQueryRefusedError);
      expect((error as SavedQueryRefusedError).refusal).toBe('name-too-long');
    }
  });
});

describe('foldSavedQuery', () => {
  it('folds a complete, readable query to ready', () => {
    expect(foldSavedQuery(QUERY_ID, fieldsOf('Outer stations', DEFINITION))).toEqual({
      status: 'ready',
      id: QUERY_ID,
      name: 'Outer stations',
      definition: DEFINITION,
    });
  });

  it('is undefined for an entity with neither register, so there is nothing to show', () => {
    expect(foldSavedQuery(QUERY_ID, {})).toBeUndefined();
  });

  it('folds a name with no definition to incomplete, kept and listed', () => {
    expect(foldSavedQuery(QUERY_ID, fieldsOf('Half written', undefined))).toEqual({
      status: 'unreadable',
      id: QUERY_ID,
      name: 'Half written',
      reason: 'incomplete',
    });
  });

  it('folds a definition with no name to incomplete with an empty name', () => {
    expect(foldSavedQuery(QUERY_ID, fieldsOf(undefined, DEFINITION))).toEqual({
      status: 'unreadable',
      id: QUERY_ID,
      name: '',
      reason: 'incomplete',
    });
  });

  it('marks a definition from a newer version future-version, never defaults it', () => {
    const newer = { ...DEFINITION, version: 2 };
    expect(foldSavedQuery(QUERY_ID, fieldsOf('Later', newer))).toMatchObject({
      status: 'unreadable',
      reason: 'future-version',
    });
  });

  it('marks an unknown tool unknown-tool', () => {
    expect(foldSavedQuery(QUERY_ID, fieldsOf('Pins', { ...DEFINITION, tool: 'pin-board' }))).toMatchObject({
      status: 'unreadable',
      reason: 'unknown-tool',
    });
  });

  it('marks an unknown body key, aspect key, kind or bad date invalid', () => {
    const cases: readonly EventSearchQueryParameters[] = [
      { ...PARAMETERS, stationBody: 'nibiru' },
      { ...PARAMETERS, aspectKey: 'septile' },
      { ...PARAMETERS, kinds: ['comet' as never] },
      { ...PARAMETERS, from: '2027-02-30x' },
    ];
    for (const parameters of cases) {
      expect(foldSavedQuery(QUERY_ID, fieldsOf('Odd', { ...DEFINITION, parameters }))).toMatchObject({
        status: 'unreadable',
        reason: 'invalid',
      });
    }
  });

  it('marks a wrong-typed value invalid and never throws on any input', () => {
    const wrong: readonly unknown[] = [
      null,
      'text',
      3,
      [],
      { tool: 'event-search' },
      { ...DEFINITION, version: 'one' },
    ];
    for (const definition of wrong) {
      expect(foldSavedQuery(QUERY_ID, fieldsOf(42, definition))).toMatchObject({ status: 'unreadable' });
    }
  });

  it('keeps a name the reader saved even when it is not a string, as an empty name', () => {
    expect(foldSavedQuery(QUERY_ID, fieldsOf(42, DEFINITION))).toMatchObject({ status: 'ready', name: '' });
  });
});

describe('the guard (assertSavedQueryMutation)', () => {
  const mutate = (mutation: Mutation): string | undefined => {
    try {
      assertSavedQueryMutation(mutation);
      return undefined;
    } catch (error) {
      return error instanceof SavedQueryRefusedError ? error.refusal : 'other';
    }
  };

  it('passes the writes a save, a rename, a delete and a restore make', () => {
    const [nameWrite, definitionWrite] = savedQueryCreate(QUERY_ID, 'Stations', DEFINITION);
    expect(nameWrite).toBeDefined();
    expect(definitionWrite).toBeDefined();
    if (nameWrite === undefined || definitionWrite === undefined) return;
    expect(mutate(nameWrite)).toBeUndefined();
    expect(mutate(definitionWrite)).toBeUndefined();
    expect(mutate(savedQueryRename(QUERY_ID, 'Renamed'))).toBeUndefined();
    expect(mutate({ entity: SAVED_QUERY_ENTITY, entityId: QUERY_ID, field: 'deleted', value: true })).toBeUndefined();
  });

  it('refuses a purged write, an unknown field and a non-q id', () => {
    expect(mutate({ entity: SAVED_QUERY_ENTITY, entityId: QUERY_ID, field: 'purged', value: true })).toBe('invalid');
    expect(mutate({ entity: SAVED_QUERY_ENTITY, entityId: QUERY_ID, field: 'pinned', value: true })).toBe('invalid');
    expect(mutate({ entity: SAVED_QUERY_ENTITY, entityId: 'p-abcdefghijklmnop', field: 'name', value: 'x' })).toBe(
      'invalid',
    );
  });

  it('refuses a definition that is not readable, and a non-string name', () => {
    expect(
      mutate({
        entity: SAVED_QUERY_ENTITY,
        entityId: QUERY_ID,
        field: 'definition',
        value: { ...DEFINITION, parameters: { ...PARAMETERS, stationBody: 'nibiru' } },
      }),
    ).toBe('invalid');
    expect(mutate({ entity: SAVED_QUERY_ENTITY, entityId: QUERY_ID, field: 'name', value: 7 })).toBe('invalid');
  });

  it('ignores other entity kinds', () => {
    expect(mutate({ entity: 'person', entityId: 'p-abcdefghijklmnop', field: 'purged', value: true })).toBeUndefined();
  });
});

describe('materialise and the list order', () => {
  it('materialises a live query into savedQueries and a tombstoned one into deleted.savedQueries', () => {
    const live = 'q-aaaaaaaaaaaaaaaa';
    const gone = 'q-bbbbbbbbbbbbbbbb';
    let log = emptyLog(createClock('a1b2c3d4e5f60718'));
    for (const mutation of [
      ...savedQueryCreate(live, 'Live', DEFINITION),
      ...savedQueryCreate(gone, 'Gone', DEFINITION),
      { entity: SAVED_QUERY_ENTITY, entityId: gone, field: 'deleted', value: true },
    ]) {
      log = append(log, mutation, T0).log;
    }
    const state = fold(log.records);
    expect(state.savedQueries.has(live)).toBe(true);
    expect(state.savedQueries.has(gone)).toBe(false);
    expect(state.deleted.savedQueries.has(gone)).toBe(true);
  });

  it('hides a purged query even when it holds only the purge marker', () => {
    const purged = 'q-cccccccccccccccc';
    // What a purge leaves behind: the marker alone, which on its own would fold as an incomplete query.
    const log = append(
      emptyLog(createClock('a1b2c3d4e5f60718')),
      { entity: SAVED_QUERY_ENTITY, entityId: purged, field: 'purged', value: true },
      T0,
    ).log;
    const state = materialise(applyRecords(EMPTY_REGISTERS, log.records).registers);
    expect(state.savedQueries.size).toBe(0);
    expect(state.deleted.savedQueries.size).toBe(0);
  });

  it('sorts by name, then by id by code unit, independent of map insertion order', () => {
    const a: SavedQuery = { status: 'ready', id: 'q-bbbbbbbbbbbbbbbb', name: 'Same', definition: DEFINITION };
    const b: SavedQuery = { status: 'ready', id: 'q-aaaaaaaaaaaaaaaa', name: 'Same', definition: DEFINITION };
    const c: SavedQuery = { status: 'ready', id: 'q-cccccccccccccccc', name: 'Alpha', definition: DEFINITION };
    const forward = sortedSavedQueries(
      new Map([
        [a.id, a],
        [b.id, b],
        [c.id, c],
      ]),
      'en',
    );
    const backward = sortedSavedQueries(
      new Map([
        [c.id, c],
        [b.id, b],
        [a.id, a],
      ]),
      'en',
    );
    expect(forward.map((q) => q.id)).toEqual([c.id, b.id, a.id]);
    expect(backward.map((q) => q.id)).toEqual(forward.map((q) => q.id));
  });
});

describe('two devices, one definition', () => {
  it('folds the same records to the same state in any arrival order', () => {
    const name = savedQueryCreate(QUERY_ID, 'Shared', DEFINITION)[0];
    expect(name).toBeDefined();
    if (name === undefined) return;
    const renamed = savedQueryRename(QUERY_ID, 'Renamed');
    let log = emptyLog(createClock('a1b2c3d4e5f60718'));
    for (const mutation of [...savedQueryCreate(QUERY_ID, 'Shared', DEFINITION), renamed]) {
      log = append(log, mutation, T0).log;
    }
    const forward = fold(log.records).savedQueries;
    const reversed = fold([...log.records].reverse()).savedQueries;
    expect(forward.get(QUERY_ID)).toEqual(reversed.get(QUERY_ID));
    expect(forward.get(QUERY_ID)).toMatchObject({ status: 'ready', name: 'Renamed' });
  });

  it('keeps the rename and a definition edit from the other device both', () => {
    const device = (node: string, mutations: readonly Mutation[], at: number): readonly OpRecord[] => {
      let log = emptyLog(createClock(node));
      for (const mutation of mutations) log = append(log, mutation, at).log;
      return log.records;
    };
    const created = device('a1b2c3d4e5f60718', savedQueryCreate(QUERY_ID, 'Orig', DEFINITION), T0);
    const renamed = device('b0000000000000ff', [savedQueryRename(QUERY_ID, 'New name')], T0 + 1000);
    const edited = device(
      'c0000000000000ee',
      [
        {
          entity: SAVED_QUERY_ENTITY,
          entityId: QUERY_ID,
          field: 'definition',
          value: { ...DEFINITION, parameters: { ...PARAMETERS, to: '2028-01-31' } },
        },
      ],
      T0 + 2000,
    );
    const folded = fold([...created, ...renamed, ...edited]).savedQueries.get(QUERY_ID);
    expect(folded).toMatchObject({ status: 'ready', name: 'New name' });
    expect(folded?.status === 'ready' ? folded.definition.parameters.to : undefined).toBe('2028-01-31');
  });

  it('a snapshot resumes to the same state as a rebuild', () => {
    const records = [
      ...savedQueryCreate(QUERY_ID, 'Snap', DEFINITION).flatMap((mutation, index) => {
        const log = append(emptyLog(createClock('a1b2c3d4e5f60718')), mutation, T0 + index).log;
        return log.records;
      }),
    ];
    const registers = applyRecords(EMPTY_REGISTERS, records).registers;
    const resumed = resume(snapshotOf(registers, records), records);
    expect(materialise(resumed.registers).savedQueries).toEqual(fold(records).savedQueries);
  });

  it('lists an incomplete query as incomplete rather than hiding it', () => {
    const records = (() => {
      const log = append(
        emptyLog(createClock('a1b2c3d4e5f60718')),
        { entity: SAVED_QUERY_ENTITY, entityId: QUERY_ID, field: 'name', value: 'Lonely' },
        T0,
      ).log;
      return log.records;
    })();
    expect(fold(records).savedQueries.get(QUERY_ID)).toMatchObject({ status: 'unreadable', reason: 'incomplete' });
  });
});

describe('the saved-query store round trip', () => {
  let open: Store[] = [];
  let counter = 0;

  afterEach(() => {
    for (const store of open) store.close();
    open = [];
  });

  /** A fresh database name, so tests never share state. */
  function freshName(): string {
    counter += 1;
    return `astraya-saved-query-test-${String(counter)}`;
  }

  /** A clock the tests control, so ordering is a fact rather than a race. */
  function ticking(start = T0): () => number {
    let millis = start;
    return () => {
      millis += 1000;
      return millis;
    };
  }

  async function reopen(name: string): Promise<Store> {
    const store = await openStore({ name, now: ticking() });
    open.push(store);
    return store;
  }

  function queryOf(store: Store, id: string): SavedQuery | undefined {
    return store.state.savedQueries.get(id);
  }

  it('saves a query, lists it, and reopens it with the same parameters', async () => {
    const name = freshName();
    const id = newId('q');
    const store = await reopen(name);
    await store.mutate(savedQueryCreate(id, 'Outer stations', DEFINITION));
    expect(queryOf(store, id)).toEqual({ status: 'ready', id, name: 'Outer stations', definition: DEFINITION });
  });

  it('keeps a saved query across a reload, the database closed and reopened', async () => {
    const name = freshName();
    const id = newId('q');
    const first = await reopen(name);
    await first.mutate(savedQueryCreate(id, 'Kept', DEFINITION));
    first.close();
    open = open.filter((store) => store !== first);

    const second = await reopen(name);
    expect(queryOf(second, id)).toMatchObject({ status: 'ready', name: 'Kept', definition: DEFINITION });
  });

  it('deletes a query with a tombstone, and Undo brings it back exactly', async () => {
    const name = freshName();
    const id = newId('q');
    const store = await reopen(name);
    await store.mutate(savedQueryCreate(id, 'Undoable', DEFINITION));

    await store.remove(SAVED_QUERY_ENTITY, id);
    expect(queryOf(store, id)).toBeUndefined();
    expect(store.state.deleted.savedQueries.get(id)).toMatchObject({ status: 'ready', name: 'Undoable' });

    await store.restore(SAVED_QUERY_ENTITY, id);
    expect(queryOf(store, id)).toEqual({ status: 'ready', id, name: 'Undoable', definition: DEFINITION });
    expect(store.state.deleted.savedQueries.has(id)).toBe(false);
  });

  it('erases a query permanently: it leaves both lists and does not return after a reload', async () => {
    const name = freshName();
    const id = newId('q');
    const store = await reopen(name);
    await store.mutate(savedQueryCreate(id, 'Gone for good', DEFINITION));
    await store.remove(SAVED_QUERY_ENTITY, id);

    await store.purge(SAVED_QUERY_ENTITY, id);
    expect(queryOf(store, id)).toBeUndefined();
    expect(store.state.deleted.savedQueries.has(id)).toBe(false);
    store.close();
    open = open.filter((candidate) => candidate !== store);

    const reopened = await reopen(name);
    expect(reopened.state.savedQueries.has(id)).toBe(false);
    expect(reopened.state.deleted.savedQueries.has(id)).toBe(false);
  });

  it('refuses an over-long name before anything is written', async () => {
    const name = freshName();
    const id = newId('q');
    const store = await reopen(name);
    const before = store.head();
    await expect(store.mutate(savedQueryCreate(id, 'x'.repeat(501), DEFINITION))).rejects.toMatchObject({
      refusal: 'name-too-long',
    });
    expect(queryOf(store, id)).toBeUndefined();
    expect(store.head()).toBe(before);
  });

  it('a name of exactly 500 characters is saved', async () => {
    const name = freshName();
    const id = newId('q');
    const store = await reopen(name);
    await store.mutate(savedQueryCreate(id, 'x'.repeat(500), DEFINITION));
    expect(queryOf(store, id)?.name).toHaveLength(500);
  });

  it('works signed out: a store with no account saves, and keeps the query on this device', async () => {
    // An anonymous reader has the same store with no sign-in: the query is written to the local log and survives a
    // reload, which is the behaviour D1 asks for ("works signed out").
    const name = freshName();
    const id = newId('q');
    const anonymous = await reopen(name);
    await anonymous.mutate(savedQueryCreate(id, 'Anonymous', DEFINITION));
    anonymous.close();
    open = open.filter((store) => store !== anonymous);

    const again = await reopen(name);
    expect(queryOf(again, id)).toMatchObject({ status: 'ready', name: 'Anonymous' });
  });

  it("a second account on the same device sees none of the first account's queries", async () => {
    const first = freshName();
    const second = freshName();
    const id = newId('q');
    const alice = await reopen(first);
    await alice.mutate(savedQueryCreate(id, 'Alice only', DEFINITION));

    const bob = await reopen(second);
    expect(bob.state.savedQueries.size).toBe(0);
    expect(bob.state.deleted.savedQueries.size).toBe(0);
  });

  it('a read-only query folded from a peer that bypassed the guard is still listed, not thrown on', async () => {
    const name = freshName();
    const store = await reopen(name);
    const peer: Mutation = { entity: SAVED_QUERY_ENTITY, entityId: newId('q'), field: 'name', value: 'Peer only' };
    const log = append(emptyLog(createClock('b0000000000000ff')), peer, T0).log;
    await store.receive(log.records);
    const listed = [...store.state.savedQueries.values()];
    expect(listed).toEqual([
      expect.objectContaining({ status: 'unreadable', reason: 'incomplete', name: 'Peer only' }),
    ]);
  });
});

describe('module constants', () => {
  it('lists every body key the Event search selectors offer', () => {
    expect(SAVED_QUERY_BODY_KEYS).toContain('mercury');
    expect(SAVED_QUERY_BODY_KEYS).not.toContain('meanNode');
    expect(SAVED_QUERY_BODY_KEYS).not.toContain('meanLilith');
  });
});

describe('an older build and an upgrade (ADR 0005)', () => {
  const OLD_BUILD_KINDS: readonly string[] = ['person', 'chart', 'birthNote', 'consultationNote'];

  function records(): readonly OpRecord[] {
    let log = emptyLog(createClock('a1b2c3d4e5f60718'));
    for (const mutation of savedQueryCreate(QUERY_ID, 'Seen by newer', DEFINITION)) {
      log = append(log, mutation, T0).log;
    }
    return log.records;
  }

  it('an older build counts the savedQuery records as unknownEntity and folds none of them', () => {
    const applied = applyRecords(EMPTY_REGISTERS, records(), OLD_BUILD_KINDS);
    expect(applied.skips.unknownEntity).toBe(2);
    expect(applied.registers[SAVED_QUERY_ENTITY]).toBeUndefined();
  });

  it('a snapshot from the older build is rebuilt, so the query appears after the upgrade', () => {
    const all = records();
    const oldRegisters = applyRecords(EMPTY_REGISTERS, all, OLD_BUILD_KINDS).registers;
    const oldSnapshot = snapshotOf(oldRegisters, all, OLD_BUILD_KINDS);
    const resumed = resume(oldSnapshot, all);
    expect(resumed.rebuilt).toBe(true);
    expect(materialise(resumed.registers).savedQueries.get(QUERY_ID)).toMatchObject({ status: 'ready' });
  });

  it('a snapshot written by this build is resumed, not rebuilt', () => {
    const all = records();
    const registers = applyRecords(EMPTY_REGISTERS, all).registers;
    expect(resume(snapshotOf(registers, all), all).rebuilt).toBe(false);
  });
});
