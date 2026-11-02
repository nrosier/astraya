/**
 * The note save-state line (#919): Saving..., Autosaved, Saved on this device, and the refusal messages.
 */
/**
 * @module ui/NoteSaveStatus
 * @purpose Renders the note save-state line from an autosave summary: a polite live region that is always present so a change is announced, with failures as alerts.
 * @conventions Words come from note-save.messages.ts (the limit is the store's constant); the mapping lives in note-save-line.ts; `hideIdle` keeps an untouched field quiet while leaving the live region mounted; offline follows the shared `useOnline`.
 * @exports NoteSaveStatus
 */
import { NOTE_MAX_CHARACTERS } from '../store/notes.js';
import { useMessages } from './messages.js';
import { noteSaveLine, type NoteSaveSummary } from './note-save-line.js';
import { noteSaveMessages } from './note-save.messages.js';
import { useOnline } from './online-status.js';
import { StatusMessage } from './primitives/StatusMessage.js';

export function NoteSaveStatus({
  state,
  hideIdle = false,
}: {
  readonly state: NoteSaveSummary;
  /** Show nothing until the first edit. */
  readonly hideIdle?: boolean;
}): React.JSX.Element {
  const t = useMessages(noteSaveMessages);
  const online = useOnline();
  const line = noteSaveLine(state, online);
  if (line === 'tooLong') return <StatusMessage kind="error">{t.tooLong(NOTE_MAX_CHARACTERS)}</StatusMessage>;
  if (line === 'failed') return <StatusMessage kind="error">{t.saveFailed}</StatusMessage>;

  const text = line === 'saving' ? t.saving : line === 'autosaved' ? t.autosaved : t.savedLocal;
  const dataState = line === 'autosaved' ? 'ready' : line === 'savedLocal' ? 'offline' : 'saving';
  const quiet = hideIdle && state.phase === 'idle';
  return (
    <div role="status" className="note-save-status">
      {!quiet && (
        <p className="status" data-state={dataState}>
          {text}
        </p>
      )}
    </div>
  );
}
