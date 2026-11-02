/**
 * The note save-state line and the note revision builders (#919): the pure parts of the card wiring.
 */
import { describe, expect, it } from 'vitest';
import { NOTE_MAX_CHARACTERS, type Note } from '../src/store/notes.js';
import { birthNoteMutation, consultationNoteMutation } from '../src/ui/note-mutations.js';
import { isSettled, noteSaveLine, summariseNoteSaves } from '../src/ui/note-save-line.js';
import { noteSaveMessages } from '../src/ui/note-save.messages.js';

const note: Note = {
  id: 'r-head',
  noteId: 'r-root',
  rootId: 'r-root',
  personId: 'p-a',
  content: 'head',
  updatedAt: 2,
  timestamp: 1,
  forks: [{ id: 'r-fork', content: 'fork', updatedAt: 2 }],
  revisions: [],
};

describe('the note save-state line', () => {
  it('reads Saving while an edit is pending or in flight', () => {
    expect(noteSaveLine({ phase: 'pending' }, true)).toBe('saving');
    expect(noteSaveLine({ phase: 'saving' }, true)).toBe('saving');
  });

  it('reads Autosaved online and Saved on this device offline', () => {
    expect(noteSaveLine({ phase: 'saved' }, true)).toBe('autosaved');
    expect(noteSaveLine({ phase: 'saved' }, false)).toBe('savedLocal');
    expect(noteSaveLine({ phase: 'savedLocal' }, true)).toBe('savedLocal');
    expect(noteSaveLine({ phase: 'idle' }, true)).toBe('autosaved');
  });

  it('tells an over-limit refusal from a failed write', () => {
    expect(noteSaveLine({ phase: 'error', error: 'too-long' }, true)).toBe('tooLong');
    expect(noteSaveLine({ phase: 'error', error: 'failed' }, true)).toBe('failed');
  });

  it('settles only when nothing is waiting or failed', () => {
    expect(isSettled({ phase: 'idle' })).toBe(true);
    expect(isSettled({ phase: 'saved' })).toBe(true);
    expect(isSettled({ phase: 'savedLocal' })).toBe(true);
    expect(isSettled({ phase: 'pending' })).toBe(false);
    expect(isSettled({ phase: 'error', error: 'failed' })).toBe(false);
  });

  it('summarises several notes by the most pressing state', () => {
    const states = [{ phase: 'saved' as const }, { phase: 'saving' as const }, { phase: 'saved' as const }];
    expect(summariseNoteSaves(states, true).phase).toBe('saving');
    const withError = [...states, { phase: 'error' as const, error: 'too-long' as const }];
    expect(summariseNoteSaves(withError, true).error).toBe('too-long');
    expect(summariseNoteSaves([], true).phase).toBe('idle');
  });

  it('words the over-limit message from the store constant in both languages', () => {
    expect(noteSaveMessages.en.tooLong(NOTE_MAX_CHARACTERS)).toContain('50,000');
    expect(noteSaveMessages.nl.tooLong(NOTE_MAX_CHARACTERS)).toContain('50.000');
  });
});

describe('the note revisions a card saves', () => {
  it('names the head and every fork as parents, so a save resolves what it saw', () => {
    const mutation = birthNoteMutation('p-a', note, 'next');
    expect(mutation.entity).toBe('birthNote');
    expect(mutation.value).toMatchObject({ text: 'next', parents: ['r-head', 'r-fork'] });
  });

  it('starts a birth note with no parents', () => {
    expect(birthNoteMutation('p-a', undefined, 'first').value).toMatchObject({ parents: [] });
  });

  it('writes a new consultation note as its own root, and nothing for a blank one', () => {
    const first = consultationNoteMutation('p-a', 'r-new', undefined, 'hello');
    expect(first).toMatchObject({ entity: 'consultationNote', field: 'rev/r-new/r-new', value: { parents: [] } });
    expect(consultationNoteMutation('p-a', 'r-new', undefined, '   ')).toBeUndefined();
  });

  it('adds a revision under an existing consultation note root', () => {
    const next = consultationNoteMutation('p-a', 'r-root', note, 'edited');
    expect(next?.field.startsWith('rev/r-root/')).toBe(true);
    expect(next?.value).toMatchObject({ text: 'edited', parents: ['r-head', 'r-fork'] });
  });
});
