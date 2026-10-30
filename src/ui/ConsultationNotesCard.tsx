/**
 * The consultation notes card (#800, round-2 mockup): a low-profile bar by default showing the count and the save state,
 * with the notes on the page when it is opened. Persistence is NOT built here: the notes live in component state for
 * this visit only. Server sync and the op-log are #919 and need an architect spec first, so a reload clears them.
 * The save states are shown as the mockup has them (Autosaved, Saving, saved on this device) and follow the browser's
 * own online state; nothing is sent anywhere.
 */
/**
 * @module ui/ConsultationNotesCard
 * @purpose Consultation notes card (#800): a collapsed bar with the note count and save state, expanding to a local-only note list and editor; no persistence (#919).
 * @conventions Local component state only, so a reload clears the notes. Copy from ConsultationView.messages.ts. Uses the shared Button primitive for every action and the shared `useOnline` for the offline line. Notes are plain text; the mockup's bold and list toolbar is not built.
 * @exports ConsultationNotesCard
 */
import { useId, useState } from 'react';
import { Button } from './primitives/Button.js';
import { TextAreaField } from './primitives/TextAreaField.js';
import { useOnline } from './online-status.js';
import { useMessages } from './messages.js';
import { consultationViewMessages } from './ConsultationView.messages.js';

interface Note {
  readonly id: number;
  readonly text: string;
  readonly savedAt: string;
}

type SaveState = 'autosaved' | 'saving';

/** The save line: working, saved and synced, or saved on this device while offline. */
function saveLineOf(state: SaveState, online: boolean): 'saving' | 'autosaved' | 'offline' {
  if (state === 'saving') return 'saving';
  return online ? 'autosaved' : 'offline';
}

export function ConsultationNotesCard(): React.JSX.Element {
  const t = useMessages(consultationViewMessages);
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<readonly Note[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [editText, setEditText] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('autosaved');
  const [nextId, setNextId] = useState(1);
  const bodyId = useId();

  // Every change is a local edit. It shows "Saving" for the moment it takes to record, then the saved line.
  const commit = (update: () => void): void => {
    setSaveState('saving');
    update();
    setSaveState('autosaved');
  };

  const addNote = (): void => {
    const text = draft.trim();
    if (text === '') return;
    commit(() => {
      setNotes((current) => [...current, { id: nextId, text, savedAt: new Date().toISOString() }]);
      setNextId((id) => id + 1);
      setDraft('');
    });
  };

  const saveEdit = (id: number): void => {
    const text = editText.trim();
    commit(() => {
      setNotes((current) =>
        text === ''
          ? current.filter((note) => note.id !== id)
          : current.map((note) => (note.id === id ? { ...note, text } : note)),
      );
      setEditingId(undefined);
    });
  };

  const deleteNote = (id: number): void => {
    commit(() => {
      setNotes((current) => current.filter((n) => n.id !== id));
    });
  };

  const line = saveLineOf(saveState, online);
  const lineText = line === 'saving' ? t.notesSaving : line === 'offline' ? t.notesSavedLocal : t.notesAutosaved;

  return (
    <section className="consultation-section consultation-notes" aria-labelledby="consultation-notes-heading">
      <div className="consultation-notes-head">
        <h2 id="consultation-notes-heading" className="consultation-notes-title">
          {t.notesTitle}
        </h2>
        <span className="primitive-badge count-pill">{t.notesCount(notes.length)}</span>
        <p className="status" data-state={line === 'autosaved' ? 'ready' : line} role="status">
          {lineText}
        </p>
        <Button
          size="compact"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            setOpen((current) => !current);
          }}
        >
          {open ? t.notesHide : t.notesShow}
        </Button>
      </div>
      {line === 'offline' && <p className="hint consultation-notes-sync">{t.notesSyncLater}</p>}

      <div id={bodyId} hidden={!open}>
        {open && (
          <div className="consultation-notes-body">
            <ol className="consultation-notes-list">
              {notes.map((note) => (
                <li key={note.id} className="consultation-note">
                  <time className="hint consultation-date" dateTime={note.savedAt}>
                    {note.savedAt.slice(0, 16).replace('T', ' ')}
                  </time>
                  {editingId === note.id ? (
                    <>
                      <TextAreaField
                        label={t.notesFieldLabel}
                        hideLabel
                        value={editText}
                        onChange={setEditText}
                        rows={3}
                      />
                      <div className="consultation-note-actions">
                        <Button
                          size="compact"
                          variant="primary"
                          onClick={() => {
                            saveEdit(note.id);
                          }}
                        >
                          {t.notesSave}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="consultation-note-text">{note.text}</p>
                      <div className="consultation-note-actions">
                        <Button
                          size="compact"
                          onClick={() => {
                            setEditingId(note.id);
                            setEditText(note.text);
                          }}
                        >
                          {t.notesEdit}
                        </Button>
                        <Button
                          size="compact"
                          variant="danger"
                          onClick={() => {
                            deleteNote(note.id);
                          }}
                        >
                          {t.notesDelete}
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ol>
            <TextAreaField label={t.notesFieldLabel} value={draft} onChange={setDraft} rows={3} />
            <div className="consultation-notes-add">
              <Button
                size="compact"
                onClick={() => {
                  addNote();
                }}
              >
                {t.notesAdd}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
