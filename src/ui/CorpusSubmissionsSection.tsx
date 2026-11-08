/**
 * The admin's read-only view of corrections that users submitted (#1338, slice 2), shown inside the Corpus
 * candidates screen. Approving, rejecting and publishing arrive in a later slice; nothing here changes what a reader sees.
 */
/**
 * @module CorpusSubmissionsSection
 * @purpose Lists user-submitted interpretation corrections (status, entry, language, text, submitter, date) for admins, read-only.
 * @conventions Shown only on the admin screen; loads `GET /api/corpus-submissions` once on mount; the submitter name is shown to admins here and nowhere public; wording from `CorpusSubmissionsSection.messages.ts`; reuses `Badge`, `StatusMessage`, `EmptyState` and the corpus card classes.
 * @exports CorpusSubmissionsSection
 */
import { useEffect, useState } from 'react';
import { listCorpusSubmissions, type CorpusSubmission } from '../sync/admin-client.js';
import { corpusSubmissionsSectionMessages } from './CorpusSubmissionsSection.messages.js';
import { formatTimestamp } from './format.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { labelForKey } from './placement-label.js';
import { Badge } from './primitives/Badge.js';
import { EmptyState } from './primitives/EmptyState.js';
import { StatusMessage } from './primitives/StatusMessage.js';

export function CorpusSubmissionsSection(): React.JSX.Element {
  const t = useMessages(corpusSubmissionsSectionMessages);
  const [uiLocale] = useLocale();
  const [submissions, setSubmissions] = useState<readonly CorpusSubmission[]>();
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    listCorpusSubmissions().then(
      (loaded) => {
        if (!cancelled) setSubmissions(loaded);
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const statusText = (status: CorpusSubmission['status']): string =>
    status === 'pending' ? t.statusPending : status === 'approved' ? t.statusApproved : t.statusRejected;

  return (
    <section className="corpus-submissions" aria-labelledby="corpus-submissions-heading">
      <h2 id="corpus-submissions-heading">{t.heading}</h2>
      <p className="hint">{t.intro}</p>
      {loadError !== undefined && <StatusMessage kind="error">{t.couldNotLoad(loadError)}</StatusMessage>}
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
                </li>
              ))}
            </ul>
          </>
        ))}
    </section>
  );
}
