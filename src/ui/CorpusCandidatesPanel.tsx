/**
 * Admin review of bulk-generated corpus candidates (#370): the pending-candidate queue
 * upstream of `CorpusOverridesPanel.tsx` (#292) — accepting a candidate here turns it into a
 * live correction there; nothing here is visible to a reader until that happens. Its own
 * screen for the same reason `CorpusOverridesPanel.tsx` is: a distinct dataset and filter/
 * selection state large enough to warrant separation from `AdminPanel.tsx`.
 *
 * Sorted worst-triage-score-first by the server (`listCorpusCandidates`'s own `ORDER BY`) —
 * per #359/#370's own framing, "scrutinize the flagged mismatches closely, spot-check the
 * ones that passed" — so no client-side sort control is offered; re-sorting by anything else
 * would undercut the one prioritization this queue exists to give a reviewer.
 *
 * Each candidate is a card, not a table row (#816): its per-card Accept is the primary action and
 * Reject is the danger action. The bulk-select bar stays above the cards, with bulk Accept as the
 * secondary (quiet) action (#816 D-816b).
 *
 * Importing new candidates into the queue is not part of this screen — it happens via
 * `POST /api/admin/corpus-candidates/import`, called by generation tooling
 * (`tools/corpus-gen/`), not by a human through this UI.
 */
/**
 * @module CorpusCandidatesPanel
 * @purpose Renders the admin screen for reviewing bulk-generated interpretation-corpus candidates as cards, sorted worst-triage-score-first, with bulk and per-card accept/reject actions.
 * @conventions Accepting a candidate turns it into a live correction in CorpusOverridesPanel; nothing here is visible to a reader until accepted. Accept is the primary Button, Reject the danger Button; no green. The corpus-language selector is local state, independent from the app's own `useLocale()`. Text comes from co-located `CorpusCandidatesPanel.messages.ts` via `useMessages()`.
 * @exports CorpusCandidatesPanel
 */
import { Badge, type BadgeTone } from './primitives/Badge.js';
import { Button } from './primitives/Button.js';
import { Checkbox } from './primitives/Checkbox.js';
import { formatFixed } from './format.js';
import { Select } from './primitives/Select.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { decideCorpusCandidates, listCorpusCandidates } from '../sync/admin-client.js';
import { CORPUS_LOCALES } from '../interpretation/schema.js';
import { LOCALE_LABELS, isLocale, useLocale } from './locale.js';
import { compareSortKeys, labelForKey, sortKeyForKey, tagExplanation, tagLabel } from './placement-label.js';
import { useMessages } from './messages.js';
import { corpusCandidatesPanelMessages } from './CorpusCandidatesPanel.messages.js';
import type { CorpusCandidate } from '../sync/admin-client.js';
import type { Locale } from '../interpretation/schema.js';
import { EmptyState } from './primitives/EmptyState.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { BackLink } from './BackLink.js';
import { PageHeader } from './PageHeader.js';

/** The triage tone for a candidate: a mismatch is a warning-level fact, a match is plain (never green). */
function triageTone(signal: CorpusCandidate['triageSignal']): BadgeTone | undefined {
  if (signal === 'mismatch') return 'danger';
  return undefined;
}

export function CorpusCandidatesPanel(): React.JSX.Element {
  const t = useMessages(corpusCandidatesPanelMessages);

  const [corpusLocale, setCorpusLocale] = useState<Locale>('en');
  // The admin's interface language: what a candidate means is worded in it (#428).
  const [uiLocale] = useLocale();
  const [loaded, setCandidates] = useState<readonly CorpusCandidate[]>();
  // By what each candidate means (planet, then sign or house in order), not by its key as text.
  const candidates = useMemo(
    () =>
      loaded === undefined
        ? undefined
        : [...loaded].sort((a, b) => compareSortKeys(sortKeyForKey(a.key), sortKeyForKey(b.key))),
    [loaded],
  );
  const [loadError, setLoadError] = useState<string>();

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string>();
  const [missingCount, setMissingCount] = useState<number>();

  const load = useCallback(
    (): Promise<void> =>
      listCorpusCandidates(corpusLocale).then((loaded) => {
        setCandidates(loaded);
        setSelected(new Set());
      }),
    [corpusLocale],
  );

  useEffect(() => {
    let cancelled = false;
    setCandidates(undefined);
    setLoadError(undefined);
    void load().catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Which keys have more than one still-pending candidate — the collision
  // #370's own "Dedup" requirement asks a reviewer be able to see, e.g. a classical-seed and
  // an llm-fill candidate both proposing text for the same placement.
  const duplicateIdentities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const candidate of candidates ?? []) {
      const identity = candidate.key;
      counts.set(identity, (counts.get(identity) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([identity]) => identity),
    );
  }, [candidates]);

  const toggleSelected = (id: string, checked: boolean): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean): void => {
    setSelected(checked ? new Set((candidates ?? []).map((candidate) => candidate.id)) : new Set());
  };

  const decide = (ids: readonly string[], decision: 'accept' | 'reject'): void => {
    if (ids.length === 0) return;
    setDeciding(true);
    setDecideError(undefined);
    setMissingCount(undefined);
    void decideCorpusCandidates(ids, decision)
      .then((result) => {
        if (result.missing.length > 0) setMissingCount(result.missing.length);
        return load();
      })
      .catch((cause: unknown) => {
        setDecideError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setDeciding(false);
      });
  };

  const triageLabel = (candidate: CorpusCandidate): string => {
    const word =
      candidate.triageSignal === 'match'
        ? t.triageMatch
        : candidate.triageSignal === 'mismatch'
          ? t.triageMismatch
          : candidate.triageSignal === 'no-baseline'
            ? t.triageNoBaseline
            : t.triageUnchecked;
    return candidate.triageScore === undefined ? word : `${word} (${formatFixed(candidate.triageScore, 2)})`;
  };

  return (
    <main className="shell admin-view">
      <div className="admin-view-head">
        <BackLink fallback="#/admin" />
        <PageHeader title={t.heading} />
        <p>{t.intro}</p>
      </div>
      <div className="admin-stack">
        {loadError !== undefined && <StatusMessage kind="error">{t.couldNotLoad(loadError)}</StatusMessage>}

        <div className="corpus-toolbar">
          <Select
            label={t.corpusLocaleLabel}
            value={corpusLocale}
            options={CORPUS_LOCALES.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] }))}
            onChange={(value) => {
              if (isLocale(value)) setCorpusLocale(value);
            }}
          />
        </div>

        {decideError !== undefined && <StatusMessage kind="error">{t.decideFailed(decideError)}</StatusMessage>}
        {missingCount !== undefined && missingCount > 0 && (
          <StatusMessage kind="error">{t.missingWarning(String(missingCount))}</StatusMessage>
        )}

        <div className="corpus-queue-summary">
          <p className="corpus-queue-count">
            {candidates === undefined ? t.loadingCandidates : t.pendingCount(String(candidates.length))}
          </p>
          <p className="hint">{t.sortRule}</p>
        </div>

        {candidates === undefined ? (
          <StatusMessage kind="loading">{t.loadingCandidates}</StatusMessage>
        ) : candidates.length === 0 ? (
          <div className="corpus-empty">
            <EmptyState message={t.noResults} />
          </div>
        ) : (
          <>
            <div className="corpus-bulk-bar">
              <Checkbox
                label={t.selectAllLabel}
                checked={selected.size > 0 && selected.size === candidates.length}
                onChange={(value) => {
                  toggleSelectAll(value);
                }}
              />
              <span className="muted">{t.selectedCount(String(selected.size))}</span>
              <span className="corpus-bulk-actions">
                <Button
                  variant="quiet"
                  size="compact"
                  disabled={selected.size === 0 || deciding}
                  onClick={() => {
                    decide(Array.from(selected), 'accept');
                  }}
                >
                  {deciding ? t.deciding : t.acceptSelectedButton}
                </Button>
                <Button
                  variant="danger"
                  size="compact"
                  disabled={selected.size === 0 || deciding}
                  onClick={() => {
                    decide(Array.from(selected), 'reject');
                  }}
                >
                  {deciding ? t.deciding : t.rejectSelectedButton}
                </Button>
              </span>
            </div>

            <h2 className="sr-only">{t.candidatesHeading}</h2>
            <ul className="corpus-entry-list">
              {candidates.map((candidate) => {
                const isDuplicate = duplicateIdentities.has(candidate.key);
                return (
                  <li key={candidate.id} className="corpus-entry corpus-candidate">
                    <div className="corpus-entry-head">
                      <Checkbox
                        hideLabel
                        label={labelForKey(candidate.key, uiLocale)}
                        checked={selected.has(candidate.id)}
                        onChange={(value) => {
                          toggleSelected(candidate.id, value);
                        }}
                      />
                      <code className="corpus-entry-key">{candidate.key}</code>
                      <span className="corpus-entry-tags">
                        <Badge>{candidate.source === 'classical-seed' ? t.sourceClassicalSeed : t.sourceLlmFill}</Badge>
                        <Badge tone={triageTone(candidate.triageSignal)}>{triageLabel(candidate)}</Badge>
                        {isDuplicate && (
                          <span className="hint" role="img" aria-label={t.duplicateKeyHint} title={t.duplicateKeyHint}>
                            ⚠
                          </span>
                        )}
                      </span>
                      <span className="corpus-candidate-actions">
                        <Button
                          variant="primary"
                          size="compact"
                          disabled={deciding}
                          onClick={() => {
                            decide([candidate.id], 'accept');
                          }}
                        >
                          {t.acceptButton}
                        </Button>
                        <Button
                          variant="danger"
                          size="compact"
                          disabled={deciding}
                          onClick={() => {
                            decide([candidate.id], 'reject');
                          }}
                        >
                          {t.rejectButton}
                        </Button>
                      </span>
                    </div>
                    {labelForKey(candidate.key, uiLocale) !== candidate.key && (
                      <p className="corpus-entry-meaning">
                        <span className="entry-meaning">{labelForKey(candidate.key, uiLocale)}</span>
                      </p>
                    )}
                    <div className="corpus-candidate-text">
                      <h3 className="corpus-pane-title">{t.candidateTextLabel}</h3>
                      <p className="corpus-entry-text">{candidate.text}</p>
                    </div>
                    {candidate.tags.length > 0 && (
                      <p className="corpus-entry-tags">
                        {candidate.tags.map((tag) => (
                          <span key={tag} className="cell-tag" title={tagExplanation(tag, uiLocale)}>
                            {tagLabel(tag, uiLocale)}
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
