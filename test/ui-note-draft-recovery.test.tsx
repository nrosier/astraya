// @vitest-environment jsdom
/**
 * The hook's recovery path for a new-note draft (#919): text typed and lost to a closed tab is read back when the
 * store opens on a later visit, and a purge clears it. Real `use-note-autosave` and a real journal in jsdom storage;
 * the store is a minimal stub, since the hook only reads `dbName` and calls `mutate`.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '../src/store/store.js';
import {
  clearNoteJournalsForPerson,
  consultationDraftScope,
  noteJournalKey,
  personNoteScopes,
  useNoteAutosave,
  type NoteAutosave,
} from '../src/ui/use-note-autosave.js';

const DB = 'astraya-draft-test';
const PERSON = 'p-draft-1';

interface Harness {
  readonly result: { current: NoteAutosave | undefined };
  rerender(store: Store | undefined): void;
  unmount(): void;
}

/** Mounts the hook with a store that may or may not be open yet, and records the hook's latest return value. */
function mount(store: Store | undefined, scope: string): Harness {
  const result: { current: NoteAutosave | undefined } = { current: undefined };
  function Probe({ open }: { readonly open: Store | undefined }): null {
    result.current = useNoteAutosave({
      store: open,
      scope,
      // A real revision: an undefined mutation would count as a finished save and clear the journal at once.
      toMutation: (text) => ({ entity: 'consultationNote', entityId: PERSON, field: 'content', value: text }),
      headText: '',
    });
    return null;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(<Probe open={store} />);
  });
  return {
    result,
    rerender(next) {
      act(() => {
        root.render(<Probe open={next} />);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

/** A store whose save never settles, as when the tab closes before the write lands and the journal must survive. */
function fakeStore(): Store {
  return { dbName: DB, mutate: vi.fn(() => new Promise<never>(() => undefined)) } as unknown as Store;
}

describe('new-note draft journal across a reload (#919)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('a draft typed then reloaded is recovered once the store opens', () => {
    const scope = consultationDraftScope(PERSON);
    // First visit: the store is open and the user types; the journal is written at once, before any save.
    const first = mount(fakeStore(), scope);
    act(() => {
      first.result.current?.edit('typed before the tab closed');
    });
    first.unmount();
    expect(localStorage.getItem(noteJournalKey(DB, scope))).toBe('typed before the tab closed');

    // Reload: a new mount with the store still opening; the journal is read once the store is known.
    const reloaded = mount(undefined, scope);
    expect(reloaded.result.current?.recovered).toBeUndefined();
    reloaded.rerender(fakeStore());
    expect(reloaded.result.current?.recovered).toBe('typed before the tab closed');
    reloaded.unmount();
  });

  it('a draft typed then reloaded is recovered when the store is already open at mount', () => {
    const scope = consultationDraftScope(PERSON);
    localStorage.setItem(noteJournalKey(DB, scope), 'left behind');
    const reloaded = mount(fakeStore(), scope);
    expect(reloaded.result.current?.recovered).toBe('left behind');
    reloaded.unmount();
  });

  it('a purge clears the draft journal', () => {
    const scope = consultationDraftScope(PERSON);
    localStorage.setItem(noteJournalKey(DB, scope), 'secret draft');
    clearNoteJournalsForPerson(localStorage, DB, PERSON, []);
    expect(localStorage.getItem(noteJournalKey(DB, scope))).toBeNull();
    expect(personNoteScopes(PERSON, [])).toContain(scope);
  });
});
