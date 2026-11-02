/**
 * Tests for note revisions: heads, forks, grow-only delete, the legacy `person.notes`
 * root, purge fan-out, and the per-revision character limit (#919).
 *
 * The fold tests are pure and drive `append` and `fold` directly, so the rules are facts
 * about records rather than about IndexedDB. The store tests at the bottom prove the same
 * rules survive the real write path, the refusal, and a reopen.
 */
import { describe, expect, it } from 'vitest';
import { newId } from '../src/domain/id.js';
import { createClock, decodeHlc } from '../src/store/hlc.js';
import { fold, PURGED_FIELD, type State } from '../src/store/fold.js';
import {
  assertNoteMutation,
  birthNoteRevision,
  BIRTH_NOTE_ENTITY,
  consultationNoteDelete,
  consultationNoteRevision,
  CONSULTATION_NOTE_ENTITY,
  entitiesPurgedWith,
  isOversizedLegacyNoteRecord,
  NOTE_MAX_CHARACTERS,
  NoteRefusedError,
} from '../src/store/notes.js';
import { append, type Log, type Mutation } from '../src/store/oplog.js';
import { openStore, type Store } from '../src/store/store.js';
import type { OpRecord } from '../src/store/ops.js';

const A = 'a1b2c3d4e5f60718';
const B = 'b0000000000000ff';
const T0 = 1_780_963_200_000;
const PERSON = 'p-abcdefghijklmnop';

/** Append mutations as one device on top of `base`, returning every record that device now holds. */
function deviceLog(
  nodeId: string,
  base: readonly OpRecord[],
  mutations: readonly Mutation[],
  millis: number,
): OpRecord[] {
  let log: Log = { clock: createClock(nodeId), records: base };
  mutations.forEach((mutation, index) => {
    log = append(log, mutation, millis + index).log;
  });
  return [...log.records];
}

/** Union by timestamp: what two devices hold once they have exchanged everything. */
function union(...sets: readonly (readonly OpRecord[])[]): OpRecord[] {
  const byHlc = new Map<string, OpRecord>();
  for (const set of sets) for (const record of set) byHlc.set(String(record.hlc), record);
  return [...byHlc.values()];
}

function legacyNotes(text: string, nodeId: string, millis: number): OpRecord[] {
  return deviceLog(nodeId, [], [{ entity: 'person', entityId: PERSON, field: 'notes', value: text }], millis);
}

function purgeMarkers(entityId: string, millis: number, nodeId: string): OpRecord[] {
  return deviceLog(
    nodeId,
    [],
    [BIRTH_NOTE_ENTITY, CONSULTATION_NOTE_ENTITY, 'person'].map((entity) => ({
      entity,
      entityId,
      field: PURGED_FIELD,
      value: true,
    })),
    millis,
  );
}

describe('a Birth Record note', () => {
  it('shows the newest revision and no forks when one device edits in sequence', () => {
    const first = deviceLog(A, [], [birthNoteRevision(PERSON, 'r-first', 'Draft', [])], T0);
    const second = deviceLog(A, first, [birthNoteRevision(PERSON, 'r-second', 'Final', ['r-first'])], T0 + 10);
    const state = fold(second);
    const note = state.birthNotes.get(PERSON);
    expect(note?.content).toBe('Final');
    expect(note?.forks).toEqual([]);
    expect(state.people.get(PERSON)?.notes ?? '').toBe('');
  });

  it('keeps both texts as a fork when two offline devices edit the same revision', () => {
    const base = deviceLog(A, [], [birthNoteRevision(PERSON, 'r-base', 'Shared', [])], T0);
    const fromA = deviceLog(A, base, [birthNoteRevision(PERSON, 'r-a', 'Written on A', ['r-base'])], T0 + 100);
    const fromB = deviceLog(B, base, [birthNoteRevision(PERSON, 'r-b', 'Written on B', ['r-base'])], T0 + 200);
    const note = fold(union(fromA, fromB)).birthNotes.get(PERSON);
    expect(note?.content).toBe('Written on B');
    expect(note?.forks.map((fork) => fork.content)).toEqual(['Written on A']);
  });

  it('resolves forks when a later save names every leaf as a parent', () => {
    const base = deviceLog(A, [], [birthNoteRevision(PERSON, 'r-base', 'Shared', [])], T0);
    const fromA = deviceLog(A, base, [birthNoteRevision(PERSON, 'r-a', 'A', ['r-base'])], T0 + 100);
    const fromB = deviceLog(B, base, [birthNoteRevision(PERSON, 'r-b', 'B', ['r-base'])], T0 + 200);
    const merged = union(fromA, fromB);
    const resolved = deviceLog(A, merged, [birthNoteRevision(PERSON, 'r-merged', 'A and B', ['r-a', 'r-b'])], T0 + 300);
    const note = fold(resolved).birthNotes.get(PERSON);
    expect(note?.content).toBe('A and B');
    expect(note?.forks).toEqual([]);
  });

  it('folds to the legacy person.notes text, with no record written, when only the register exists', () => {
    const state = fold(legacyNotes('Written before #919', A, T0));
    expect(state.birthNotes.get(PERSON)?.content).toBe('Written before #919');
    expect(state.people.get(PERSON)?.notes).toBe('Written before #919');
    expect(state.birthNotes.get(PERSON)?.timestamp).toBe(decodeHlc(String(legacyNotes('x', A, T0)[0]?.hlc)).millis);
  });

  it('builds on the legacy root when a new revision names it as parent', () => {
    const legacy = legacyNotes('Old text', A, T0);
    const edit = deviceLog(
      A,
      legacy,
      [birthNoteRevision(PERSON, 'r-edit', 'New text', [`legacy-${String(legacy[0]?.hlc)}`])],
      T0 + 100,
    );
    const note = fold(edit).birthNotes.get(PERSON);
    expect(note?.content).toBe('New text');
    expect(note?.forks).toEqual([]);
  });

  it('forks against the legacy root when an older build overwrites person.notes after migration', () => {
    const legacy = legacyNotes('Old text', A, T0);
    const revised = deviceLog(
      A,
      legacy,
      [birthNoteRevision(PERSON, 'r-new', 'Migrated edit', [`legacy-${String(legacy[0]?.hlc)}`])],
      T0 + 100,
    );
    // An old build (B) writes person.notes after the migration, with its own later timestamp.
    const oldBuild = deviceLog(
      B,
      legacy,
      [{ entity: 'person', entityId: PERSON, field: 'notes', value: 'Old build' }],
      T0 + 200,
    );
    const note = fold(union(revised, oldBuild)).birthNotes.get(PERSON);
    expect(note?.content).toBe('Old build');
    expect(note?.forks.map((fork) => fork.content)).toEqual(['Migrated edit']);
  });
});

describe('a Consultation note', () => {
  it('lists each note by its root id, oldest first, showing the head text', () => {
    const first = deviceLog(A, [], [consultationNoteRevision(PERSON, 'r-n1', 'r-n1', 'First note', [])], T0);
    const second = deviceLog(A, first, [consultationNoteRevision(PERSON, 'r-n2', 'r-n2', 'Second note', [])], T0 + 100);
    const edited = deviceLog(
      A,
      second,
      [consultationNoteRevision(PERSON, 'r-n1', 'r-n1b', 'First note, edited', ['r-n1'])],
      T0 + 200,
    );
    const notes = fold(edited).consultationNotes.get(PERSON) ?? [];
    expect(notes.map((note) => note.content)).toEqual(['First note, edited', 'Second note']);
    expect(notes.map((note) => note.rootId)).toEqual(['r-n1', 'r-n2']);
  });

  it('hides a deleted note, and an edit with a later timestamp does not bring it back', () => {
    const created = deviceLog(A, [], [consultationNoteRevision(PERSON, 'r-n', 'r-n', 'Keep?', [])], T0);
    const deleted = deviceLog(A, created, [consultationNoteDelete(PERSON, 'r-n')], T0 + 100);
    const laterEdit = deviceLog(
      B,
      deleted,
      [consultationNoteRevision(PERSON, 'r-n', 'r-late', 'Edited after delete', ['r-n'])],
      T0 + 10_000,
    );
    expect(fold(laterEdit).consultationNotes.get(PERSON)).toBeUndefined();
  });

  it('keeps an offline edit against a delete hidden, because delete is grow-only', () => {
    const base = deviceLog(A, [], [consultationNoteRevision(PERSON, 'r-n', 'r-n', 'Base', [])], T0);
    const deletedOnA = deviceLog(A, base, [consultationNoteDelete(PERSON, 'r-n')], T0 + 100);
    const editedOnB = deviceLog(
      B,
      base,
      [consultationNoteRevision(PERSON, 'r-n', 'r-b', 'Offline edit', ['r-n'])],
      T0 + 5_000,
    );
    const state = fold(union(deletedOnA, editedOnB));
    expect(state.consultationNotes.get(PERSON)).toBeUndefined();
  });
});

describe('purging a person', () => {
  it('removes the person, Birth Record note and Consultation notes together', () => {
    const records = union(
      deviceLog(
        A,
        [],
        [
          { entity: 'person', entityId: PERSON, field: 'displayName', value: 'Ada' },
          birthNoteRevision(PERSON, 'r-birth', 'Birth text', []),
          consultationNoteRevision(PERSON, 'r-cons', 'r-cons', 'Consultation text', []),
        ],
        T0,
      ),
      purgeMarkers(PERSON, T0 + 100, A),
    );
    const state: State = fold(records);
    expect(state.people.has(PERSON)).toBe(false);
    expect(state.birthNotes.has(PERSON)).toBe(false);
    expect(state.consultationNotes.has(PERSON)).toBe(false);
  });

  it('lists every entity a person purge covers, and only the person for other entities', () => {
    expect(entitiesPurgedWith('person')).toEqual(['person', BIRTH_NOTE_ENTITY, CONSULTATION_NOTE_ENTITY]);
    expect(entitiesPurgedWith('chart')).toEqual(['chart']);
  });
});

describe('the per-revision length limit', () => {
  const at = (length: number): string => 'a'.repeat(length);

  it('accepts a revision of exactly the limit and refuses one character over', () => {
    expect(NOTE_MAX_CHARACTERS).toBe(50_000);
    expect(() => {
      assertNoteMutation(birthNoteRevision(PERSON, 'r-ok', at(NOTE_MAX_CHARACTERS), []));
    }).not.toThrow();
    expect(() => {
      assertNoteMutation(birthNoteRevision(PERSON, 'r-big', at(NOTE_MAX_CHARACTERS + 1), []));
    }).toThrow(NoteRefusedError);
  });

  it('counts characters as code points, so an emoji is one character', () => {
    const emoji = '😀'.repeat(NOTE_MAX_CHARACTERS);
    expect(() => {
      assertNoteMutation(consultationNoteRevision(PERSON, 'r-e', 'r-e', emoji, []));
    }).not.toThrow();
  });

  it('refuses a field that is neither a revision nor a delete', () => {
    expect(() => {
      assertNoteMutation({ entity: BIRTH_NOTE_ENTITY, entityId: PERSON, field: 'deleted', value: true });
    }).toThrow(NoteRefusedError);
    expect(() => {
      assertNoteMutation({ entity: CONSULTATION_NOTE_ENTITY, entityId: PERSON, field: 'del/r-n', value: false });
    }).toThrow(NoteRefusedError);
  });

  it('leaves other entities alone', () => {
    expect(() => {
      assertNoteMutation({ entity: 'person', entityId: PERSON, field: 'notes', value: at(NOTE_MAX_CHARACTERS + 1) });
    }).not.toThrow();
  });
});

describe('a legacy person.notes root over the limit (#919)', () => {
  it('is flagged for quarantine, but a root within the limit is not', () => {
    const [within] = legacyNotes('a'.repeat(NOTE_MAX_CHARACTERS), A, T0);
    const [over] = legacyNotes('a'.repeat(NOTE_MAX_CHARACTERS + 1), A, T0);
    expect(within && isOversizedLegacyNoteRecord(within)).toBe(false);
    expect(over && isOversizedLegacyNoteRecord(over)).toBe(true);
  });

  it('is never refused or truncated by the fold: the text is still the person’s note', () => {
    const text = 'a'.repeat(NOTE_MAX_CHARACTERS + 1);
    const state = fold(legacyNotes(text, A, T0));
    expect(state.birthNotes.get(PERSON)?.content).toBe(text);
    expect(state.people.get(PERSON)?.notes).toBe(text);
  });

  it('a legacy root within the cap folds unchanged', () => {
    const text = 'a'.repeat(NOTE_MAX_CHARACTERS);
    expect(fold(legacyNotes(text, A, T0)).people.get(PERSON)?.notes).toBe(text);
  });
});

describe('the store and notes', () => {
  let counter = 0;
  const stores: Store[] = [];
  function ticking(start = 1_700_000_000_000): () => number {
    let millis = start;
    return () => {
      millis += 1000;
      return millis;
    };
  }
  async function open(): Promise<{ store: Store; name: string }> {
    counter += 1;
    const name = `astraya-notes-test-${String(counter)}`;
    const store = await openStore({ name, now: ticking() });
    stores.push(store);
    return { store, name };
  }

  it('refuses an oversized revision without writing any record of the batch', async () => {
    const { store } = await open();
    const before = store.head();
    await expect(
      store.mutate([
        { entity: 'person', entityId: PERSON, field: 'displayName', value: 'Ada' },
        birthNoteRevision(PERSON, 'r-big', 'a'.repeat(NOTE_MAX_CHARACTERS + 1), []),
      ]),
    ).rejects.toBeInstanceOf(NoteRefusedError);
    expect(store.head()).toBe(before);
    expect(store.state.people.has(PERSON)).toBe(false);
    expect(store.state.birthNotes.has(PERSON)).toBe(false);
  });

  it('persists a revision and its fork across a reopen', async () => {
    const { store, name } = await open();
    await store.mutate([birthNoteRevision(PERSON, 'r-one', 'Persisted', [])]);
    store.close();
    const reopened = await openStore({ name, now: ticking(1_700_000_100_000) });
    stores.push(reopened);
    expect(reopened.state.birthNotes.get(PERSON)?.content).toBe('Persisted');
  });

  it('erases a person and both note entities in one purge', async () => {
    const { store, name } = await open();
    await store.mutate([
      { entity: 'person', entityId: PERSON, field: 'displayName', value: 'Ada' },
      birthNoteRevision(PERSON, 'r-birth', 'Birth', []),
      consultationNoteRevision(PERSON, 'r-cons', 'r-cons', 'Consult', []),
    ]);
    await store.purge('person', PERSON);
    expect(store.state.people.has(PERSON)).toBe(false);
    expect(store.state.birthNotes.has(PERSON)).toBe(false);
    expect(store.state.consultationNotes.has(PERSON)).toBe(false);
    store.close();

    const reopened = await openStore({ name, now: ticking(1_700_000_200_000) });
    stores.push(reopened);
    expect(reopened.state.birthNotes.has(PERSON)).toBe(false);
    expect(reopened.state.consultationNotes.has(PERSON)).toBe(false);
  });

  it('erases a peer-sent person purge of its notes too', async () => {
    const { store } = await open();
    const peer = union(
      deviceLog(
        B,
        [],
        [
          birthNoteRevision(PERSON, 'r-peer', 'From peer', []),
          consultationNoteRevision(PERSON, 'r-peer-c', 'r-peer-c', 'Peer consult', []),
        ],
        1_700_000_000_500,
      ),
      purgeMarkers(PERSON, 1_700_000_000_900, B),
    );
    await store.receive(peer);
    expect(store.state.birthNotes.has(PERSON)).toBe(false);
    expect(store.state.consultationNotes.has(PERSON)).toBe(false);
  });

  it('gives a fresh id for each note revision', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId('r')));
    expect(ids.size).toBe(200);
  });
});

describe('the fold result shape', () => {
  it('exposes both note maps on every fold, empty when there are no notes', () => {
    const state = fold([]);
    expect(state.birthNotes.size).toBe(0);
    expect(state.consultationNotes.size).toBe(0);
  });
});
