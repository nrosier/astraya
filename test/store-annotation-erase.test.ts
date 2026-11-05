/**
 * Erasing a pin's annotation (#1195, decisions X1-X3): the purge marker and the pointer to a fresh annotation id are
 * written together, so the text is gone for good and the pin can be annotated again.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { derivedPinId, isId, newId } from '../src/domain/id.js';
import {
  ANNOTATION_ENTITY,
  AnnotationRefusedError,
  annotationRevision,
  assertAnnotationMutation,
  readAnnotationPointer,
} from '../src/store/annotations.js';
import { fold } from '../src/store/fold.js';
import { createClock } from '../src/store/hlc.js';
import { revisionParents } from '../src/store/notes.js';
import { append, emptyLog, type Mutation } from '../src/store/oplog.js';
import type { OpRecord } from '../src/store/ops.js';
import {
  PIN_ENTITY,
  PinRefusedError,
  assertPinMutation,
  pinAnnotationPointer,
  pinCreate,
  pinIdentity,
  pinTargetOf,
} from '../src/store/pins.js';
import { stageResearchRestore, buildResearchExport } from '../src/domain/research-export.js';
import { openStore, type Store } from '../src/store/store.js';

const T0 = 1_780_963_200_000;
const TARGET = pinTargetOf({ kind: 'lunation', jd: 2461466, label: 'New Moon' });
const N1 = 'n-aaaaaaaaaaaaaaaa';
const N2 = 'n-bbbbbbbbbbbbbbbb';

function logOf(node: string, entries: readonly (readonly [Mutation, number])[]): readonly OpRecord[] {
  let log = emptyLog(createClock(node));
  for (const [mutation, millis] of entries) log = append(log, mutation, millis).log;
  return log.records;
}

describe('the n- id and the pin pointer', () => {
  it('generates valid n- ids', () => {
    expect(newId('n')).toMatch(/^n-[a-z2-7]{16}$/);
    expect(isId(newId('n'))).toBe(true);
  });

  it('reads only an n- id as a pointer', () => {
    expect(readAnnotationPointer(N1)).toBe(N1);
    expect(readAnnotationPointer('k-aaaaaaaaaaaaaaaa')).toBeUndefined();
    expect(readAnnotationPointer('nope')).toBeUndefined();
    expect(readAnnotationPointer(5)).toBeUndefined();
  });

  it('the pin guard accepts a pointer to an n- id and refuses anything else', () => {
    expect(() => {
      assertPinMutation(pinAnnotationPointer('k-abcdefghijklmnop', N1));
    }).not.toThrow();
    expect(() => {
      assertPinMutation(pinAnnotationPointer('k-abcdefghijklmnop', 'k-bbbbbbbbbbbbbbbb'));
    }).toThrow(PinRefusedError);
  });

  it('the annotation guard accepts a revision on an n- entity and still refuses other entity ids', () => {
    expect(() => {
      assertAnnotationMutation(annotationRevision(N1, 'r-aaaaaaaaaaaaaaaa', 'text', []));
    }).not.toThrow();
    expect(() => {
      assertAnnotationMutation(annotationRevision('q-aaaaaaaaaaaaaaaa', 'r-aaaaaaaaaaaaaaaa', 'text', []));
    }).toThrow(AnnotationRefusedError);
  });
});

describe('folding a pointer', () => {
  const PIN = 'k-abcdefghijklmnop';

  it('shows the annotation at the pointed id, and nothing from the old one', () => {
    const state = fold(
      logOf('a1b2c3d4e5f60718', [
        ...pinCreate(PIN, TARGET).map((m, i) => [m, T0 + i * 100] as const),
        [annotationRevision(PIN, 'r-aaaaaaaaaaaaaaaa', 'old text', []), T0 + 1000],
        [pinAnnotationPointer(PIN, N1), T0 + 2000],
        [annotationRevision(N1, 'r-bbbbbbbbbbbbbbbb', 'new text', []), T0 + 3000],
      ]),
    );
    expect(state.annotations.get(PIN)?.content).toBe('new text');
    expect(state.annotationEntities.get(PIN)).toBe(N1);
  });

  it('ignores a pointer that is not an n- id and reads the pin’s own id', () => {
    const state = fold(
      logOf('a1b2c3d4e5f60718', [
        [{ entity: PIN_ENTITY, entityId: PIN, field: 'annotation', value: 'k-bbbbbbbbbbbbbbbb' }, T0],
        [annotationRevision(PIN, 'r-aaaaaaaaaaaaaaaa', 'own', []), T0 + 1000],
      ]),
    );
    expect(state.annotations.get(PIN)?.content).toBe('own');
    expect(state.annotationEntities.has(PIN)).toBe(false);
  });

  it('last pointer wins whatever the arrival order, and the other note stays in the log', () => {
    const a = logOf('a000000000000001', [
      [pinAnnotationPointer(PIN, N1), T0],
      [annotationRevision(N1, 'r-aaaaaaaaaaaaaaaa', 'from A', []), T0 + 100],
    ]);
    const b = logOf('b000000000000002', [
      [pinAnnotationPointer(PIN, N2), T0 + 1000],
      [annotationRevision(N2, 'r-bbbbbbbbbbbbbbbb', 'from B', []), T0 + 1100],
    ]);
    const forward = fold([...a, ...b]);
    const reverse = fold([...b, ...a]);
    expect(forward.annotations.get(PIN)?.content).toBe('from B');
    expect(reverse.annotations.get(PIN)?.content).toBe('from B');
    expect(forward.annotationEntities.get(PIN)).toBe(N2);
  });
});

describe('Store.eraseAnnotation', () => {
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
    return `astraya-annotation-erase-test-${String(counter)}`;
  }

  async function annotated(store: Store, text: string): Promise<string> {
    const id = await derivedPinId(pinIdentity(TARGET));
    await store.mutate(pinCreate(id, TARGET));
    await store.mutate([annotationRevision(id, newId('r'), text, [])]);
    return id;
  }

  it('erases the text for good, on this device and in what would be pushed', async () => {
    const store = await reopen(freshName());
    const id = await annotated(store, 'private words');
    expect(JSON.stringify(store.outgoing())).toContain('private words');

    await store.eraseAnnotation(id);

    expect(store.state.annotations.has(id)).toBe(false);
    expect(JSON.stringify(store.outgoing())).not.toContain('private words');
    expect(store.state.erased.annotations.has(id)).toBe(true);
  });

  it('leaves the pin, and lets it be annotated again at a fresh id', async () => {
    const store = await reopen(freshName());
    const id = await annotated(store, 'first');
    await store.eraseAnnotation(id);

    expect(store.state.pins.has(id)).toBe(true);
    const fresh = store.state.annotationEntities.get(id);
    expect(fresh).toMatch(/^n-/);
    await store.mutate([annotationRevision(fresh ?? id, newId('r'), 'second', [])]);
    expect(store.state.annotations.get(id)?.content).toBe('second');
  });

  it('can be repeated: a second erase purges the fresh annotation and points at another', async () => {
    const store = await reopen(freshName());
    const id = await annotated(store, 'first');
    await store.eraseAnnotation(id);
    const firstFresh = store.state.annotationEntities.get(id) ?? '';
    await store.mutate([annotationRevision(firstFresh, newId('r'), 'second', [])]);
    await store.eraseAnnotation(id);

    const secondFresh = store.state.annotationEntities.get(id);
    expect(secondFresh).not.toBe(firstFresh);
    expect(store.state.erased.annotations.has(firstFresh)).toBe(true);
    expect(store.state.annotations.has(id)).toBe(false);
    expect(JSON.stringify(store.outgoing())).not.toContain('second');
  });

  it('survives a reopen: still erased, still annotatable', async () => {
    const name = freshName();
    const first = await reopen(name);
    const id = await annotated(first, 'private words');
    await first.eraseAnnotation(id);
    first.close();
    open = open.filter((store) => store !== first);

    const second = await reopen(name);
    expect(second.state.annotations.has(id)).toBe(false);
    expect(second.state.annotationEntities.get(id)).toMatch(/^n-/);
    expect(JSON.stringify(second.outgoing())).not.toContain('private words');
  });

  it('a peer that receives the erase loses the text too and follows the pointer', async () => {
    const source = await reopen(freshName());
    const peer = await reopen(freshName());
    const id = await annotated(source, 'private words');
    await peer.receive(source.outgoing());
    expect(peer.state.annotations.get(id)?.content).toBe('private words');

    await source.eraseAnnotation(id);
    await peer.receive(source.outgoing());

    expect(peer.state.annotations.has(id)).toBe(false);
    expect(peer.state.annotationEntities.get(id)).toBe(source.state.annotationEntities.get(id));
    expect(JSON.stringify(peer.outgoing())).not.toContain('private words');
  });

  it('refuses a pin this store does not hold', async () => {
    const store = await reopen(freshName());
    await expect(store.eraseAnnotation('k-aaaaaaaaaaaaaaaa')).rejects.toBeInstanceOf(PinRefusedError);
  });

  it('still refuses a bare purge of an annotation', async () => {
    const store = await reopen(freshName());
    const id = await annotated(store, 'kept');
    await expect(store.purge(ANNOTATION_ENTITY, id)).rejects.toBeInstanceOf(AnnotationRefusedError);
    expect(store.state.annotations.has(id)).toBe(true);
  });

  it('a fork written on the old id before the erase is gone with it', async () => {
    const store = await reopen(freshName());
    const id = await annotated(store, 'base');
    const head = store.state.annotations.get(id);
    await store.mutate([annotationRevision(id, newId('r'), 'edit', head === undefined ? [] : revisionParents(head))]);
    await store.eraseAnnotation(id);
    expect(JSON.stringify(store.outgoing())).not.toContain('edit');
    expect(JSON.stringify(store.outgoing())).not.toContain('base');
  });
});

describe('restore after an erase (#1194)', () => {
  const PIN = 'k-abcdefghijklmnop';
  const RESTORED = 'r-cccccccccccccccc';

  it('writes restored revisions where the pin’s annotation lives now', () => {
    const state = fold(
      logOf('a1b2c3d4e5f60718', [
        ...pinCreate(PIN, TARGET).map((m, i) => [m, T0 + i * 100] as const),
        [pinAnnotationPointer(PIN, N1), T0 + 2000],
      ]),
    );
    const fileState = fold(
      logOf('b000000000000002', [
        ...pinCreate(PIN, TARGET).map((m, i) => [m, T0 + i * 100] as const),
        [annotationRevision(PIN, RESTORED, 'from the file', []), T0 + 1000],
      ]),
    );
    const research = buildResearchExport(fileState);
    if (research === undefined) throw new Error('expected a research block');
    const preview = stageResearchRestore(research, state);
    expect(preview.mutations).toEqual([annotationRevision(N1, RESTORED, 'from the file', [])]);
  });

  it('writes nothing onto an annotation id erased on this device', () => {
    const state = fold(
      logOf('a1b2c3d4e5f60718', [
        ...pinCreate(PIN, TARGET).map((m, i) => [m, T0 + i * 100] as const),
        [{ entity: ANNOTATION_ENTITY, entityId: PIN, field: 'purged', value: true }, T0 + 2000],
      ]),
    );
    const fileState = fold(
      logOf('b000000000000002', [
        ...pinCreate(PIN, TARGET).map((m, i) => [m, T0 + i * 100] as const),
        [annotationRevision(PIN, RESTORED, 'from the file', []), T0 + 1000],
      ]),
    );
    const research = buildResearchExport(fileState);
    if (research === undefined) throw new Error('expected a research block');
    expect(stageResearchRestore(research, state).mutations).toEqual([]);
  });
});
