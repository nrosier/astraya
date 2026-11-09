/**
 * The admin's view of corrections that users submitted (#1338), shown inside the Corpus candidates screen. A pending
 * row can be approved (its text goes live for everyone at once, D2) or rejected, each after a confirmation; a decided
 * row stays listed with its status (D4).
 */
/**
 * @module CorpusSubmissionsSection
 * @purpose Lists user-submitted interpretation corrections (status, entry, language, text, submitter, date) for admins, and approves or rejects the pending ones.
 * @conventions Shown only on the admin screen; loads `GET /api/corpus-submissions` on mount and again after each decision; Approve and Reject on a pending row each ask for a confirmation first (approve publishes at once); the submitter name is shown to admins here and nowhere public; wording from `CorpusSubmissionsSection.messages.ts`; reuses `Badge`, `Button`, `StatusMessage`, `EmptyState` and the corpus card classes.
 * @exports CorpusSubmissionsSection
 */
import { useEffect, useState } from 'react';
import {
  approveCorpusSubmission,
  listCorpusSubmissions,
  rejectCorpusSubmission,
  type CorpusSubmission,
} from '../sync/admin-client.js';
import { corpusSubmissionsSectionMessages } from './CorpusSubmissionsSection.messages.js';
import { formatTimestamp } from './format.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { labelForKey } from './placement-label.js';
import { Badge } from './primitives/Badge.js';
import { Button } from './primitives/Button.js';
import { EmptyState } from './primitives/EmptyState.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { apiErrorText } from './api-error.js';

export function CorpusSubmissionsSection(): React.JSX.Element {
  const t = useMessages(corpusSubmissionsSectionMessages);
  const [uiLocale] = useLocale();
  const [submissions, setSubmissions] = useState<readonly CorpusSubmission[]>();
  const [loadError, setLoadError] = useState<string>();
  const [pending, setPending] = useState<{ readonly id: string; readonly decision: 'approve' | 'reject' }>();
  const [busyId, setBusyId] = useState<string>();
  const [decideError, setDecideError] = useState<string>();

  const load = (): Promise<void> =>
    listCorpusSubmissions().then(
      (loaded) => {
        setSubmissions(loaded);
      },
      (error: unknown) => {
        setLoadError(apiErrorText(error));
      },
    );

  useEffect(() => {
    let cancelled = false;
    listCorpusSubmissions().then(
      (loaded) => {
        if (!cancelled) setSubmissions(loaded);
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(apiErrorText(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const confirmDecision = (): void => {
    if (pending === undefined) return;
    const { id, decision } = pending;
    setPending(undefined);
    setBusyId(id);
    setDecideError(undefined);
    void (decision === 'approve' ? approveCorpusSubmission(id) : rejectCorpusSubmission(id))
      .then(() => load())
      .catch((cause: unknown) => {
        setDecideError(apiErrorText(cause));
        // The row may have been decided elsewhere; show the current state.
        return load();
      })
      .finally(() => {
        setBusyId(undefined);
      });
  };

  const statusText = (status: CorpusSubmission['status']): string =>
    status === 'pending' ? t.statusPending : status === 'approved' ? t.statusApproved : t.statusRejected;

  return (
    <section className="corpus-submissions" aria-labelledby="corpus-submissions-heading">
      <h2 id="corpus-submissions-heading">{t.heading}</h2>
      <p className="hint">{t.intro}</p>
      {loadError !== undefined && <StatusMessage kind="error">{t.couldNotLoad(loadError)}</StatusMessage>}
      {decideError !== undefined && <StatusMessage kind="error">{t.couldNotDecide(decideError)}</StatusMessage>}
      {loadError === undefined && submissions === undefined && (
        <StatusMessage kind="loading">{t.loading}</StatusMessage>
      )}
      {submissions !== undefined &&
        (submissions.length === 0 ? (
          <div className="corpus-empty">
            <EmptyState message={t.empty} />
          </div>
        ) : (
          <>
            <p className="corpus-queue-count">{t.count(String(submissions.length))}</p>
            <ul className="corpus-entry-list">
              {submissions.map((submission) => (
                <li key={submission.id} className="corpus-entry corpus-candidate">
                  <div className="corpus-entry-head">
                    <code className="corpus-entry-key">{submission.key}</code>
                    <span className="corpus-entry-tags">
                      <Badge>{statusText(submission.status)}</Badge>
                      <Badge>{submission.locale.toUpperCase()}</Badge>
                    </span>
                  </div>
                  {labelForKey(submission.key, uiLocale) !== submission.key && (
                    <p className="corpus-entry-meaning">
                      <span className="entry-meaning">{labelForKey(submission.key, uiLocale)}</span>
                    </p>
                  )}
                  <div className="corpus-candidate-text">
                    <h3 className="corpus-pane-title">{t.textLabel}</h3>
                    <p className="corpus-entry-text">{submission.text}</p>
                  </div>
                  <p className="hint">
                    {t.submitter(submission.submitterUsername ?? t.unknownUser)}{' '}
                    {t.submittedOn(formatTimestamp(submission.createdAt))} &middot;{' '}
                    {t.licence(submission.licenceVersion)}
                  </p>
                  {submission.status !== 'pending' && submission.decidedAt !== undefined && (
                    <p className="hint">
                      {statusText(submission.status)}{' '}
                      {submission.decidedByUsername === undefined
                        ? t.decidedOn(formatTimestamp(submission.decidedAt))
                        : t.decidedBy(submission.decidedByUsername, formatTimestamp(submission.decidedAt))}
                    </p>
                  )}
                  {submission.status === 'pending' && pending?.id === submission.id && (
                    <StatusMessage kind="error">
                      {pending.decision === 'approve'
                        ? t.confirmApprove(submission.key)
                        : t.confirmReject(submission.key)}{' '}
                      <Button
                        type="button"
                        variant={pending.decision === 'approve' ? 'primary' : 'danger'}
                        onClick={confirmDecision}
                      >
                        {pending.decision === 'approve' ? t.confirmApproveButton : t.confirmRejectButton}
                      </Button>{' '}
                      <Button
                        type="button"
                        variant="quiet"
                        onClick={() => {
                          setPending(undefined);
                        }}
                      >
                        {t.cancelButton}
                      </Button>
                    </StatusMessage>
                  )}
                  {submission.status === 'pending' && pending?.id !== submission.id && (
                    <span className="corpus-candidate-actions">
                      <Button
                        type="button"
                        variant="primary"
                        size="compact"
                        busy={busyId === submission.id}
                        busyLabel={t.deciding}
                        disabled={busyId !== undefined}
                        onClick={() => {
                          setPending({ id: submission.id, decision: 'approve' });
                        }}
                      >
                        {t.approveButton}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="compact"
                        disabled={busyId !== undefined}
                        onClick={() => {
                          setPending({ id: submission.id, decision: 'reject' });
                        }}
                      >
                        {t.rejectButton}
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        ))}
    </section>
  );
}
