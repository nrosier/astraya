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
import { useEffect, useMemo, useState } from 'react';
import { diffWords, type DiffSegment } from '../domain/text-diff.js';
import { loadCommittedCorpus, loadRuntimeCorpus } from '../interpretation/corpus-client.js';
import type { CorpusEntry, Locale } from '../interpretation/schema.js';
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

type OldTexts = ReadonlyMap<string, string> | 'unavailable';

/** Key-to-text for one locale, or `'unavailable'` when the corpus could not be read. */
async function textsFor(load: Promise<readonly CorpusEntry[]>): Promise<OldTexts> {
  try {
    const entries = await load;
    return new Map(entries.map((entry) => [entry.key, entry.text]));
  } catch {
    return 'unavailable';
  }
}

interface DiffSideProps {
  readonly segments: readonly DiffSegment[];
  readonly side: 'old' | 'new';
  readonly removedMarker: string;
  readonly addedMarker: string;
}

/** One side of the diff: all of its words, with its changed words marked by a symbol, a hidden label and a colour. */
function DiffSide({ segments, side, removedMarker, addedMarker }: DiffSideProps): React.JSX.Element {
  return (
    <p className="corpus-entry-text text-diff">
      {segments.map((segment, index) => {
        if (segment.kind === 'same') return <span key={index}>{segment.text} </span>;
        if (side === 'old' && segment.kind === 'removed') {
          return (
            <del key={index} className="text-diff-removed">
              <span className="sr-only">{removedMarker}</span>
              <span aria-hidden="true">&minus; </span>
              {segment.text}
            </del>
          );
        }
        if (side === 'new' && segment.kind === 'added') {
          return (
            <ins key={index} className="text-diff-added">
              <span className="sr-only">{addedMarker}</span>
              <span aria-hidden="true">+ </span>
              {segment.text}
            </ins>
          );
        }
        return null;
      })}
    </p>
  );
}

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

  // The text each submission is compared with: the live text for a pending one, the shipped text for a decided one
  // (an approved override would otherwise equal the suggestion).
  const [liveTexts, setLiveTexts] = useState<Partial<Record<Locale, OldTexts>>>({});
  const [shippedTexts, setShippedTexts] = useState<Partial<Record<Locale, OldTexts>>>({});
  const neededLocales = useMemo(
    () => [...new Set((submissions ?? []).map((submission) => submission.locale))],
    [submissions],
  );
  useEffect(() => {
    let cancelled = false;
    for (const locale of neededLocales) {
      void textsFor(loadRuntimeCorpus(locale)).then((texts) => {
        if (!cancelled) setLiveTexts((previous) => ({ ...previous, [locale]: texts }));
      });
      void textsFor(loadCommittedCorpus(locale)).then((texts) => {
        if (!cancelled) setShippedTexts((previous) => ({ ...previous, [locale]: texts }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [neededLocales]);

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
                  <SubmissionDiff
                    submission={submission}
                    oldTexts={(submission.status === 'pending' ? liveTexts : shippedTexts)[submission.locale]}
                  />
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

interface SubmissionDiffProps {
  readonly submission: CorpusSubmission;
  readonly oldTexts: OldTexts | undefined;
}

/** The current text above the suggested text, each with its changed words marked (stacked, not side by side: texts can be long). */
function SubmissionDiff({ submission, oldTexts }: SubmissionDiffProps): React.JSX.Element {
  const t = useMessages(corpusSubmissionsSectionMessages);
  const oldText = oldTexts === undefined || oldTexts === 'unavailable' ? undefined : oldTexts.get(submission.key);
  const segments = useMemo(() => diffWords(oldText ?? '', submission.text), [oldText, submission.text]);
  const oldTitle = submission.status === 'pending' ? t.oldTextLive : t.oldTextShipped;
  const unchanged = oldText !== undefined && segments.every((segment) => segment.kind === 'same');
  return (
    <div className="corpus-candidate-text">
      {oldTexts === undefined ? null : oldText === undefined ? (
        <p className="hint">{oldTexts === 'unavailable' ? t.oldTextUnavailable : t.noOldEntry}</p>
      ) : (
        <>
          <h3 className="corpus-pane-title">{oldTitle}</h3>
          <DiffSide segments={segments} side="old" removedMarker={t.removedMarker} addedMarker={t.addedMarker} />
        </>
      )}
      <h3 className="corpus-pane-title">{oldText === undefined ? t.textLabel : t.newTextLabel}</h3>
      <DiffSide
        segments={oldText === undefined ? [{ kind: 'same', text: submission.text }] : segments}
        side="new"
        removedMarker={t.removedMarker}
        addedMarker={t.addedMarker}
      />
      {oldText !== undefined && !unchanged && <p className="hint">{t.diffLegend}</p>}
      {unchanged && <p className="hint">{t.unchangedNote}</p>}
    </div>
  );
}
