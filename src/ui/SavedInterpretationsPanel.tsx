/**
 * The Past interpretations tab of the AI interpretation screen (#761): the user's stored AI interpretations, newest
 * first, each with its date and time, description and type. Selecting one opens its sections in a viewer modal.
 * Delete is offered in the list and inside the modal, behind an in-app confirmation step (never a browser dialog):
 * deleting is permanent.
 *
 * Thin wiring only. The type label is built by `savedTypeLabel` (`result-basis-label.ts`) and the time by
 * `formatSavedTime` (`saved-time.ts`), both plain and tested. The modal is the shared `StagedDialog`, used as is.
 */
/**
 * @module ui/SavedInterpretationsPanel
 * @purpose The "Past interpretations" tab: lists the user's stored AI interpretations (#761) and opens, or deletes, one behind an in-app confirmation.
 * @conventions Loads the list on mount via tier2-client; the type label and time come from result-basis-label and saved-time; the viewer is primitives/StagedDialog used unchanged; the sections markup is this file's own, not shared with the AI-customized panel's inline list.
 * @exports SavedInterpretationsPanel
 */
import { useEffect, useRef, useState } from 'react';
import {
  deleteSavedInterpretation,
  getSavedInterpretation,
  listSavedInterpretations,
  type SavedInterpretationDetail,
  type SavedInterpretationSummary,
  type Tier2Section,
} from '../interpretation/tier2-client.js';
import { StagedDialog } from './primitives/StagedDialog.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { savedTypeLabel } from './result-basis-label.js';
import { formatSavedTime } from './saved-time.js';
import { savedInterpretationsPanelMessages } from './SavedInterpretationsPanel.messages.js';

type LoadState = 'loading' | 'error' | 'ready';

/** Which delete confirmation is open: the one in the list, or the one inside the viewer modal. */
interface PendingDelete {
  readonly id: string;
  readonly from: 'list' | 'modal';
}

/** The sections of one stored interpretation, the same article markup the AI-customized panel shows. */
function SavedSections({ sections }: { readonly sections: readonly Tier2Section[] }): React.JSX.Element {
  return (
    <div className="tier2-result">
      {sections.map((section) => (
        <article key={section.heading}>
          <h4>{section.heading}</h4>
          <p>{section.body}</p>
        </article>
      ))}
    </div>
  );
}

/** The in-app confirmation: a labelled region that takes focus on open, with Confirm delete and Cancel. */
function DeleteConfirmation({
  busy,
  cancelRef,
  onConfirm,
  onCancel,
}: {
  readonly busy: boolean;
  readonly cancelRef: React.RefObject<HTMLButtonElement | null>;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): React.JSX.Element {
  const t = useMessages(savedInterpretationsPanelMessages);
  return (
    <div className="saved-interpretation-delete-confirm warning" role="region" aria-label={t.pastDeleteConfirm}>
      <p>{t.pastDeleteConfirmMessage}</p>
      <button type="button" disabled={busy} onClick={onConfirm}>
        {t.pastDeleteConfirm}
      </button>{' '}
      <button ref={cancelRef} type="button" className="quiet" disabled={busy} onClick={onCancel}>
        {t.pastDeleteCancel}
      </button>
    </div>
  );
}

export function SavedInterpretationsPanel(): React.JSX.Element {
  const t = useMessages(savedInterpretationsPanelMessages);
  const [locale] = useLocale();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [items, setItems] = useState<readonly SavedInterpretationSummary[]>([]);
  const [openId, setOpenId] = useState<string | undefined>(undefined);
  const [detail, setDetail] = useState<SavedInterpretationDetail | undefined>(undefined);
  const [detailError, setDetailError] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | undefined>(undefined);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSavedInterpretations()
      .then((results) => {
        if (cancelled) return;
        setItems(results);
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Focus moves to Cancel whenever a confirmation opens, so the reader lands on the safe choice.
  useEffect(() => {
    if (pendingDelete !== undefined) cancelRef.current?.focus();
  }, [pendingDelete]);

  const openItem = openId === undefined ? undefined : items.find((item) => item.id === openId);

  function openSaved(id: string, opener: HTMLButtonElement): void {
    openerRef.current = opener;
    setOpenId(id);
    setDetail(undefined);
    setDetailError(false);
    setDeleteError(false);
    setPendingDelete(undefined);
    getSavedInterpretation(id)
      .then((loaded) => {
        setDetail(loaded);
      })
      .catch(() => {
        setDetailError(true);
      });
  }

  function closeModal(): void {
    setOpenId(undefined);
    setDetail(undefined);
    setDetailError(false);
    setPendingDelete(undefined);
  }

  function confirmDelete(pending: PendingDelete): void {
    setDeleting(true);
    setDeleteError(false);
    deleteSavedInterpretation(pending.id)
      .then(() => {
        setItems((current) => current.filter((item) => item.id !== pending.id));
        setPendingDelete(undefined);
        if (openId === pending.id) closeModal();
      })
      .catch(() => {
        // The item stays. The confirmation closes, so the reader is back in the prior state with the failure shown.
        setPendingDelete(undefined);
        setDeleteError(true);
      })
      .finally(() => {
        setDeleting(false);
      });
  }

  const deleteFailed = deleteError ? <StatusMessage kind="error">{t.pastDeleteFailed}</StatusMessage> : null;

  const modalBody = (
    <>
      {openItem !== undefined && <p className="hint">{formatSavedTime(openItem.createdAt, locale)}</p>}
      {openId !== undefined && deleteFailed}
      {pendingDelete?.from === 'modal' && openId !== undefined && (
        <DeleteConfirmation
          busy={deleting}
          cancelRef={cancelRef}
          onConfirm={() => {
            confirmDelete({ id: openId, from: 'modal' });
          }}
          onCancel={() => {
            setPendingDelete(undefined);
          }}
        />
      )}
      {detailError && <StatusMessage kind="error">{t.pastError}</StatusMessage>}
      {detail === undefined && !detailError && <StatusMessage kind="loading">{t.pastLoading}</StatusMessage>}
      {detail !== undefined &&
        (detail.sections.length === 0 ? (
          <p className="hint">{t.pastNoSections}</p>
        ) : (
          <SavedSections sections={detail.sections} />
        ))}
    </>
  );

  return (
    <section className="report-section saved-interpretations-panel">
      {loadState === 'loading' && <StatusMessage kind="loading">{t.pastLoading}</StatusMessage>}
      {loadState === 'error' && <StatusMessage kind="error">{t.pastError}</StatusMessage>}
      {loadState === 'ready' && items.length === 0 && <StatusMessage kind="empty">{t.pastEmpty}</StatusMessage>}
      {loadState === 'ready' && items.length > 0 && (
        <ul className="saved-interpretations-list">
          {items.map((item) => {
            const type = savedTypeLabel(item, locale) ?? t.pastTypeNeutral;
            return (
              <li key={item.id} className="saved-interpretation-row">
                <button
                  type="button"
                  className="quiet"
                  onClick={(event) => {
                    openSaved(item.id, event.currentTarget);
                  }}
                >
                  <span className="saved-interpretation-time">{formatSavedTime(item.createdAt, locale)}</span>{' '}
                  {item.description !== null && item.description !== '' && (
                    <span className="saved-interpretation-description">{item.description}</span>
                  )}{' '}
                  <span className="saved-interpretation-type">{type}</span>
                </button>{' '}
                <button
                  type="button"
                  className="quiet"
                  disabled={deleting}
                  onClick={() => {
                    setDeleteError(false);
                    setPendingDelete({ id: item.id, from: 'list' });
                  }}
                >
                  {t.pastDelete}
                </button>
                {pendingDelete?.from === 'list' && pendingDelete.id === item.id && (
                  <DeleteConfirmation
                    busy={deleting}
                    cancelRef={cancelRef}
                    onConfirm={() => {
                      confirmDelete({ id: item.id, from: 'list' });
                    }}
                    onCancel={() => {
                      setPendingDelete(undefined);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {openId === undefined && deleteFailed}
      <StagedDialog
        open={openId !== undefined}
        heading={openItem === undefined ? t.pastTypeNeutral : (savedTypeLabel(openItem, locale) ?? t.pastTypeNeutral)}
        closeLabel={t.pastClose}
        onDiscard={closeModal}
        returnFocusTo={openerRef}
        footer={
          <>
            <button
              type="button"
              disabled={deleting || openId === undefined}
              onClick={() => {
                if (openId !== undefined) setPendingDelete({ id: openId, from: 'modal' });
              }}
            >
              {t.pastDelete}
            </button>{' '}
            <button type="button" className="quiet" onClick={closeModal}>
              {t.pastClose}
            </button>
          </>
        }
      >
        {modalBody}
      </StagedDialog>
    </section>
  );
}
