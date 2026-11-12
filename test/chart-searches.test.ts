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
  CHART_SEARCH_SCOPES,
  ChartSearchRefusedError,
  assertChartSearchMutation,
  chartSearchCreate,
  chartSearchRename,
  foldChartSearch,
  readChartSearchDefinition,
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
  { kind: 'sign', scope: 'natal', body: 'sun', sign: 4 },
  { kind: 'house', scope: 'natal', body: 'moon', house: 7 },
  { kind: 'aspect', scope: 'natal', body: 'mars', aspectKey: 'square', target: { kind: 'angle', angle: 'asc' } },
  { kind: 'aspect', scope: 'natal', body: 'venus', aspectKey: 'trine', target: { kind: 'body', body: 'jupiter' } },
];
const DEFINITION: ChartSearchDefinition = { version: 2, operator: 'and', conditions: CONDITIONS };

/** One condition per timing scope, as a version-2 definition stores them. */
const TIMING_CONDITIONS: readonly StoredSearchCondition[] = [
  { kind: 'aspect', scope: 'transit', body: 'saturn', aspectKey: 'square', target: { kind: 'angle', angle: 'mc' } },
  { kind: 'aspect', scope: 'transit', body: 'moon', aspectKey: 'conjunction', target: { kind: 'angle', angle: 'asc' } },
  { kind: 'aspect', scope: 'progression', body: 'sun', aspectKey: 'trine', target: { kind: 'body', body: 'venus' } },
  { kind: 'aspect', scope: 'progression', body: 'moon', aspectKey: 'sextile', target: { kind: 'angle', angle: 'asc' } },
  { kind: 'sign', scope: 'solarReturn', body: 'moon', sign: 9 },
  { kind: 'house', scope: 'solarReturn', body: 'jupiter', house: 10 },
  { kind: 'aspect', scope: 'solarReturn', body: 'mars', aspectKey: 'square', target: { kind: 'body', body: 'sun' } },
  { kind: 'sign', scope: 'lunarReturn', body: 'sun', sign: 2 },
  { kind: 'house', scope: 'lunarReturn', body: 'venus', house: 4 },
  {
    kind: 'aspect',
    scope: 'lunarReturn',
    body: 'moon',
    aspectKey: 'opposition',
    target: { kind: 'angle', angle: 'mc' },
  },
];
const TIMING_DEFINITION: ChartSearchDefinition = { version: 2, operator: 'or', conditions: TIMING_CONDITIONS };

/** What version 1 wrote: no `scope` key on any condition. */
const V1_DEFINITION = {
  version: 1,
  operator: 'and',
  conditions: [
    { kind: 'sign', body: 'sun', sign: 4 },
    { kind: 'house', body: 'moon', house: 7 },
    { kind: 'aspect', body: 'mars', aspectKey: 'square', target: { kind: 'angle', angle: 'asc' } },
  ],
};

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
    expect(foldChartSearch(SEARCH_ID, fieldsOf('Newer', { ...DEFINITION, version: 3, extra: true }))).toEqual({
      status: 'unreadable',
      id: SEARCH_ID,
      name: 'Newer',
      reason: 'future-version',
    });
  });

  it('keeps an unknown condition kind as unknown-condition, with the rest of the list untouched', () => {
    const definition = { ...DEFINITION, conditions: [...CONDITIONS, { kind: 'comet', scope: 'natal', body: 'sun' }] };
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
      { ...DEFINITION, conditions: [{ kind: 'sign', scope: 'natal', body: 'vulcan', sign: 1 }] },
      { ...DEFINITION, conditions: [{ kind: 'sign', scope: 'natal', body: 'sun', sign: 12 }] },
      { ...DEFINITION, conditions: [{ kind: 'house', scope: 'natal', body: 'sun', house: 0 }] },
      {
        ...DEFINITION,
        conditions: [
          { kind: 'aspect', scope: 'natal', body: 'sun', aspectKey: 'nope', target: { kind: 'angle', angle: 'asc' } },
        ],
      },
      {
        ...DEFINITION,
        conditions: [
          { kind: 'aspect', scope: 'natal', body: 'sun', aspectKey: 'square', target: { kind: 'angle', angle: 'ic' } },
        ],
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
      conditions: Array.from({ length: count }, () => ({ kind: 'sign', scope: 'natal', body: 'sun', sign: 0 })),
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

describe('timing scopes and versions', () => {
  const fold2 = (definition: unknown) => foldChartSearch(SEARCH_ID, fieldsOf('Timing', definition));
  const manyTiming = (count: number): ChartSearchDefinition => ({
    ...TIMING_DEFINITION,
    conditions: [...TIMING_CONDITIONS, ...TIMING_CONDITIONS].slice(0, count),
  });

  it('round-trips a version-2 definition with every timing scope, byte for byte', () => {
    expect(new Set(TIMING_CONDITIONS.map((condition) => condition.scope))).toEqual(
      new Set<string>(CHART_SEARCH_SCOPES.filter((scope) => scope !== 'natal')),
    );
    expect(fold2(TIMING_DEFINITION)).toEqual({
      status: 'ready',
      id: SEARCH_ID,
      name: 'Timing',
      definition: TIMING_DEFINITION,
    });
    const state = stateOf(chartSearchCreate(SEARCH_ID, 'Timing', TIMING_DEFINITION));
    expect(state.chartSearches.get(SEARCH_ID)).toMatchObject({ status: 'ready', definition: TIMING_DEFINITION });
    expect(Object.keys(TIMING_DEFINITION).sort()).toEqual(['conditions', 'operator', 'version']);
  });

  it('stores the transiting body of a transit-to-angle condition, any body key', () => {
    for (const body of ['moon', 'sun', 'saturn', 'chiron']) {
      const condition = {
        kind: 'aspect',
        scope: 'transit',
        body,
        aspectKey: 'square',
        target: { kind: 'angle', angle: 'asc' },
      };
      const folded = fold2({ ...TIMING_DEFINITION, conditions: [condition] });
      expect(folded).toMatchObject({ status: 'ready' });
    }
  });

  it('reads a version-1 definition as natal-only, with no timing condition', () => {
    const folded = fold2(V1_DEFINITION);
    expect(folded).toMatchObject({ status: 'ready' });
    if (folded?.status !== 'ready') return;
    expect(folded.definition.version).toBe(2);
    expect(folded.definition.conditions).toHaveLength(3);
    expect(folded.definition.conditions.every((condition) => condition.scope === 'natal')).toBe(true);
  });

  it('keeps a version-1 condition that carries a scope as invalid', () => {
    expect(fold2({ ...V1_DEFINITION, conditions: [{ ...V1_DEFINITION.conditions[0], scope: 'natal' }] })).toMatchObject(
      {
        status: 'unreadable',
        reason: 'invalid',
      },
    );
  });

  it('keeps a version-2 condition without scope as invalid, never defaulted', () => {
    expect(fold2({ ...DEFINITION, conditions: [{ kind: 'sign', body: 'sun', sign: 4 }] })).toMatchObject({
      status: 'unreadable',
      reason: 'invalid',
    });
    expect(fold2({ ...DEFINITION, conditions: [{ kind: 'sign', scope: null, body: 'sun', sign: 4 }] })).toMatchObject({
      reason: 'invalid',
    });
  });

  it('keeps an unknown scope string as unknown-condition', () => {
    expect(
      fold2({ ...DEFINITION, conditions: [{ kind: 'sign', scope: 'saturnReturn', body: 'sun', sign: 4 }] }),
    ).toMatchObject({ status: 'unreadable', reason: 'unknown-condition' });
  });

  it('accepts a transit sign and a progression house condition, and round-trips them', () => {
    const conditions: readonly StoredSearchCondition[] = [
      { kind: 'sign', scope: 'transit', body: 'saturn', sign: 11 },
      { kind: 'house', scope: 'progression', body: 'moon', house: 8 },
    ];
    const definition: ChartSearchDefinition = { version: 2, operator: 'and', conditions };
    for (const mutation of chartSearchCreate(SEARCH_ID, 'Moving', definition)) assertChartSearchMutation(mutation);
    expect(readChartSearchDefinition(definition)).toEqual(definition);
    expect(fold2(definition)).toMatchObject({ status: 'ready', definition });
    const stored = chartSearchCreate(SEARCH_ID, 'Moving', definition)[1]?.value;
    expect(readChartSearchDefinition(stored)).toEqual(definition);
  });

  it('still refuses out-of-range sign and house values for transit and progression', () => {
    for (const scope of ['transit', 'progression']) {
      expect(fold2({ ...DEFINITION, conditions: [{ kind: 'sign', scope, body: 'sun', sign: 12 }] })).toMatchObject({
        reason: 'invalid',
      });
      expect(fold2({ ...DEFINITION, conditions: [{ kind: 'house', scope, body: 'sun', house: 0 }] })).toMatchObject({
        reason: 'invalid',
      });
    }
    expect(() => {
      for (const m of chartSearchCreate(SEARCH_ID, 'x', {
        version: 2,
        operator: 'and',
        conditions: [{ kind: 'house', scope: 'transit', body: 'sun', house: 13 }],
      })) {
        assertChartSearchMutation(m);
      }
    }).toThrow(ChartSearchRefusedError);
  });

  it('keeps a version above 2 as future-version, listed and not refused by the fold', () => {
    const future = { ...TIMING_DEFINITION, version: 3, conditions: [{ kind: 'newkind', scope: 'newscope' }] };
    expect(fold2(future)).toEqual({ status: 'unreadable', id: SEARCH_ID, name: 'Timing', reason: 'future-version' });
    const state = stateOf([put(SEARCH_ID, 'name', 'Timing'), put(SEARCH_ID, 'definition', future)]);
    expect(state.chartSearches.get(SEARCH_ID)).toMatchObject({ status: 'unreadable', reason: 'future-version' });
  });

  it('accepts 10 timing conditions and refuses an 11th, in the fold and in the guard', () => {
    expect(fold2(manyTiming(10))).toMatchObject({ status: 'ready' });
    expect(fold2(manyTiming(11))).toMatchObject({ status: 'unreadable', reason: 'invalid' });
    const guard = (count: number) => () => {
      for (const mutation of chartSearchCreate(SEARCH_ID, 'Timing', manyTiming(count))) {
        assertChartSearchMutation(mutation);
      }
    };
    expect(guard(10)).not.toThrow();
    expect(guard(11)).toThrow(ChartSearchRefusedError);
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
    const eleven = Array.from({ length: 11 }, () => ({ kind: 'sign', scope: 'natal', body: 'sun', sign: 0 }));
    expect(refusal(write({ ...DEFINITION, conditions: eleven }))).toBe('invalid');
    expect(refusal(write({ ...DEFINITION, version: 3 }))).toBe('invalid');
    expect(refusal(write(V1_DEFINITION))).toBe('invalid');
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
