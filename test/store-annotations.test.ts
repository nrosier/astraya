/**
 * Annotations on pinned events (#1061, ADR 0005 addendum, slice 3): the guard, the fold with forks, and the live
 * store round trip over fake IndexedDB.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { derivedPinId, newId } from '../src/domain/id.js';
import {
  ANNOTATION_ENTITY,
  AnnotationRefusedError,
  annotationRevision,
  assertAnnotationMutation,
  foldAnnotation,
} from '../src/store/annotations.js';
import { EMPTY_REGISTERS, applyRecords, fold, materialise, resume, snapshotOf } from '../src/store/fold.js';
import { createClock } from '../src/store/hlc.js';
import { NOTE_MAX_CHARACTERS, revisionParents } from '../src/store/notes.js';
import { append, emptyLog, type Mutation } from '../src/store/oplog.js';
import type { OpRecord } from '../src/store/ops.js';
import { PIN_ENTITY, pinCreate, pinIdentity, pinTargetOf } from '../src/store/pins.js';
import { openStore, type Store } from '../src/store/store.js';

const T0 = 1_780_963_200_000;
const PIN_ID = 'k-abcdefghijklmnop';
const R1 = 'r-aaaaaaaaaaaaaaaa';
const R2 = 'r-bbbbbbbbbbbbbbbb';
const R3 = 'r-cccccccccccccccc';

function logOf(node: string, entries: readonly (readonly [Mutation, number])[]): readonly OpRecord[] {
  let log = emptyLog(createClock(node));
  for (const [mutation, millis] of entries) log = append(log, mutation, millis).log;
  return log.records;
}

describe('assertAnnotationMutation', () => {
  it('lets other entities through', () => {
    expect(() => {
      assertAnnotationMutation({ entity: 'person', entityId: 'p-abcdefghijklmnop', field: 'x', value: 1 });
    }).not.toThrow();
  });

  it('accepts a revision, including an empty one that clears the note', () => {
    expect(() => {
      assertAnnotationMutation(annotationRevision(PIN_ID, R1, 'Mercury retrograde, again', []));
    }).not.toThrow();
    expect(() => {
      assertAnnotationMutation(annotationRevision(PIN_ID, R2, '', [R1]));
    }).not.toThrow();
  });

  it('accepts exactly the limit and refuses one code point more', () => {
    expect(() => {
      assertAnnotationMutation(annotationRevision(PIN_ID, R1, 'x'.repeat(NOTE_MAX_CHARACTERS), []));
    }).not.toThrow();
    expect(() => {
      assertAnnotationMutation(annotationRevision(PIN_ID, R1, 'x'.repeat(NOTE_MAX_CHARACTERS + 1), []));
    }).toThrow(expect.objectContaining({ refusal: 'too-long' }));
  });

  const body = { text: 'a', parents: [] };
  it.each([
    [
      'a non k- entity id',
      { entity: ANNOTATION_ENTITY, entityId: 'q-abcdefghijklmnop', field: `rev/${R1}`, value: body },
    ],
    ['a deleted field', { entity: ANNOTATION_ENTITY, entityId: PIN_ID, field: 'deleted', value: true }],
    ['a purged field', { entity: ANNOTATION_ENTITY, entityId: PIN_ID, field: 'purged', value: true }],
    ['a revision id that is not r-', { entity: ANNOTATION_ENTITY, entityId: PIN_ID, field: 'rev/oops', value: body }],
    ['a nested field', { entity: ANNOTATION_ENTITY, entityId: PIN_ID, field: `rev/${R1}/x`, value: body }],
    [
      'a body that is not a revision',
      { entity: ANNOTATION_ENTITY, entityId: PIN_ID, field: `rev/${R1}`, value: 'plain' },
    ],
  ])('refuses %s', (_name, mutation) => {
    expect(() => {
      assertAnnotationMutation(mutation);
    }).toThrow(AnnotationRefusedError);
  });
});

describe('foldAnnotation', () => {
  it('has nothing to fold without a revision', () => {
    expect(foldAnnotation(PIN_ID, {})).toBeUndefined();
  });

  it('reads the newest revision as the head, with the older one in the history', () => {
    const state = fold(
      logOf('a1b2c3d4e5f60718', [
        [annotationRevision(PIN_ID, R1, 'first', []), T0],
        [annotationRevision(PIN_ID, R2, 'second', [R1]), T0 + 1000],
      ]),
    );
    const note = state.annotations.get(PIN_ID);
    expect(note?.content).toBe('second');
    expect(note?.forks).toEqual([]);
    expect(note?.revisions.map((revision) => revision.content)).toEqual(['first', 'second']);
  });

  it('keeps both edits made on two devices, as head and fork, in either arrival order', () => {
    const base = logOf('a1b2c3d4e5f60718', [[annotationRevision(PIN_ID, R1, 'base', []), T0]]);
    const a = logOf('a000000000000001', [[annotationRevision(PIN_ID, R2, 'edit on A', [R1]), T0 + 1000]]);
    const b = logOf('b000000000000002', [[annotationRevision(PIN_ID, R3, 'edit on B', [R1]), T0 + 2000]]);
    const forward = fold([...base, ...a, ...b]).annotations.get(PIN_ID);
    const reverse = fold([...b, ...a, ...base]).annotations.get(PIN_ID);
    expect(forward?.content).toBe('edit on B');
    expect(forward?.forks.map((fork) => fork.content)).toEqual(['edit on A']);
    expect(reverse).toEqual(forward);
  });

  it('a save that names every leaf resolves the fork', () => {
    const records = [
      ...logOf('a000000000000001', [[annotationRevision(PIN_ID, R2, 'edit on A', []), T0]]),
      ...logOf('b000000000000002', [[annotationRevision(PIN_ID, R3, 'edit on B', []), T0 + 1000]]),
    ];
    const forked = fold(records).annotations.get(PIN_ID);
    expect(forked?.forks).toHaveLength(1);
    const parents = forked === undefined ? [] : revisionParents(forked);
    const resolving = logOf('c000000000000003', [[annotationRevision(PIN_ID, R1, 'merged', parents), T0 + 2000]]);
    const merged = fold([...records, ...resolving]).annotations.get(PIN_ID);
    expect(merged?.forks).toEqual([]);
    expect(merged?.content).toBe('merged');
  });

  it('ignores a malformed revision from a peer without throwing', () => {
    const records = logOf('a000000000000001', [
      [{ entity: ANNOTATION_ENTITY, entityId: PIN_ID, field: `rev/${R1}`, value: { text: 5, parents: [] } }, T0],
    ]);
    expect(fold(records).annotations.size).toBe(0);
  });

  it('a purge marker from a peer hides the annotation', () => {
    const records = logOf('a000000000000001', [
      [annotationRevision(PIN_ID, R1, 'secret', []), T0],
      [{ entity: ANNOTATION_ENTITY, entityId: PIN_ID, field: 'purged', value: true }, T0 + 1000],
    ]);
    expect(fold(records).annotations.size).toBe(0);
  });
});

describe('the annotation store round trip', () => {
  let open: Store[] = [];
  let counter = 0;

  afterEach(() => {
    for (const store of open) store.close();
    open = [];
  });

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

  function freshName(): string {
    counter += 1;
    return `astraya-annotation-test-${String(counter)}`;
  }

  const target = pinTargetOf({ kind: 'lunation', jd: 2461466, label: 'New Moon' });

  it('saves, edits and keeps the note across a reopen', async () => {
    const name = freshName();
    const id = await derivedPinId(pinIdentity(target));
    const first = await reopen(name);
    await first.mutate(pinCreate(id, target));
    await first.mutate([annotationRevision(id, newId('r'), 'first thought', [])]);
    const head = first.state.annotations.get(id);
    expect(head?.content).toBe('first thought');
    const parents = head === undefined ? [] : revisionParents(head);
    await first.mutate([annotationRevision(id, newId('r'), 'second thought', parents)]);
    expect(first.state.annotations.get(id)?.content).toBe('second thought');
    first.close();
    open = open.filter((store) => store !== first);

    const second = await reopen(name);
    expect(second.state.annotations.get(id)?.content).toBe('second thought');
    expect(second.state.annotations.get(id)?.revisions).toHaveLength(2);
  });

  it('keeps the text when the pin is unpinned and shows it again on pinning again', async () => {
    const store = await reopen(freshName());
    const id = await derivedPinId(pinIdentity(target));
    await store.mutate(pinCreate(id, target));
    await store.mutate([annotationRevision(id, newId('r'), 'remember this', [])]);
    await store.remove(PIN_ENTITY, id);
    expect(store.state.pins.has(id)).toBe(false);
    await store.mutate(pinCreate(id, target));
    expect(store.state.pins.has(id)).toBe(true);
    expect(store.state.annotations.get(id)?.content).toBe('remember this');
  });

  it('refuses to purge an annotation, since its derived id would block annotating that pin for good', async () => {
    const store = await reopen(freshName());
    const id = await derivedPinId(pinIdentity(target));
    await store.mutate([annotationRevision(id, newId('r'), 'keep', [])]);
    await expect(store.purge(ANNOTATION_ENTITY, id)).rejects.toBeInstanceOf(AnnotationRefusedError);
    expect(store.state.annotations.has(id)).toBe(true);
  });

  it('a pin purge marker from a peer also erases the annotation on this device', async () => {
    const store = await reopen(freshName());
    const id = await derivedPinId(pinIdentity(target));
    await store.mutate(pinCreate(id, target));
    await store.mutate([annotationRevision(id, newId('r'), 'private words', [])]);
    const marker: Mutation = { entity: PIN_ENTITY, entityId: id, field: 'purged', value: true };
    await store.receive(logOf('b0000000000000ff', [[marker, T0 + 60_000]]));
    expect(store.state.pins.has(id)).toBe(false);
    expect(store.state.annotations.has(id)).toBe(false);
  });

  it('refuses an over-long note before the log is touched', async () => {
    const store = await reopen(freshName());
    const id = await derivedPinId(pinIdentity(target));
    const tooLong = 'x'.repeat(NOTE_MAX_CHARACTERS + 1);
    await expect(store.mutate([annotationRevision(id, newId('r'), tooLong, [])])).rejects.toBeInstanceOf(
      AnnotationRefusedError,
    );
    expect(store.state.annotations.size).toBe(0);
  });

  it('a second account on the same device sees none of the first account annotations', async () => {
    const first = await reopen(freshName());
    const second = await reopen(freshName());
    const id = await derivedPinId(pinIdentity(target));
    await first.mutate([annotationRevision(id, newId('r'), 'mine', [])]);
    expect(second.state.annotations.size).toBe(0);
  });
});

describe('an older build and an upgrade (ADR 0005)', () => {
  const OLD_BUILD_KINDS: readonly string[] = [
    'person',
    'chart',
    'birthNote',
    'consultationNote',
    'savedQuery',
    'pin',
    'account',
  ];

  function records(): readonly OpRecord[] {
    return logOf('a1b2c3d4e5f60718', [[annotationRevision(PIN_ID, R1, 'seen by newer', []), T0]]);
  }

  it('an older build counts the annotation records as unknownEntity and folds none of them', () => {
    const applied = applyRecords(EMPTY_REGISTERS, records(), OLD_BUILD_KINDS);
    expect(applied.skips.unknownEntity).toBe(1);
    expect(applied.registers[ANNOTATION_ENTITY]).toBeUndefined();
  });

  it('a snapshot from the older build is rebuilt, so the note appears after the upgrade', () => {
    const all = records();
    const oldRegisters = applyRecords(EMPTY_REGISTERS, all, OLD_BUILD_KINDS).registers;
    const resumed = resume(snapshotOf(oldRegisters, all, OLD_BUILD_KINDS), all);
    expect(resumed.rebuilt).toBe(true);
    expect(materialise(resumed.registers).annotations.get(PIN_ID)?.content).toBe('seen by newer');
  });

  it('a snapshot written by this build is resumed, not rebuilt', () => {
    const all = records();
    const registers = applyRecords(EMPTY_REGISTERS, all).registers;
    expect(resume(snapshotOf(registers, all), all).rebuilt).toBe(false);
  });
});
