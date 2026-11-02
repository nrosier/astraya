/**
 * The "Other version" blocks of a note (#919): the competing texts of a concurrent edit, each shown whole.
 */
/**
 * @module ui/NoteForks
 * @purpose Renders every fork of a folded note as its own labelled, read-only block with its text and save time, so neither text of a concurrent edit is hidden or lost.
 * @conventions Renders nothing without forks; text keeps its line breaks; a fork is resolved by the next save of the note, which names every fork as a parent (see store/notes `revisionParents`); words from note-save.messages.ts.
 * @exports NoteForks
 */
import type { NoteVersion } from '../store/notes.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { formatSavedTime } from './saved-time.js';
import { noteSaveMessages } from './note-save.messages.js';

export function NoteForks({ forks }: { readonly forks: readonly NoteVersion[] }): React.JSX.Element | null {
  const t = useMessages(noteSaveMessages);
  const [locale] = useLocale();
  if (forks.length === 0) return null;
  return (
    <div className="note-forks">
      {forks.map((fork) => (
        <section key={fork.id} className="note-fork warning" aria-label={t.otherVersion}>
          <p className="note-fork-head">
            <strong>{t.otherVersion}</strong>{' '}
            <time className="hint" dateTime={new Date(fork.updatedAt).toISOString()}>
              {t.otherVersionSaved(formatSavedTime(new Date(fork.updatedAt).toISOString(), locale))}
            </time>
          </p>
          <p className="note-fork-text">{fork.content}</p>
        </section>
      ))}
      <p className="hint note-fork-hint">{t.otherVersionHint}</p>
    </div>
  );
}
