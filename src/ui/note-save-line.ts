/**
 * What the note save-state line says (#919), as a pure mapping from the autosave state.
 *
 * A card with several notes shows one line, so `summariseNoteSaves` folds the notes' states into the
 * one that matters most: a refused or failed save first, then work in progress, then saved.
 */
/**
 * @module note-save-line
 * @purpose Pure mapping from note autosave states to the save-state line, and the summary of several notes' states for one card header.
 * @conventions An over-limit refusal outranks a failed write, which outranks saving; pending counts as saving; a settled note reads "Autosaved" online and "Saved on this device" offline (the browser's own online state, as the card showed before); no React and no copy (the component picks the words).
 * @exports NoteSaveLine, NoteSaveSummary, isSettled, noteSaveLine, summariseNoteSaves
 */
import type { NoteSaveState } from './note-autosave.js';

export type NoteSaveLine = 'saving' | 'autosaved' | 'savedLocal' | 'tooLong' | 'failed';

/** The part of a note's autosave state the line depends on. */
export type NoteSaveSummary = Pick<NoteSaveState, 'phase' | 'error'>;

/** Nothing is waiting to be saved and nothing failed. */
export function isSettled(state: NoteSaveSummary): boolean {
  return state.phase === 'idle' || state.phase === 'saved' || state.phase === 'savedLocal';
}

/** The line a state shows, given whether the browser reports itself online. */
export function noteSaveLine(state: NoteSaveSummary, online: boolean): NoteSaveLine {
  switch (state.phase) {
    case 'pending':
    case 'saving':
      return 'saving';
    case 'error':
      return state.error === 'too-long' ? 'tooLong' : 'failed';
    case 'idle':
    case 'saved':
      return online ? 'autosaved' : 'savedLocal';
    case 'savedLocal':
      return 'savedLocal';
  }
}

const RANK: Readonly<Record<NoteSaveLine, number>> = {
  autosaved: 1,
  savedLocal: 2,
  saving: 3,
  failed: 4,
  tooLong: 5,
};

/** The most pressing state among several notes. With none, an idle one. */
export function summariseNoteSaves(states: Iterable<NoteSaveSummary>, online: boolean): NoteSaveSummary {
  let best: NoteSaveSummary = { phase: 'idle' };
  for (const state of states) {
    if (RANK[noteSaveLine(state, online)] > RANK[noteSaveLine(best, online)]) best = state;
  }
  return best;
}
