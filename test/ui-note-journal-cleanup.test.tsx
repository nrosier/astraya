// @vitest-environment jsdom
/**
 * Pending note text is plaintext in localStorage until it commits (#919, spec section 7 item 8), so it must go
 * when the person is purged or the account's local data is removed, and a recovered entry that the note already
 * holds must not be written again. Two competing versions of a note render as separate blocks, each in full.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { NoteForks } from '../src/ui/NoteForks.js';
import {
  clearNoteJournalsForDb,
  clearNoteJournalsForPerson,
  isRedundantRecovery,
  noteJournalKey,
  personNoteScopes,
  readNoteJournal,
  writeNoteJournal,
} from '../src/ui/use-note-autosave.js';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

describe('journal cleared on purge', () => {
  it('names the Birth Record and every Consultation note of the person', () => {
    expect(personNoteScopes('p-1', ['r-a', 'r-b'])).toEqual(['birth/p-1', 'consultation/r-a', 'consultation/r-b']);
  });

  it('removes the purged person`s pending text and leaves other people alone', () => {
    const storage = memoryStorage();
    writeNoteJournal(storage, 'db', 'birth/p-1', 'secret birth note');
    writeNoteJournal(storage, 'db', 'consultation/r-a', 'secret consultation note');
    writeNoteJournal(storage, 'db', 'birth/p-2', 'someone else');
    clearNoteJournalsForPerson(storage, 'db', 'p-1', ['r-a']);
    expect(readNoteJournal(storage, 'db', 'birth/p-1')).toBeUndefined();
    expect(readNoteJournal(storage, 'db', 'consultation/r-a')).toBeUndefined();
    expect(readNoteJournal(storage, 'db', 'birth/p-2')).toBe('someone else');
  });
});

describe('journal cleared on account-data removal', () => {
  // removeAccountData deletes the database `astraya-user-<id>`; journal keys are
  // `astraya:note-journal:<database name>:<scope>`, so the database name is a complete prefix of each key.
  it('removes every entry of that database, and none of another whose name starts the same way', () => {
    const storage = memoryStorage();
    writeNoteJournal(storage, 'astraya-user-1', 'birth/p-1', 'one');
    writeNoteJournal(storage, 'astraya-user-1', 'consultation/r-a', 'two');
    writeNoteJournal(storage, 'astraya-user-12', 'birth/p-1', 'other account');
    writeNoteJournal(storage, 'astraya', 'birth/p-1', 'anonymous');
    storage.setItem('unrelated', 'kept');
    clearNoteJournalsForDb(storage, 'astraya-user-1');
    expect(readNoteJournal(storage, 'astraya-user-1', 'birth/p-1')).toBeUndefined();
    expect(readNoteJournal(storage, 'astraya-user-1', 'consultation/r-a')).toBeUndefined();
    expect(readNoteJournal(storage, 'astraya-user-12', 'birth/p-1')).toBe('other account');
    expect(readNoteJournal(storage, 'astraya', 'birth/p-1')).toBe('anonymous');
    expect(storage.getItem('unrelated')).toBe('kept');
    expect(noteJournalKey('astraya-user-1', '').endsWith(':')).toBe(true);
  });
});

describe('redundant recovery', () => {
  it('is redundant only when the recovered text equals the note`s current head', () => {
    expect(isRedundantRecovery('same text', 'same text')).toBe(true);
    expect(isRedundantRecovery('edited offline', 'older head')).toBe(false);
    expect(isRedundantRecovery('anything', undefined)).toBe(false);
  });
});

describe('Other version blocks', () => {
  it('renders each fork as its own labelled block with its full text', () => {
    const root = createRoot(document.createElement('div'));
    const host = document.createElement('div');
    document.body.append(host);
    const mounted = createRoot(host);
    act(() => {
      mounted.render(
        <NoteForks
          forks={[
            { id: 'r-1', content: 'First competing version.\nSecond line.', updatedAt: Date.UTC(2026, 10, 2, 9, 0) },
            { id: 'r-2', content: 'Another device wrote this.', updatedAt: Date.UTC(2026, 10, 2, 9, 5) },
          ]}
        />,
      );
    });
    const blocks = [...host.querySelectorAll('section.note-fork')];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.textContent).toContain('Other version');
    expect(blocks[0]?.querySelector('.note-fork-text')?.textContent).toBe('First competing version.\nSecond line.');
    expect(blocks[1]?.querySelector('.note-fork-text')?.textContent).toBe('Another device wrote this.');
    act(() => {
      mounted.unmount();
    });
    root.unmount();
    host.remove();
  });

  it('renders nothing without forks', () => {
    const host = document.createElement('div');
    const mounted = createRoot(host);
    act(() => {
      mounted.render(<NoteForks forks={[]} />);
    });
    expect(host.querySelector('.note-fork')).toBeNull();
    act(() => {
      mounted.unmount();
    });
  });
});
