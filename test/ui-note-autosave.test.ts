/**
 * State-machine and journal tests for the note autosave (#919).
 *
 * The reducer is pure, so the transitions, the 750 ms debounce constant and the over-limit refusal
 * path are exercised directly. The journal helpers take a plain storage object, so the key is checked
 * without a DOM. The hook itself is a thin shell over these and is covered by the e2e spec.
 */
import { describe, expect, it } from 'vitest';
import {
  initialNoteSaveState,
  NOTE_AUTOSAVE_DEBOUNCE_MS,
  noteAutosaveReducer,
  startsSave,
  type NoteSaveEvent,
  type NoteSaveState,
} from '../src/ui/note-autosave.js';
import {
  clearNoteJournal,
  noteJournalKey,
  readNoteJournal,
  writeNoteJournal,
  type NoteJournalStorage,
} from '../src/ui/use-note-autosave.js';

function run(events: readonly NoteSaveEvent[], from: NoteSaveState = initialNoteSaveState): NoteSaveState {
  return events.reduce(noteAutosaveReducer, from);
}

const edit: NoteSaveEvent = { type: 'edit' };
const elapsed: NoteSaveEvent = { type: 'debounce-elapsed' };

describe('note autosave: debounce constant', () => {
  it('rests for 750 ms, inside the 500-1000 ms spec', () => {
    expect(NOTE_AUTOSAVE_DEBOUNCE_MS).toBe(750);
  });
});

describe('note autosave: transitions', () => {
  it('starts idle with no error', () => {
    expect(initialNoteSaveState).toEqual({ phase: 'idle', revision: 0 });
  });

  it('an edit makes the text pending and bumps the revision', () => {
    expect(run([edit])).toEqual({ phase: 'pending', revision: 1 });
    expect(run([edit, edit])).toEqual({ phase: 'pending', revision: 2 });
  });

  it('debounce-elapsed starts a save only from pending', () => {
    expect(run([edit, elapsed]).phase).toBe('saving');
    expect(run([elapsed]).phase).toBe('idle');
    expect(run([{ type: 'save-success', revision: 0, online: true }, elapsed]).phase).toBe('idle');
  });

  it('a successful save reads "saved" online and "savedLocal" offline', () => {
    expect(run([edit, elapsed, { type: 'save-success', revision: 1, online: true }]).phase).toBe('saved');
    expect(run([edit, elapsed, { type: 'save-success', revision: 1, online: false }]).phase).toBe('savedLocal');
  });

  it('reconnect turns savedLocal into saved, and leaves saved alone', () => {
    const local = run([edit, elapsed, { type: 'save-success', revision: 1, online: false }]);
    expect(noteAutosaveReducer(local, { type: 'reconnect' }).phase).toBe('saved');
    const saved = run([edit, elapsed, { type: 'save-success', revision: 1, online: true }]);
    expect(noteAutosaveReducer(saved, { type: 'reconnect' })).toBe(saved);
  });

  it('flush saves pending text immediately, and does nothing in other phases', () => {
    expect(run([edit, { type: 'flush' }]).phase).toBe('saving');
    expect(run([{ type: 'flush' }])).toBe(initialNoteSaveState);
    const saved = run([edit, elapsed, { type: 'save-success', revision: 1, online: true }]);
    expect(noteAutosaveReducer(saved, { type: 'flush' })).toBe(saved);
  });

  it('an edit made while saving returns to pending, so the older save cannot clear it', () => {
    const saving = run([edit, elapsed]);
    const again = noteAutosaveReducer(saving, edit);
    expect(again).toEqual({ phase: 'pending', revision: 2 });
    // The in-flight save of revision 1 finishes now: it must not show "saved" for the newer text.
    const result = noteAutosaveReducer(again, { type: 'save-success', revision: 1, online: true });
    expect(result).toEqual({ phase: 'pending', revision: 2 });
  });

  it('a stale failure or refusal also returns to pending, not error', () => {
    const again = run([edit, elapsed, edit]);
    expect(noteAutosaveReducer(again, { type: 'save-failure', revision: 1 }).phase).toBe('pending');
    expect(noteAutosaveReducer(again, { type: 'save-refused', revision: 1 }).phase).toBe('pending');
  });

  it('a failed write is an error, and flush or reconnect retries it', () => {
    const failedState = run([edit, elapsed, { type: 'save-failure', revision: 1 }]);
    expect(failedState).toEqual({ phase: 'error', revision: 1, error: 'failed' });
    expect(noteAutosaveReducer(failedState, { type: 'flush' }).phase).toBe('saving');
    expect(noteAutosaveReducer(failedState, { type: 'reconnect' }).phase).toBe('saving');
    // A retry that succeeds clears the error.
    const retried = run([{ type: 'flush' }, { type: 'save-success', revision: 1, online: true }], failedState);
    expect(retried).toEqual({ phase: 'saved', revision: 1 });
  });

  it('a result for the current revision that is not saving does nothing', () => {
    expect(run([{ type: 'save-success', revision: 0, online: true }])).toBe(initialNoteSaveState);
    expect(run([{ type: 'save-failure', revision: 0 }])).toBe(initialNoteSaveState);
  });
});

describe('note autosave: over-limit refusal', () => {
  it('a refused save shows the too-long error and keeps the revision', () => {
    const refused = run([edit, elapsed, { type: 'save-refused', revision: 1 }]);
    expect(refused).toEqual({ phase: 'error', revision: 1, error: 'too-long' });
  });

  it('flush does not retry an over-limit save: the text must change first', () => {
    const refused = run([edit, elapsed, { type: 'save-refused', revision: 1 }]);
    expect(noteAutosaveReducer(refused, { type: 'flush' })).toBe(refused);
    expect(noteAutosaveReducer(refused, { type: 'reconnect' })).toBe(refused);
  });

  it('a new edit clears the too-long error and goes back to pending', () => {
    const refused = run([edit, elapsed, { type: 'save-refused', revision: 1 }]);
    expect(noteAutosaveReducer(refused, edit)).toEqual({ phase: 'pending', revision: 2 });
  });
});

describe('note autosave: start rule', () => {
  it('startsSave is true only when the state enters saving', () => {
    const pending = run([edit]);
    const saving = noteAutosaveReducer(pending, { type: 'flush' });
    expect(startsSave(pending, saving)).toBe(true);
    expect(startsSave(saving, saving)).toBe(false);
    expect(startsSave(pending, pending)).toBe(false);
  });
});

/** An in-memory `Storage` stand-in, so the journal is tested without a DOM. */
function memoryStorage(): NoteJournalStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe('note autosave: journal keying', () => {
  it('keys the journal by database name and note scope', () => {
    expect(noteJournalKey('astraya', 'birth/p1')).toBe('astraya:note-journal:astraya:birth/p1');
  });

  it('two databases never share a journal entry for the same scope', () => {
    const storage = memoryStorage();
    writeNoteJournal(storage, 'astraya', 'birth/p1', 'alpha');
    writeNoteJournal(storage, 'astraya-test', 'birth/p1', 'beta');
    expect(readNoteJournal(storage, 'astraya', 'birth/p1')).toBe('alpha');
    expect(readNoteJournal(storage, 'astraya-test', 'birth/p1')).toBe('beta');
  });

  it('write, read and clear round-trip one note', () => {
    const storage = memoryStorage();
    expect(readNoteJournal(storage, 'astraya', 'consultation/n1')).toBeUndefined();
    writeNoteJournal(storage, 'astraya', 'consultation/n1', 'draft');
    expect(readNoteJournal(storage, 'astraya', 'consultation/n1')).toBe('draft');
    clearNoteJournal(storage, 'astraya', 'consultation/n1');
    expect(readNoteJournal(storage, 'astraya', 'consultation/n1')).toBeUndefined();
  });

  it('a storage that throws reads as empty and never propagates', () => {
    const broken: NoteJournalStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(readNoteJournal(broken, 'astraya', 'birth/p1')).toBeUndefined();
    expect(() => {
      writeNoteJournal(broken, 'astraya', 'birth/p1', 'x');
    }).not.toThrow();
    expect(() => {
      clearNoteJournal(broken, 'astraya', 'birth/p1');
    }).not.toThrow();
  });
});
