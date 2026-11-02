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
 * @conventions Journal key is `astraya:note-journal:<store.dbName>:<scope>`, never a caller's name; the per-note state resets when the note (database and scope) changes; the journal is cleared only when the committed text is still the latest; no store means nothing is saved yet and the save runs once it opens; one save in flight at a time; timers and listeners are removed on unmount.
 * @exports noteJournalKey, noteOwnerKey, shouldResetNote, readNoteJournal, writeNoteJournal, clearNoteJournal, NoteJournalStorage, UseNoteAutosaveOptions, NoteAutosave, useNoteAutosave
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Which note a set of per-note refs belongs to: its database and scope together. */
export function noteOwnerKey(dbName: string, scope: string): string {
  return `${dbName}\u0000${scope}`;
}

/**
 * Whether moving from `previous` to `next` owner is a different note, so the per-note state must be dropped.
 * Going from no owner (the store has not opened) to the first owner is not a change of note: text typed while
 * the store opened is kept and saved once it opens.
 */
export function shouldResetNote(previous: string | undefined, next: string | undefined): boolean {
  if (previous === next) return false;
  return previous !== undefined;
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

/** The journal scopes of one person's notes: the Birth Record note and each Consultation note (by its root id). */
export function personNoteScopes(personId: string, consultationRootIds: readonly string[]): readonly string[] {
  return [`birth/${personId}`, ...consultationRootIds.map((rootId) => `consultation/${rootId}`)];
}

/** Erase a purged person's pending note text (#919, spec section 7 item 8). */
export function clearNoteJournalsForPerson(
  storage: NoteJournalStorage,
  dbName: string,
  personId: string,
  consultationRootIds: readonly string[],
): void {
  for (const scope of personNoteScopes(personId, consultationRootIds)) clearNoteJournal(storage, dbName, scope);
}

/** The slice of `Storage` needed to find keys by prefix. */
export type NoteJournalIndexStorage = NoteJournalStorage & Pick<Storage, 'length' | 'key'>;

/**
 * Erase every pending note of one database, as when an account's local data is removed. The key prefix ends in
 * the separator, so `astraya-user-1` never matches `astraya-user-12`.
 */
export function clearNoteJournalsForDb(storage: NoteJournalIndexStorage, dbName: string): void {
  try {
    const prefix = noteJournalKey(dbName, '');
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix) === true) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Storage that throws holds nothing we can clear.
  }
}

/** Recovered text equal to what the note already says needs no new revision. */
export function isRedundantRecovery(recovered: string, headText: string | undefined): boolean {
  return recovered === headText;
}

export interface UseNoteAutosaveOptions {
  /** The text the note currently has in the store, if any. Recovered journal text equal to it is dropped, not rewritten. */
  readonly headText?: string | undefined;
  /** The open store; undefined while it opens, when edits wait in the journal. Its `dbName` keys the journal. */
  readonly store: Store | undefined;
  /** Identifies the note within the database, e.g. `birth/<personId>` or `consultation/<noteId>`. Callers key the field by it. */
  readonly scope: string;
  /**
   * Builds the revision mutation for a text, at save time, so it names the current parents. Undefined when
   * there is nothing to write (a blank draft that is not yet a note); the save then counts as done.
   */
  readonly toMutation: (text: string) => Mutation | undefined;
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
  // The journal is keyed by the database the store actually opened, never by a caller's name, so one
  // account's pending text cannot be recovered into another account's store.
  const dbName = store?.dbName;

  // The machine state is mirrored in a ref so event handlers always read the latest phase.
  const stateRef = useRef<NoteSaveState>(initialNoteSaveState);
  const [state, setState] = useState<NoteSaveState>(initialNoteSaveState);

  const textRef = useRef<string | undefined>(undefined);
  // True while text is held that the store has not yet confirmed.
  const dirtyRef = useRef(false);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The note the per-note state above belongs to: its database and scope. `undefined` until the store opens.
  const ownerRef = useRef<string | undefined>(undefined);
  const owner = dbName === undefined ? undefined : noteOwnerKey(dbName, scope);
  const [recovered, setRecovered] = useState<string | undefined>(undefined);

  // Reset when the note changes (a different scope or database), so text from one note is never saved into
  // another. Opening the store is not a change of note, so text typed while it opened is kept.
  // Refs are written in an effect so a render that is discarded never leaves them half-changed.
  useEffect(() => {
    if (!shouldResetNote(ownerRef.current, owner)) {
      ownerRef.current = owner;
      return;
    }
    ownerRef.current = owner;
    textRef.current = undefined;
    dirtyRef.current = false;
    inFlightRef.current = false;
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    stateRef.current = initialNoteSaveState;
    setState(initialNoteSaveState);
    // Recovered text is read for this note only, once its database is known.
    const storage = storageOrUndefined();
    setRecovered(
      owner === undefined || dbName === undefined || storage === undefined
        ? undefined
        : readNoteJournal(storage, dbName, scope),
    );
  }, [owner, dbName, scope]);

  const latest = useRef({ store, dbName, scope, toMutation: options.toMutation, headText: options.headText });
  latest.current = { store, dbName, scope, toMutation: options.toMutation, headText: options.headText };
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
      const mutation = toMutation(text);
      if (mutation !== undefined) await target.mutate([mutation]);
      if (textRef.current === text) {
        dirtyRef.current = false;
        const storage = storageOrUndefined();
        if (storage !== undefined && name !== undefined) clearNoteJournal(storage, name, key);
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
      const name = latest.current.dbName;
      if (storage !== undefined && name !== undefined) writeNoteJournal(storage, name, latest.current.scope, text);
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
    if (textRef.current === undefined && recovered !== undefined) {
      // Text the note already holds is not a new revision: drop the journal entry and write nothing.
      const { dbName: name, scope: key, headText } = latest.current;
      if (isRedundantRecovery(recovered, headText)) {
        const storage = storageOrUndefined();
        if (storage !== undefined && name !== undefined) clearNoteJournal(storage, name, key);
        setRecovered(undefined);
      } else {
        edit(recovered);
      }
    }
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
