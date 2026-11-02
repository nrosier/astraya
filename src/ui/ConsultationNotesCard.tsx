/**
 * The consultation notes card (#800, round-2 mockup, persisted by #919): a low-profile bar by default showing the count
 * and the save state, with the notes on the page when it is opened. Each note autosaves through the op-log, so a
 * reload keeps it. A new note is a draft that becomes a note on its first save, then clears for the next one.
 */
/**
 * @module ui/ConsultationNotesCard
 * @purpose Consultation notes card (#800, #919): a collapsed bar with the note count and the combined autosave line, expanding to autosaving note editors, a new-note draft and delete confirmation.
 * @conventions Notes are op-log revisions read from `store.state` and written through `AutosavedNoteField`; the header line is the most pressing of all notes' states; delete is grow-only and asks first; copy from ConsultationView.messages.ts and note-save.messages.ts; the page Save state never reads these notes.
 * @exports ConsultationNotesCard
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { newId } from '../domain/id.js';
import { consultationNoteDelete, type Note } from '../store/notes.js';
import { AutosavedNoteField } from './AutosavedNoteField.js';
import { Button } from './primitives/Button.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { formatSavedTime } from './saved-time.js';
import { useOnline } from './online-status.js';
import { consultationDraftScope } from './use-note-autosave.js';
import { useStore, useStoreState } from './store-context.js';
import { consultationViewMessages } from './ConsultationView.messages.js';
import { isSettled, noteSaveLine, summariseNoteSaves, type NoteSaveSummary } from './note-save-line.js';
import { noteSaveMessages } from './note-save.messages.js';
import { NoteForks } from './NoteForks.js';
import { NoteSaveStatus } from './NoteSaveStatus.js';
import type { NoteSaveState } from './note-autosave.js';
import { consultationNoteMutation } from './note-mutations.js';
import type { Store } from '../store/store.js';

/** The journal and state scope of one consultation note: its root id. */
function scopeOf(rootId: string): string {
  return `consultation/${rootId}`;
}

/** The note as the store folds it now, so a save names its current head and forks. */
function headOf(store: Store, personId: string, rootId: string): Note | undefined {
  return store.state.consultationNotes.get(personId)?.find((note) => note.rootId === rootId);
}

function isDefined(state: NoteSaveState | undefined): state is NoteSaveState {
  return state !== undefined;
}

export function ConsultationNotesCard({ personId }: { readonly personId: string }): React.JSX.Element {
  const t = useMessages(consultationViewMessages);
  const [locale] = useLocale();
  const saveT = useMessages(noteSaveMessages);
  const store = useStore();
  const state = useStoreState();
  const online = useOnline();
  const notes = state.consultationNotes.get(personId) ?? [];
  const [open, setOpen] = useState(false);
  // The id of the note the new-note draft will create. It changes once that note exists, so the draft clears.
  const [draftId, setDraftId] = useState(() => newId('r'));
  const [saveStates, setSaveStates] = useState<Readonly<Record<string, NoteSaveState | undefined>>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>(undefined);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const bodyId = useId();
  const listRef = useRef<HTMLOListElement>(null);

  // Focus moves to Cancel when the confirmation opens, so Enter does not delete by accident.
  useEffect(() => {
    if (pendingDeleteId === undefined) return;
    listRef.current?.querySelector<HTMLButtonElement>('.consultation-note-confirm .quiet')?.focus();
  }, [pendingDeleteId]);

  const reportState = useCallback((scope: string, next: NoteSaveState | undefined): void => {
    setSaveStates((current) => ({ ...current, [scope]: next }));
  }, []);

  // Once the draft's note is in the store and nothing is waiting on it, the draft starts a new note.
  // The scope is stable per person so the draft's journal survives a reload and is cleared on purge; the field is keyed
  // by `draftId` so it still starts empty once its note exists.
  const draftScope = consultationDraftScope(personId);
  const draftState = saveStates[draftScope];
  const draftIsNote = notes.some((note) => note.rootId === draftId);
  useEffect(() => {
    if (draftIsNote && (draftState === undefined || isSettled(draftState))) setDraftId(newId('r'));
  }, [draftIsNote, draftState]);

  const summary: NoteSaveSummary = summariseNoteSaves(Object.values(saveStates).filter(isDefined), online);
  const line = noteSaveLine(summary, online);
  const count = notes.length;

  // Delete asks first (owner decision on #800): the confirmation names the note and the consequence, and only its
  // own button removes the note. Cancel and Escape keep it. The delete is grow-only, so a late edit cannot bring it back.
  const deleteNote = (rootId: string): void => {
    setPendingDeleteId(undefined);
    setDeleteFailed(false);
    void store.mutate([consultationNoteDelete(personId, rootId)]).catch(() => {
      setDeleteFailed(true);
    });
  };

  return (
    <section className="consultation-section consultation-notes" aria-labelledby="consultation-notes-heading">
      <div className="consultation-notes-head">
        <h2 id="consultation-notes-heading" className="consultation-notes-title">
          {t.notesTitle}
        </h2>
        <span className="primitive-badge count-pill">{t.notesCount(count)}</span>
        <NoteSaveStatus state={summary} />
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
      {line === 'savedLocal' && <p className="hint consultation-notes-sync">{t.notesSyncLater}</p>}

      <div id={bodyId} hidden={!open}>
        {open && (
          <div className="consultation-notes-body">
            {deleteFailed && <StatusMessage kind="error">{saveT.saveFailed}</StatusMessage>}
            <ol ref={listRef} className="consultation-notes-list">
              {notes.map((note) => (
                <li key={note.rootId} className="consultation-note">
                  <time className="hint consultation-date" dateTime={new Date(note.timestamp).toISOString()}>
                    {formatSavedTime(new Date(note.timestamp).toISOString(), locale)}
                  </time>
                  <AutosavedNoteField
                    key={scopeOf(note.rootId)}
                    label={t.notesFieldLabel}
                    hideLabel
                    storedText={note.content}
                    scope={scopeOf(note.rootId)}
                    toMutation={(text) =>
                      consultationNoteMutation(personId, note.rootId, headOf(store, personId, note.rootId), text)
                    }
                    onState={reportState}
                  />
                  <NoteForks forks={note.forks} />
                  <div className="consultation-note-actions">
                    <Button
                      size="compact"
                      variant="danger"
                      onClick={() => {
                        setPendingDeleteId(note.rootId);
                      }}
                    >
                      {t.notesDelete}
                    </Button>
                  </div>
                  {pendingDeleteId === note.rootId && (
                    <div className="consultation-note-confirm warning" role="region" aria-label={t.notesDeleteConfirm}>
                      <p>
                        <strong>{t.notesDeleteConfirm}</strong> {t.notesDeleteConsequence}
                      </p>
                      <div className="consultation-note-actions">
                        <Button
                          size="compact"
                          variant="danger"
                          onClick={() => {
                            deleteNote(note.rootId);
                          }}
                        >
                          {t.notesDeleteConfirmButton}
                        </Button>
                        <Button
                          variant="quiet"
                          size="compact"
                          onClick={() => {
                            setPendingDeleteId(undefined);
                          }}
                        >
                          {t.notesDeleteCancel}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <AutosavedNoteField
              key={draftId}
              label={t.notesFieldLabel}
              storedText=""
              scope={draftScope}
              toMutation={(text) => consultationNoteMutation(personId, draftId, headOf(store, personId, draftId), text)}
              onState={reportState}
              inline
            />
          </div>
        )}
      </div>
    </section>
  );
}
