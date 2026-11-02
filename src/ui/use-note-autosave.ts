/**
 * Autosave for one note (#919): a thin React shell over `note-autosave.ts`.
 *
 * Every edit is written to a localStorage journal at once, then saved through the store after 750 ms
 * of rest. The IndexedDB op-log is the source of truth; the journal only guards text that has not
 * committed yet, and is cleared once the text it holds has been committed. A refused or failed save
 * keeps the journal. Saves never overlap: a save requested while one is in flight waits for it, so two
 * revisions never name the same parents by accident.
 */
/**
 * @module use-note-autosave
 * @purpose Hook that debounces note edits, journals them in localStorage keyed by database name, and writes them through the store's `mutate`; flushes on pagehide, unmount (navigation) and reconnect.
 * @conventions Journal key is `astraya:note-journal:<database name>:<scope>`; the journal is cleared only when the committed text is still the latest; no store means nothing is saved yet and the save runs once it opens; one save in flight at a time; timers and listeners are removed on unmount.
 * @exports noteJournalKey, readNoteJournal, writeNoteJournal, clearNoteJournal, NoteJournalStorage, UseNoteAutosaveOptions, NoteAutosave, useNoteAutosave
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { DB_NAME } from '../store/db.js';
import { NoteRefusedError } from '../store/notes.js';
import type { Mutation } from '../store/oplog.js';
import type { Store } from '../store/store.js';
import {
  initialNoteSaveState,
  NOTE_AUTOSAVE_DEBOUNCE_MS,
  noteAutosaveReducer,
  startsSave,
  type NoteSaveEvent,
  type NoteSaveState,
} from './note-autosave.js';

/** The slice of `Storage` the journal needs, so tests can pass a plain object. */
export type NoteJournalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The journal key: database name first, so two databases never share pending text. */
export function noteJournalKey(dbName: string, scope: string): string {
  return `astraya:note-journal:${dbName}:${scope}`;
}

/** Pending text for one note, or undefined. Storage that throws (private mode, quota) reads as empty. */
export function readNoteJournal(storage: NoteJournalStorage, dbName: string, scope: string): string | undefined {
  try {
    return storage.getItem(noteJournalKey(dbName, scope)) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Keep `text` on this device until it is committed. A failing write only loses the crash guard. */
export function writeNoteJournal(storage: NoteJournalStorage, dbName: string, scope: string, text: string): void {
  try {
    storage.setItem(noteJournalKey(dbName, scope), text);
  } catch {
    // The store save still runs; only the journal guard is lost.
  }
}

export function clearNoteJournal(storage: NoteJournalStorage, dbName: string, scope: string): void {
  try {
    storage.removeItem(noteJournalKey(dbName, scope));
  } catch {
    // Nothing to clear.
  }
}

export interface UseNoteAutosaveOptions {
  /** The open store; undefined while it opens, when edits wait in the journal. */
  readonly store: Store | undefined;
  /** The database name the journal is keyed by. Defaults to the app's database. */
  readonly dbName?: string;
  /** Identifies the note within the database, e.g. `birth/<personId>` or `consultation/<noteId>`. */
  readonly scope: string;
  /** Builds the revision mutation for a text, at save time, so it names the current parents. */
  readonly toMutation: (text: string) => Mutation;
}

export interface NoteAutosave {
  readonly state: NoteSaveState;
  /** Report the editor's new text. Journals it at once and debounces the save. */
  edit(text: string): void;
  /** Save now, without waiting for the debounce. */
  flush(): void;
  /** Text left in the journal by an earlier visit, read once at mount. The hook saves it; the UI may show it. */
  readonly recovered: string | undefined;
}

function storageOrUndefined(): NoteJournalStorage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage;
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function useNoteAutosave(options: UseNoteAutosaveOptions): NoteAutosave {
  const { store, scope } = options;
  const dbName = options.dbName ?? DB_NAME;

  const [recovered] = useState<string | undefined>(() => {
    const storage = storageOrUndefined();
    return storage === undefined ? undefined : readNoteJournal(storage, dbName, scope);
  });

  // The machine state is mirrored in a ref so event handlers always read the latest phase.
  const stateRef = useRef<NoteSaveState>(initialNoteSaveState);
  const [state, setState] = useState<NoteSaveState>(initialNoteSaveState);

  const textRef = useRef<string | undefined>(undefined);
  // True while text is held that the store has not yet confirmed.
  const dirtyRef = useRef(false);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ store, dbName, scope, toMutation: options.toMutation });
  latest.current = { store, dbName, scope, toMutation: options.toMutation };
  // Filled in below; timers and the save callback reach `dispatch` through it, so they never hold a stale one.
  const dispatchRef = useRef<(event: NoteSaveEvent) => void>(() => undefined);

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const armDebounce = useCallback((): void => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      dispatchRef.current({ type: 'debounce-elapsed' });
    }, NOTE_AUTOSAVE_DEBOUNCE_MS);
  }, [clearTimer]);

  const save = useCallback(async (revision: number): Promise<void> => {
    const { store: target, dbName: name, scope: key, toMutation } = latest.current;
    const text = textRef.current;
    if (target === undefined || text === undefined) return; // The store-open effect retries.
    inFlightRef.current = true;
    try {
      await target.mutate([toMutation(text)]);
      if (textRef.current === text) {
        dirtyRef.current = false;
        const storage = storageOrUndefined();
        if (storage !== undefined) clearNoteJournal(storage, name, key);
      }
      dispatchRef.current({ type: 'save-success', revision, online: isOnline() });
    } catch (error) {
      dispatchRef.current(
        error instanceof NoteRefusedError && error.refusal === 'too-long'
          ? { type: 'save-refused', revision }
          : { type: 'save-failure', revision },
      );
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const dispatch = useCallback(
    (event: NoteSaveEvent): void => {
      const before = stateRef.current;
      const after = noteAutosaveReducer(before, event);
      stateRef.current = after;
      if (after !== before) setState(after);
      if (after.phase === 'pending' && event.type !== 'edit' && event.type !== 'flush') armDebounce();
      if (!startsSave(before, after)) return;
      clearTimer();
      // While a save is in flight the new revision waits: the in-flight result returns to `pending`
      // and re-arms the debounce, so saves never overlap.
      if (inFlightRef.current) return;
      void save(after.revision);
    },
    [armDebounce, clearTimer, save],
  );
  dispatchRef.current = dispatch;

  const edit = useCallback(
    (text: string): void => {
      textRef.current = text;
      dirtyRef.current = true;
      const storage = storageOrUndefined();
      if (storage !== undefined) writeNoteJournal(storage, latest.current.dbName, latest.current.scope, text);
      dispatch({ type: 'edit' });
      armDebounce();
    },
    [armDebounce, dispatch],
  );

  const flush = useCallback((): void => {
    dispatch({ type: 'flush' });
  }, [dispatch]);

  // Once the store opens, save what was left waiting, including a recovered journal entry.
  // Edits made before the store opened sit in `saving` (their save returned early), so they are sent directly.
  useEffect(() => {
    if (store === undefined) return;
    if (textRef.current === undefined && recovered !== undefined) edit(recovered);
    if (!dirtyRef.current || inFlightRef.current) return;
    if (stateRef.current.phase === 'saving') {
      void save(stateRef.current.revision);
    } else {
      dispatch({ type: 'flush' });
    }
  }, [store, recovered, edit, dispatch, save]);

  useEffect(() => {
    const onPageHide = (): void => {
      dispatchRef.current({ type: 'flush' });
    };
    const onOnline = (): void => {
      dispatchRef.current({ type: 'reconnect' });
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('online', onOnline);
      // Navigating away: save what is waiting rather than lose the debounce.
      dispatchRef.current({ type: 'flush' });
      clearTimer();
    };
  }, [clearTimer]);

  return { state, edit, flush, recovered };
}
