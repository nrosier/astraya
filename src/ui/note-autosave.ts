/**
 * The note autosave state machine (#919): what the note's save-state line says, and when a save may start.
 *
 * Pure: no React, no DOM, no timers. The hook (`use-note-autosave.ts`) owns the 750 ms timer and the
 * journal, feeds events in, and starts a save whenever a transition lands in `saving`. Every edit bumps
 * `revision`; a save reports the revision it carried, so a result that arrives after a newer edit never
 * claims the newer text is saved.
 *
 * Notes edits do not touch the page Save dirty state or the status dot (owner decision, 2026-11-02).
 */
/**
 * @module note-autosave
 * @purpose Pure state machine for the note save-state line: idle, pending, saving, saved, savedLocal, error.
 * @conventions Reducer style `(state, event) => state`; revision numbers guard against stale save results; an over-limit refusal is an error that only a new edit clears, a failed write is retried by flush or reconnect; the journal keeps the text in both cases.
 * @exports NOTE_AUTOSAVE_DEBOUNCE_MS, NoteSavePhase, NoteSaveError, NoteSaveState, NoteSaveEvent, initialNoteSaveState, noteAutosaveReducer, startsSave
 */

/** How long the text must rest before it is saved (owner decision, within the 500-1000 ms spec). */
export const NOTE_AUTOSAVE_DEBOUNCE_MS = 750;

export type NoteSavePhase = 'idle' | 'pending' | 'saving' | 'saved' | 'savedLocal' | 'error';

/** Why the state is `error`: the text is over the limit, or the write failed. */
export type NoteSaveError = 'too-long' | 'failed';

export interface NoteSaveState {
  readonly phase: NoteSavePhase;
  /** Counts edits. A save result for an older revision is stale. */
  readonly revision: number;
  /** Set only while `phase` is `error`. */
  readonly error?: NoteSaveError;
}

export type NoteSaveEvent =
  | { readonly type: 'edit' }
  | { readonly type: 'debounce-elapsed' }
  | { readonly type: 'save-success'; readonly revision: number; readonly online: boolean }
  | { readonly type: 'save-refused'; readonly revision: number }
  | { readonly type: 'save-failure'; readonly revision: number }
  | { readonly type: 'flush' }
  | { readonly type: 'reconnect' };

export const initialNoteSaveState: NoteSaveState = { phase: 'idle', revision: 0 };

function at(revision: number, phase: Exclude<NoteSavePhase, 'error'>): NoteSaveState {
  return { phase, revision };
}

function failed(revision: number, error: NoteSaveError): NoteSaveState {
  return { phase: 'error', revision, error };
}

/** The next state. Events that make no sense in the current phase return the state unchanged. */
export function noteAutosaveReducer(state: NoteSaveState, event: NoteSaveEvent): NoteSaveState {
  switch (event.type) {
    case 'edit':
      // Also while saving: the running save carries an older revision, so its result cannot clear this edit.
      return at(state.revision + 1, 'pending');

    case 'debounce-elapsed':
      return state.phase === 'pending' ? at(state.revision, 'saving') : state;

    case 'flush':
      if (state.phase === 'pending') return at(state.revision, 'saving');
      // A failed write is retried on flush. An over-limit one is refused again until the text changes.
      if (state.phase === 'error' && state.error === 'failed') return at(state.revision, 'saving');
      return state;

    case 'save-success':
      if (event.revision < state.revision) return at(state.revision, 'pending');
      if (state.phase !== 'saving') return state;
      return at(state.revision, event.online ? 'saved' : 'savedLocal');

    case 'save-refused':
      if (event.revision < state.revision) return at(state.revision, 'pending');
      return state.phase === 'saving' ? failed(state.revision, 'too-long') : state;

    case 'save-failure':
      if (event.revision < state.revision) return at(state.revision, 'pending');
      return state.phase === 'saving' ? failed(state.revision, 'failed') : state;

    case 'reconnect':
      // Back online: a device-only save is now due to sync, and a failed write is tried again.
      if (state.phase === 'savedLocal') return at(state.revision, 'saved');
      if (state.phase === 'error' && state.error === 'failed') return at(state.revision, 'saving');
      return state;
  }
}

/**
 * Whether moving from `before` to `after` means the hook must start a save now.
 *
 * A stale result returns to `pending` rather than `saving`, so the hook re-arms the debounce and
 * the newer text is saved after it rests again.
 */
export function startsSave(before: NoteSaveState, after: NoteSaveState): boolean {
  return after.phase === 'saving' && before.phase !== 'saving';
}
