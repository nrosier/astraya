/**
 * Two-device merge tests for notes (#919).
 *
 * Each device edits a note offline, then the two exchange records. The property is that the
 * folded state is identical whichever order the records arrive in, both texts survive as
 * head plus fork, and a delete beats a concurrent edit. These tests permute the arrival
 * order, since order-independence is the property that makes sync safe.
 */
import { describe, expect, it } from 'vitest';
import { fold, type State } from '../src/store/fold.js';
import { birthNoteRevision, consultationNoteDelete, consultationNoteRevision } from '../src/store/notes.js';
import { append, emptyLog, type Log, type Mutation } from '../src/store/oplog.js';
import { OP_VERSION, BODY_KEYS } from '../src/store/ops.js';
import type { OpRecord } from '../src/store/ops.js';
import { createClock } from '../src/store/hlc.js';

const A = 'a1b2c3d4e5f60718';
const B = 'b0000000000000ff';
const T0 = 1_780_963_200_000;
const PERSON = 'p-abcdefghijklmnop';

function device(nodeId: string, mutations: readonly Mutation[], millis: number): OpRecord[] {
  let log: Log = emptyLog(createClock(nodeId));
  mutations.forEach((mutation, index) => {
    log = append(log, mutation, millis + index).log;
  });
  return [...log.records];
}

/** Every permutation of a small list. Two or three records each, so this stays tiny. */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]),
  );
}

/** Everything a device can show about notes, in a comparable form. */
function noteView(state: State): unknown {
  return {
    birth: [...state.birthNotes.entries()].map(([id, note]) => [id, note]),
    consultation: [...state.consultationNotes.entries()].map(([id, notes]) => [id, notes]),
    people: [...state.people.entries()].map(([id, person]) => [id, person.notes]),
  };
}

describe('two offline devices editing one Birth Record note', () => {
  const base = device(A, [birthNoteRevision(PERSON, 'r-base', 'Shared start', [])], T0);
  const onA = device(A, [birthNoteRevision(PERSON, 'r-a', 'A wrote this', ['r-base'])], T0 + 100);
  const onB = device(B, [birthNoteRevision(PERSON, 'r-b', 'B wrote this', ['r-base'])], T0 + 200);
  const all = [...base, ...onA, ...onB];

  it('folds identically in every arrival order', () => {
    const reference = JSON.stringify(noteView(fold(all)));
    for (const order of permutations(all)) {
      expect(JSON.stringify(noteView(fold(order)))).toBe(reference);
    }
  });

  it('keeps both texts, the later one as head and the other as a fork', () => {
    const note = fold(all).birthNotes.get(PERSON);
    expect(note?.content).toBe('B wrote this');
    expect(note?.forks.map((fork) => fork.content)).toEqual(['A wrote this']);
  });
});

describe('two offline devices editing one Consultation note', () => {
  const NOTE = 'r-consult';
  const created = device(A, [consultationNoteRevision(PERSON, NOTE, NOTE, 'Created', [])], T0);
  const editA = device(A, [consultationNoteRevision(PERSON, NOTE, 'r-a', 'Edited on A', [NOTE])], T0 + 100);
  const editB = device(B, [consultationNoteRevision(PERSON, NOTE, 'r-b', 'Edited on B', [NOTE])], T0 + 200);
  const all = [...created, ...editA, ...editB];

  it('folds identically in every arrival order and keeps the fork', () => {
    const reference = JSON.stringify(noteView(fold(all)));
    for (const order of permutations(all)) {
      expect(JSON.stringify(noteView(fold(order)))).toBe(reference);
    }
    const [note] = fold(all).consultationNotes.get(PERSON) ?? [];
    expect(note?.content).toBe('Edited on B');
    expect(note?.forks.map((fork) => fork.content)).toEqual(['Edited on A']);
  });

  it('keeps the note hidden in every order when one device deletes it and the other edits it', () => {
    const deleteOnA = device(A, [consultationNoteDelete(PERSON, NOTE)], T0 + 300);
    const everything = [...created, ...editB, ...deleteOnA];
    for (const order of permutations(everything)) {
      expect(fold(order).consultationNotes.get(PERSON)).toBeUndefined();
    }
  });
});

describe('the wire contract for notes', () => {
  it('leaves the operation version and body keys unchanged', () => {
    expect(OP_VERSION).toBe(1);
    expect(BODY_KEYS).toEqual(['entity', 'entityId', 'field', 'value']);
  });
});
