/**
 * Pinned event-search results (#1061, ADR 0005 addendum, slice 2): the derived id, the pure fold and guard rules,
 * and the live store round trip over fake IndexedDB.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { EventSearchResult } from '../src/domain/event-search.js';
import { derivedPinId, isId } from '../src/domain/id.js';
import { EMPTY_REGISTERS, applyRecords, fold, materialise, resume, snapshotOf } from '../src/store/fold.js';
import { createClock } from '../src/store/hlc.js';
import { append, emptyLog, type Mutation } from '../src/store/oplog.js';
import type { OpRecord } from '../src/store/ops.js';
import type { NoteFieldRegister } from '../src/store/notes.js';
import {
  PIN_ENTITY,
  PinRefusedError,
  assertPinMutation,
  foldPin,
  pinCreate,
  pinIdentity,
  pinTargetOf,
  sortedPins,
  type Pin,
  type PinTarget,
} from '../src/store/pins.js';
import { openStore, type Store } from '../src/store/store.js';

const T0 = 1_780_963_200_000;
// 2027-03-01T12:00:00Z as a Julian day.
const JD = 2461466;

const RESULT: EventSearchResult = {
  kind: 'aspect',
  jd: JD,
  bodyKey: 'jupiter',
  relatedBodyKey: 'saturn',
  aspectKey: 'conjunction',
  label: 'jupiter exact conjunction saturn',
};

function register(value: unknown, millis = T0): NoteFieldRegister {
  return { value, hlc: `${String(millis).padStart(18, '0')}-00000-a1b2c3d4e5f60718` };
}

const TARGET = pinTargetOf(RESULT);

describe('pin target and identity', () => {
  it('rounds the instant to whole seconds since the epoch', () => {
    expect(TARGET.at).toBe(Math.round((JD - 2440587.5) * 86_400));
    expect(Number.isInteger(TARGET.at)).toBe(true);
  });

  it('omits the keys a result does not have', () => {
    const target = pinTargetOf({ kind: 'lunation', jd: JD, label: 'New Moon' });
    expect('bodyKey' in target).toBe(false);
    expect('aspectKey' in target).toBe(false);
  });

  it('does not put the label in the identity', () => {
    expect(pinIdentity({ ...TARGET, label: 'reworded' })).toBe(pinIdentity(TARGET));
  });

  it('separates results that differ in any identity part', () => {
    const others: PinTarget[] = [
      { ...TARGET, kind: 'station' },
      { ...TARGET, at: TARGET.at + 1 },
      { ...TARGET, bodyKey: 'mars' },
      { ...TARGET, relatedBodyKey: 'mars' },
      { ...TARGET, aspectKey: 'square' },
    ];
    const identities = new Set([pinIdentity(TARGET), ...others.map(pinIdentity)]);
    expect(identities.size).toBe(others.length + 1);
  });
});

describe('derived pin id', () => {
  it('is a valid k- id and the same for the same identity', async () => {
    const first = await derivedPinId(pinIdentity(TARGET));
    const second = await derivedPinId(pinIdentity(pinTargetOf(RESULT)));
    expect(first).toMatch(/^k-[a-z2-7]{16}$/);
    expect(isId(first)).toBe(true);
    expect(second).toBe(first);
  });

  it('differs for a different identity', async () => {
    const other = await derivedPinId(pinIdentity({ ...TARGET, at: TARGET.at + 1 }));
    expect(other).not.toBe(await derivedPinId(pinIdentity(TARGET)));
  });
});

describe('foldPin', () => {
  const id = 'k-abcdefghijklmnop';

  it('reads a valid target', () => {
    expect(foldPin(id, { target: register({ ...TARGET }) })).toEqual({ status: 'ready', id, target: TARGET });
  });

  it('has nothing to fold without a target', () => {
    expect(foldPin(id, {})).toBeUndefined();
  });

  it('keeps a target from a newer version as unreadable, never defaulted', () => {
    expect(foldPin(id, { target: register({ ...TARGET, version: 2 }) })).toEqual({
      status: 'unreadable',
      id,
      reason: 'future-version',
    });
  });

  it('keeps an unknown tool as unreadable', () => {
    expect(foldPin(id, { target: register({ ...TARGET, tool: 'chart-search' }) })).toMatchObject({
      reason: 'unknown-tool',
    });
  });

  it.each([
    ['a non-object', 'x'],
    ['a missing kind', { ...TARGET, kind: undefined }],
    ['an unknown kind', { ...TARGET, kind: 'eclipse' }],
    ['a fractional instant', { ...TARGET, at: 1.5 }],
    ['an unknown body', { ...TARGET, bodyKey: 'planet-x' }],
    ['an unknown aspect', { ...TARGET, aspectKey: 'nope' }],
    ['a non-string label', { ...TARGET, label: 7 }],
    ['an over-long label', { ...TARGET, label: 'x'.repeat(201) }],
    ['a zero version', { ...TARGET, version: 0 }],
  ])('folds %s to unreadable without throwing', (_name, value) => {
    expect(foldPin(id, { target: register(value) })).toMatchObject({ status: 'unreadable', reason: 'invalid' });
  });
});

describe('assertPinMutation', () => {
  const id = 'k-abcdefghijklmnop';

  it('lets other entities through', () => {
    expect(() => {
      assertPinMutation({ entity: 'person', entityId: 'p-abcdefghijklmnop', field: 'anything', value: 1 });
    }).not.toThrow();
  });

  it('accepts a target and a tombstone', () => {
    for (const mutation of pinCreate(id, TARGET)) {
      expect(() => {
        assertPinMutation(mutation);
      }).not.toThrow();
    }
    expect(() => {
      assertPinMutation({ entity: PIN_ENTITY, entityId: id, field: 'deleted', value: true });
    }).not.toThrow();
  });

  it.each([
    ['a non k- id', { entity: PIN_ENTITY, entityId: 'q-abcdefghijklmnop', field: 'target', value: { ...TARGET } }],
    ['a purged field', { entity: PIN_ENTITY, entityId: id, field: 'purged', value: true }],
    ['an unknown field', { entity: PIN_ENTITY, entityId: id, field: 'note', value: 'x' }],
    ['a non-boolean tombstone', { entity: PIN_ENTITY, entityId: id, field: 'deleted', value: 'yes' }],
    ['an unreadable target', { entity: PIN_ENTITY, entityId: id, field: 'target', value: { ...TARGET, kind: 'x' } }],
  ])('refuses %s', (_name, mutation) => {
    expect(() => {
      assertPinMutation(mutation);
    }).toThrow(PinRefusedError);
  });
});

describe('sortedPins', () => {
  const pin = (id: string, at: number): Pin => ({ status: 'ready', id, target: { ...TARGET, at } });

  it('sorts by instant, then id by code unit, whatever the insertion order', () => {
    const a = pin('k-bbbbbbbbbbbbbbbb', 10);
    const b = pin('k-aaaaaaaaaaaaaaaa', 10);
    const c = pin('k-cccccccccccccccc', 5);
    const forward = sortedPins(new Map([a, b, c].map((p) => [p.id, p])));
    const reverse = sortedPins(new Map([c, b, a].map((p) => [p.id, p])));
    expect(forward.map((p) => p.id)).toEqual([c.id, b.id, a.id]);
    expect(reverse).toEqual(forward);
  });

  it('puts an unreadable pin last', () => {
    const bad: Pin = { status: 'unreadable', id: 'k-aaaaaaaaaaaaaaaa', reason: 'invalid' };
    const good = pin('k-zzzzzzzzzzzzzzzz', 99);
    expect(sortedPins(new Map([bad, good].map((p) => [p.id, p]))).map((p) => p.id)).toEqual([good.id, bad.id]);
  });
});

describe('the pin store round trip', () => {
  let open: Store[] = [];
  let counter = 0;

  afterEach(() => {
    for (const store of open) store.close();
    open = [];
  });

  function freshName(): string {
    counter += 1;
    return `astraya-pin-test-${String(counter)}`;
  }

  async function reopen(name: string): Promise<Store> {
    let millis = T0;
    const store = await openStore({
      name,
      now: () => {
        millis += 1000;
        return millis;
      },
    });
    open.push(store);
    return store;
  }

  it('pins a result and keeps it across a reopen', async () => {
    const name = freshName();
    const id = await derivedPinId(pinIdentity(TARGET));
    const first = await reopen(name);
    await first.mutate(pinCreate(id, TARGET));
    expect(first.state.pins.get(id)).toEqual({ status: 'ready', id, target: TARGET });
    first.close();
    open = open.filter((store) => store !== first);

    const second = await reopen(name);
    expect(second.state.pins.get(id)).toMatchObject({ status: 'ready', target: TARGET });
  });

  it('pinning the same result twice is one pin', async () => {
    const store = await reopen(freshName());
    const id = await derivedPinId(pinIdentity(TARGET));
    await store.mutate(pinCreate(id, TARGET));
    await store.mutate(pinCreate(id, { ...TARGET, label: 'reworded' }));
    expect(store.state.pins.size).toBe(1);
  });

  it('unpins with a tombstone and Undo brings it back', async () => {
    const store = await reopen(freshName());
    const id = await derivedPinId(pinIdentity(TARGET));
    await store.mutate(pinCreate(id, TARGET));

    await store.remove(PIN_ENTITY, id);
    expect(store.state.pins.has(id)).toBe(false);
    expect(store.state.deleted.pins.get(id)).toMatchObject({ status: 'ready' });

    await store.restore(PIN_ENTITY, id);
    expect(store.state.pins.get(id)).toMatchObject({ status: 'ready', target: TARGET });
    expect(store.state.deleted.pins.has(id)).toBe(false);
  });

  it('refuses an invalid write before the log is touched', async () => {
    const store = await reopen(freshName());
    await expect(
      store.mutate([{ entity: PIN_ENTITY, entityId: 'k-abcdefghijklmnop', field: 'purged', value: true }]),
    ).rejects.toBeInstanceOf(PinRefusedError);
    expect(store.state.pins.size).toBe(0);
  });

  it('a second account on the same device sees none of the first account’s pins', async () => {
    const first = await reopen(freshName());
    const second = await reopen(freshName());
    const id = await derivedPinId(pinIdentity(TARGET));
    await first.mutate(pinCreate(id, TARGET));
    expect(second.state.pins.size).toBe(0);
  });

  it('refuses to purge a pin, since a derived id would block pinning that event for good', async () => {
    const store = await reopen(freshName());
    const id = await derivedPinId(pinIdentity(TARGET));
    await store.mutate(pinCreate(id, TARGET));
    await expect(store.purge(PIN_ENTITY, id)).rejects.toBeInstanceOf(PinRefusedError);
    expect(store.state.pins.has(id)).toBe(true);
  });

  it('a purge marker from a peer hides the pin from both lists', async () => {
    const store = await reopen(freshName());
    const id = await derivedPinId(pinIdentity(TARGET));
    await store.mutate(pinCreate(id, TARGET));
    const marker: Mutation = { entity: PIN_ENTITY, entityId: id, field: 'purged', value: true };
    await store.receive(append(emptyLog(createClock('b0000000000000ff')), marker, T0 + 60_000).log.records);
    expect(store.state.pins.has(id)).toBe(false);
    expect(store.state.deleted.pins.has(id)).toBe(false);
  });

  it('a pin made on one device wins over an unpin made on another that had not synced', async () => {
    const id = await derivedPinId(pinIdentity(TARGET));
    // Device A pins then unpins; device B never saw either and pins the same result later.
    let a = emptyLog(createClock('a000000000000001'));
    for (const mutation of pinCreate(id, TARGET)) a = append(a, mutation, T0).log;
    a = append(a, { entity: PIN_ENTITY, entityId: id, field: 'deleted', value: true }, T0 + 1000).log;
    let b = emptyLog(createClock('b000000000000002'));
    for (const mutation of pinCreate(id, TARGET)) b = append(b, mutation, T0 + 2000).log;

    const ab = fold([...a.records, ...b.records]);
    const ba = fold([...b.records, ...a.records]);
    expect(ab.pins.has(id)).toBe(true);
    expect(ba.pins.has(id)).toBe(true);
    expect(ab.deleted.pins.has(id)).toBe(false);
  });
});

describe('folding pins from records', () => {
  it('an empty log folds to no pins', () => {
    const state = fold([]);
    expect(state.pins.size).toBe(0);
    expect(state.deleted.pins.size).toBe(0);
  });
});

describe('an older build and an upgrade (ADR 0005)', () => {
  const OLD_BUILD_KINDS: readonly string[] = ['person', 'chart', 'birthNote', 'consultationNote', 'savedQuery'];
  const id = 'k-abcdefghijklmnop';

  function records(): readonly OpRecord[] {
    let log = emptyLog(createClock('a1b2c3d4e5f60718'));
    for (const mutation of pinCreate(id, TARGET)) log = append(log, mutation, T0).log;
    return log.records;
  }

  it('an older build counts the pin records as unknownEntity and folds none of them', () => {
    const applied = applyRecords(EMPTY_REGISTERS, records(), OLD_BUILD_KINDS);
    expect(applied.skips.unknownEntity).toBe(2);
    expect(applied.registers[PIN_ENTITY]).toBeUndefined();
  });

  it('a snapshot from the older build is rebuilt, so the pin appears after the upgrade', () => {
    const all = records();
    const oldSnapshot = snapshotOf(applyRecords(EMPTY_REGISTERS, all, OLD_BUILD_KINDS).registers, all, OLD_BUILD_KINDS);
    const resumed = resume(oldSnapshot, all);
    expect(resumed.rebuilt).toBe(true);
    expect(materialise(resumed.registers).pins.get(id)).toMatchObject({ status: 'ready' });
  });

  it('a snapshot written by this build is resumed, not rebuilt', () => {
    const all = records();
    const registers = applyRecords(EMPTY_REGISTERS, all).registers;
    expect(resume(snapshotOf(registers, all), all).rebuilt).toBe(false);
  });
});
