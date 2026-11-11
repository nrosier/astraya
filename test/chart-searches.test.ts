/**
 * Saved chart searches (#1405): the pure fold and guard rules, the fold into the person-store state, and the live
 * store round trip over fake IndexedDB (create, rename, delete with Undo, erase).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { newId, isId } from '../src/domain/id.js';
import { MAX_CUSTOM_PROMPT_LENGTH } from '../src/interpretation/prompt-guardrail.js';
import {
  CHART_SEARCH_ENTITY,
  CHART_SEARCH_MAX_CONDITIONS,
  ChartSearchRefusedError,
  assertChartSearchMutation,
  chartSearchCreate,
  chartSearchRename,
  foldChartSearch,
  sortedChartSearches,
  type ChartSearchDefinition,
  type StoredSearchCondition,
} from '../src/store/chart-searches.js';
import { applyRecords, EMPTY_REGISTERS, fold, materialise, resume, snapshotOf } from '../src/store/fold.js';
import { createClock } from '../src/store/hlc.js';
import type { JsonValue } from '../src/store/ops.js';
import type { NoteFieldRegister } from '../src/store/notes.js';
import { append, emptyLog, type Mutation } from '../src/store/oplog.js';
import { savedQueryCreate, SAVED_QUERY_ENTITY } from '../src/store/saved-queries.js';
import { openStore, type Store } from '../src/store/store.js';

const T0 = 1_780_963_200_000;
const SEARCH_ID = 's-abcdefghijklmnop';
const QUERY_ID = 'q-abcdefghijklmnop';

const CONDITIONS: readonly StoredSearchCondition[] = [
  { kind: 'sign', body: 'sun', sign: 4 },
  { kind: 'house', body: 'moon', house: 7 },
  { kind: 'aspect', body: 'mars', aspectKey: 'square', target: { kind: 'angle', angle: 'asc' } },
  { kind: 'aspect', body: 'venus', aspectKey: 'trine', target: { kind: 'body', body: 'jupiter' } },
];
const DEFINITION: ChartSearchDefinition = { version: 1, operator: 'and', conditions: CONDITIONS };

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

function recordsOf(mutations: readonly Mutation[]) {
  let log = emptyLog(createClock('a1b2c3d4e5f60718'));
  for (const mutation of mutations) log = append(log, mutation, T0).log;
  return log.records;
}

describe('the id prefix', () => {
  it('mints an s- id that the id pattern accepts', () => {
    const id = newId('s');
    expect(id).toMatch(/^s-[a-z2-7]{16}$/);
    expect(isId(id)).toBe(true);
  });
});

describe('foldChartSearch', () => {
  it('folds a complete, readable search to ready, holding no as-of date', () => {
    const folded = foldChartSearch(SEARCH_ID, fieldsOf('Fire Suns', DEFINITION));
    expect(folded).toEqual({ status: 'ready', id: SEARCH_ID, name: 'Fire Suns', definition: DEFINITION });
    expect(Object.keys(DEFINITION).sort()).toEqual(['conditions', 'operator', 'version']);
  });

  it('is undefined for an entity with neither register', () => {
    expect(foldChartSearch(SEARCH_ID, {})).toBeUndefined();
  });

  it('keeps an incomplete entity (name only, or definition only), listed and not defaulted', () => {
    expect(foldChartSearch(SEARCH_ID, fieldsOf('Half', undefined))).toEqual({
      status: 'unreadable',
      id: SEARCH_ID,
      name: 'Half',
      reason: 'incomplete',
    });
    expect(foldChartSearch(SEARCH_ID, fieldsOf(undefined, DEFINITION))).toEqual({
      status: 'unreadable',
      id: SEARCH_ID,
      name: '',
      reason: 'incomplete',
    });
  });

  it('keeps a definition from a newer version as future-version, never defaulted', () => {
    expect(foldChartSearch(SEARCH_ID, fieldsOf('Newer', { ...DEFINITION, version: 2, extra: true }))).toEqual({
      status: 'unreadable',
      id: SEARCH_ID,
      name: 'Newer',
      reason: 'future-version',
    });
  });

  it('keeps an unknown condition kind as unknown-condition, with the rest of the list untouched', () => {
    const definition = { ...DEFINITION, conditions: [...CONDITIONS, { kind: 'transit', body: 'sun' }] };
    expect(foldChartSearch(SEARCH_ID, fieldsOf('Timing', definition))).toMatchObject({
      status: 'unreadable',
      name: 'Timing',
      reason: 'unknown-condition',
    });
  });

  it('marks unknown bodies, signs, houses, aspects, angles, operators and wrong types invalid', () => {
    const bad: readonly unknown[] = [
      { ...DEFINITION, operator: 'xor' },
      { ...DEFINITION, conditions: 'nope' },
      { ...DEFINITION, conditions: [] },
      { ...DEFINITION, conditions: [{ kind: 'sign', body: 'vulcan', sign: 1 }] },
      { ...DEFINITION, conditions: [{ kind: 'sign', body: 'sun', sign: 12 }] },
      { ...DEFINITION, conditions: [{ kind: 'house', body: 'sun', house: 0 }] },
      {
        ...DEFINITION,
        conditions: [{ kind: 'aspect', body: 'sun', aspectKey: 'nope', target: { kind: 'angle', angle: 'asc' } }],
      },
      {
        ...DEFINITION,
        conditions: [{ kind: 'aspect', body: 'sun', aspectKey: 'square', target: { kind: 'angle', angle: 'ic' } }],
      },
      { ...DEFINITION, conditions: [null] },
      { ...DEFINITION, version: 0 },
      'text',
      null,
    ];
    for (const definition of bad) {
      expect(foldChartSearch(SEARCH_ID, fieldsOf('Bad', definition))).toMatchObject({
        status: 'unreadable',
        reason: 'invalid',
      });
    }
  });

  it('accepts exactly 10 conditions and keeps 11 as invalid', () => {
    expect(CHART_SEARCH_MAX_CONDITIONS).toBe(10);
    const many = (count: number) => ({
      ...DEFINITION,
      conditions: Array.from({ length: count }, () => ({ kind: 'sign', body: 'sun', sign: 0 })),
    });
    expect(foldChartSearch(SEARCH_ID, fieldsOf('Ten', many(10)))).toMatchObject({ status: 'ready' });
    expect(foldChartSearch(SEARCH_ID, fieldsOf('Eleven', many(11)))).toMatchObject({
      status: 'unreadable',
      reason: 'invalid',
    });
  });

  it('folds a non-string name to the empty string', () => {
    expect(foldChartSearch(SEARCH_ID, fieldsOf(7, DEFINITION))).toMatchObject({ status: 'ready', name: '' });
  });
});

describe('the guard (assertChartSearchMutation)', () => {
  const refusal = (mutation: Mutation): string | undefined => {
    try {
      assertChartSearchMutation(mutation);
      return undefined;
    } catch (error) {
      return error instanceof ChartSearchRefusedError ? error.refusal : 'other';
    }
  };

  it('passes the writes a create, a rename, a delete and a restore make', () => {
    for (const mutation of chartSearchCreate(SEARCH_ID, 'Fine', DEFINITION)) expect(refusal(mutation)).toBeUndefined();
    expect(refusal(chartSearchRename(SEARCH_ID, 'Renamed'))).toBeUndefined();
    for (const value of [true, false]) {
      expect(refusal({ entity: CHART_SEARCH_ENTITY, entityId: SEARCH_ID, field: 'deleted', value })).toBeUndefined();
    }
  });

  it('shares the 500-character name cap', () => {
    expect(MAX_CUSTOM_PROMPT_LENGTH).toBe(500);
    expect(refusal(chartSearchRename(SEARCH_ID, 'a'.repeat(500)))).toBeUndefined();
    expect(refusal(chartSearchRename(SEARCH_ID, 'a'.repeat(501)))).toBe('name-too-long');
  });

  it('refuses a purge write, an unknown field, a non-s id and a non-string name', () => {
    expect(refusal({ entity: CHART_SEARCH_ENTITY, entityId: SEARCH_ID, field: 'purged', value: true })).toBe('invalid');
    expect(refusal({ entity: CHART_SEARCH_ENTITY, entityId: SEARCH_ID, field: 'colour', value: 1 })).toBe('invalid');
    expect(refusal(chartSearchRename(QUERY_ID, 'x'))).toBe('invalid');
    expect(refusal({ entity: CHART_SEARCH_ENTITY, entityId: SEARCH_ID, field: 'name', value: 3 })).toBe('invalid');
  });

  it('refuses an unreadable definition, one over 10 conditions and a future version', () => {
    const write = (value: JsonValue): Mutation => ({
      entity: CHART_SEARCH_ENTITY,
      entityId: SEARCH_ID,
      field: 'definition',
      value,
    });
    const eleven = Array.from({ length: 11 }, () => ({ kind: 'sign', body: 'sun', sign: 0 }));
    expect(refusal(write({ ...DEFINITION, conditions: eleven }))).toBe('invalid');
    expect(refusal(write({ ...DEFINITION, version: 2 }))).toBe('invalid');
    expect(refusal(write({ ...DEFINITION, conditions: [{ kind: 'transit' }] }))).toBe('invalid');
  });

  it('ignores other entity kinds, saved queries included', () => {
    expect(refusal({ entity: SAVED_QUERY_ENTITY, entityId: QUERY_ID, field: 'anything', value: 1 })).toBeUndefined();
  });
});

/** Fold a batch of writes through the real log, so the registers are exactly what the store would hold. */
function stateOf(mutations: readonly Mutation[]) {
  return fold(recordsOf(mutations));
}

const put = (id: string, field: string, value: JsonValue): Mutation => ({
  entity: CHART_SEARCH_ENTITY,
  entityId: id,
  field,
  value,
});

describe('materialise', () => {
  const A = 's-aaaaaaaaaaaaaaaa';
  const B = 's-bbbbbbbbbbbbbbbb';
  const C = 's-cccccccccccccccc';

  it('lists a live search and keeps a tombstoned one in deleted.chartSearches', () => {
    const state = stateOf([
      ...chartSearchCreate(A, 'Live', DEFINITION),
      ...chartSearchCreate(B, 'Gone', DEFINITION),
      put(B, 'deleted', true),
    ]);
    expect([...state.chartSearches.keys()]).toEqual([A]);
    expect([...state.deleted.chartSearches.keys()]).toEqual([B]);
  });

  it('skips a purged entity, checked before incomplete, and records it as erased', () => {
    // What a purge leaves behind: the marker alone, which on its own would fold as an incomplete search.
    const state = stateOf([put(SEARCH_ID, 'purged', true)]);
    expect(state.chartSearches.size).toBe(0);
    expect(state.deleted.chartSearches.size).toBe(0);
    expect(state.erased.chartSearches.has(SEARCH_ID)).toBe(true);
  });

  it('skips a purged entity that is also tombstoned and complete', () => {
    const state = stateOf([
      ...chartSearchCreate(A, 'Both', DEFINITION),
      put(A, 'deleted', true),
      put(A, 'purged', true),
    ]);
    expect(state.chartSearches.size).toBe(0);
    expect(state.deleted.chartSearches.size).toBe(0);
    expect(state.erased.chartSearches.has(A)).toBe(true);
  });

  it('lists unreadable and incomplete searches rather than hiding them', () => {
    const state = stateOf([
      put(A, 'name', 'Newer'),
      put(A, 'definition', { version: 9 }),
      put(B, 'name', 'Half'),
      put(C, 'name', 'Kind'),
      put(C, 'definition', { version: 1, operator: 'and', conditions: [{ kind: 'transit' }] }),
    ]);
    expect(state.chartSearches.get(A)).toMatchObject({ status: 'unreadable', reason: 'future-version' });
    expect(state.chartSearches.get(B)).toMatchObject({ status: 'unreadable', reason: 'incomplete' });
    expect(state.chartSearches.get(C)).toMatchObject({ status: 'unreadable', reason: 'unknown-condition' });
  });

  it('leaves an existing saved query unaffected', () => {
    const queryRecords = recordsOf(
      savedQueryCreate(QUERY_ID, 'Query', {
        tool: 'event-search',
        version: 1,
        parameters: {
          from: '2027-01-01',
          to: '2027-12-31',
          kinds: ['station'],
          stationBody: 'mercury',
          ingressBody: 'sun',
          aspectBodyA: 'jupiter',
          aspectBodyB: 'saturn',
          aspectKey: 'conjunction',
        },
      }),
    );
    const searchRecords = recordsOf(chartSearchCreate(SEARCH_ID, 'Search', DEFINITION));
    const queryOnly = materialise(applyRecords(EMPTY_REGISTERS, queryRecords).registers);
    const both = materialise(applyRecords(EMPTY_REGISTERS, [...queryRecords, ...searchRecords]).registers);
    expect(both.savedQueries).toEqual(queryOnly.savedQueries);
    expect(both.savedQueries.get(QUERY_ID)).toMatchObject({ status: 'ready', name: 'Query' });
    expect(both.chartSearches.size).toBe(1);
    expect(queryOnly.chartSearches.size).toBe(0);
  });

  it('sorts by name, then by id by code unit', () => {
    const state = stateOf([
      ...chartSearchCreate(B, 'Same', DEFINITION),
      ...chartSearchCreate(A, 'Same', DEFINITION),
      ...chartSearchCreate(C, 'Alpha', DEFINITION),
    ]);
    expect(sortedChartSearches(state.chartSearches, 'en').map((s) => s.id)).toEqual([C, A, B]);
  });
});

describe('an older build and an upgrade', () => {
  const OLD_KINDS: readonly string[] = ['person', 'chart', 'birthNote', 'consultationNote', 'savedQuery'];
  const all = recordsOf(chartSearchCreate(SEARCH_ID, 'Seen by newer', DEFINITION));

  it('an older build counts the chartSearch records as unknownEntity and folds none of them', () => {
    const applied = applyRecords(EMPTY_REGISTERS, all, OLD_KINDS);
    expect(applied.skips.unknownEntity).toBe(2);
    expect(applied.registers[CHART_SEARCH_ENTITY]).toBeUndefined();
  });

  it('a snapshot from the older build is rebuilt once, so the search appears after the upgrade', () => {
    const oldSnapshot = snapshotOf(applyRecords(EMPTY_REGISTERS, all, OLD_KINDS).registers, all, OLD_KINDS);
    const resumed = resume(oldSnapshot, all);
    expect(resumed.rebuilt).toBe(true);
    expect(materialise(resumed.registers).chartSearches.get(SEARCH_ID)).toMatchObject({ status: 'ready' });
  });

  it('a snapshot written by this build is resumed, not rebuilt', () => {
    const registers = applyRecords(EMPTY_REGISTERS, all).registers;
    expect(resume(snapshotOf(registers, all), all).rebuilt).toBe(false);
  });
});

describe('the chart-search store round trip', () => {
  let open: Store[] = [];
  let counter = 0;

  afterEach(() => {
    for (const store of open) store.close();
    open = [];
  });

  function ticking(): () => number {
    let millis = T0;
    return () => {
      millis += 1000;
      return millis;
    };
  }

  async function openFresh(name: string): Promise<Store> {
    const store = await openStore({ name, now: ticking() });
    open.push(store);
    return store;
  }

  function freshName(): string {
    counter += 1;
    return `astraya-chart-search-test-${String(counter)}`;
  }

  it('creates a search, renames it, and keeps both across a reopen', async () => {
    const name = freshName();
    const id = newId('s');
    const store = await openFresh(name);
    await store.mutate(chartSearchCreate(id, 'First', DEFINITION));
    await store.mutate([chartSearchRename(id, 'Second')]);
    expect(store.state.chartSearches.get(id)).toEqual({ status: 'ready', id, name: 'Second', definition: DEFINITION });
    store.close();
    open = [];

    const reopened = await openFresh(name);
    expect(reopened.state.chartSearches.get(id)).toEqual({
      status: 'ready',
      id,
      name: 'Second',
      definition: DEFINITION,
    });
  });

  it('deletes with a tombstone, and Undo brings it back exactly', async () => {
    const id = newId('s');
    const store = await openFresh(freshName());
    await store.mutate(chartSearchCreate(id, 'Undoable', DEFINITION));
    await store.remove(CHART_SEARCH_ENTITY, id);
    expect(store.state.chartSearches.has(id)).toBe(false);
    expect(store.state.deleted.chartSearches.get(id)).toMatchObject({ status: 'ready', name: 'Undoable' });
    await store.restore(CHART_SEARCH_ENTITY, id);
    expect(store.state.chartSearches.get(id)).toEqual({
      status: 'ready',
      id,
      name: 'Undoable',
      definition: DEFINITION,
    });
    expect(store.state.deleted.chartSearches.has(id)).toBe(false);
  });

  it('erases permanently and stays gone after a reopen', async () => {
    const name = freshName();
    const id = newId('s');
    const store = await openFresh(name);
    await store.mutate(chartSearchCreate(id, 'Gone', DEFINITION));
    await store.remove(CHART_SEARCH_ENTITY, id);
    await store.purge(CHART_SEARCH_ENTITY, id);
    expect(store.state.erased.chartSearches.has(id)).toBe(true);
    store.close();
    open = [];

    const reopened = await openFresh(name);
    expect(reopened.state.chartSearches.has(id)).toBe(false);
    expect(reopened.state.deleted.chartSearches.has(id)).toBe(false);
  });

  it('refuses an over-long name and a bad definition before anything is written', async () => {
    const id = newId('s');
    const store = await openFresh(freshName());
    await expect(store.mutate(chartSearchCreate(id, 'a'.repeat(501), DEFINITION))).rejects.toBeInstanceOf(
      ChartSearchRefusedError,
    );
    await expect(
      store.mutate([{ entity: CHART_SEARCH_ENTITY, entityId: id, field: 'definition', value: { version: 3 } }]),
    ).rejects.toBeInstanceOf(ChartSearchRefusedError);
    expect(store.state.chartSearches.size).toBe(0);
    expect(store.state.deleted.chartSearches.size).toBe(0);
  });

  it('leaves a saved query alone when a search is created beside it', async () => {
    const store = await openFresh(freshName());
    await store.mutate(
      savedQueryCreate(QUERY_ID, 'Query', {
        tool: 'event-search',
        version: 1,
        parameters: {
          from: '2027-01-01',
          to: '2027-12-31',
          kinds: ['station'],
          stationBody: 'mercury',
          ingressBody: 'sun',
          aspectBodyA: 'jupiter',
          aspectBodyB: 'saturn',
          aspectKey: 'conjunction',
        },
      }),
    );
    await store.mutate(chartSearchCreate(SEARCH_ID, 'Search', DEFINITION));
    await store.remove(CHART_SEARCH_ENTITY, SEARCH_ID);
    expect(store.state.savedQueries.get(QUERY_ID)).toMatchObject({ status: 'ready', name: 'Query' });
    expect(store.state.chartSearches.size).toBe(0);
  });
});
