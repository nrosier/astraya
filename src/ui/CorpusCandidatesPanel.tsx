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
 * Importing new candidates into the queue is not part of this screen — it happens via
 * `POST /api/admin/corpus-candidates/import`, called by generation tooling
 * (`tools/corpus-gen/`), not by a human through this UI.
 */
/**
 * @module CorpusCandidatesPanel
 * @purpose Renders the admin screen for reviewing bulk-generated interpretation-corpus candidates, sorted worst-triage-score-first, with accept/reject actions.
 * @conventions Accepting a candidate turns it into a live correction in CorpusOverridesPanel; nothing here is visible to a reader until accepted. The corpus-language selector is local state, independent from the app's own `useLocale()`. Text comes from co-located `CorpusCandidatesPanel.messages.ts` via `useMessages()`.
 * @exports CorpusCandidatesPanel
 */
import { Checkbox } from './primitives/Checkbox.js';
import { formatFixed } from './format.js';
import { Select } from './primitives/Select.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SortableTable } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';
import { decideCorpusCandidates, listCorpusCandidates } from '../sync/admin-client.js';
import { CORPUS_LOCALES } from '../interpretation/schema.js';
import { LOCALE_LABELS, isLocale, useLocale } from './locale.js';
import { EntryLabel } from './EntryLabel.js';
import { compareSortKeys, labelForKey, sortKeyForKey, tagExplanation, tagLabel } from './placement-label.js';
import { useMessages } from './messages.js';
import { corpusCandidatesPanelMessages } from './CorpusCandidatesPanel.messages.js';
import { sharedMessages } from './shared.messages.js';
import type { CorpusCandidate } from '../sync/admin-client.js';
import type { Locale } from '../interpretation/schema.js';
import { StatusMessage } from './primitives/StatusMessage.js';

export function CorpusCandidatesPanel(): React.JSX.Element {
  const t = useMessages(corpusCandidatesPanelMessages);
  const shared = useMessages(sharedMessages);

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

  const columns: readonly TableColumn<CorpusCandidate>[] = [
    {
      key: 'select',
      label: t.selectColumn,
      sortable: false,
      valueOf: (candidate) => selected.has(candidate.id),
      renderCell: (candidate) => (
        <Checkbox
          hideLabel
          label={labelForKey(candidate.key, uiLocale)}
          checked={selected.has(candidate.id)}
          onChange={(value) => {
            toggleSelected(candidate.id, value);
          }}
        />
      ),
    },
    {
      key: 'key',
      label: t.keyColumn,
      valueOf: (candidate) => labelForKey(candidate.key, uiLocale),
      renderCell: (candidate) => (
        <>
          <EntryLabel entryKey={candidate.key} locale={uiLocale} />
          {duplicateIdentities.has(candidate.key) && (
            <>
              {' '}
              <span className="hint" role="img" aria-label={t.duplicateKeyHint} title={t.duplicateKeyHint}>
                ⚠
              </span>
            </>
          )}
        </>
      ),
    },
    {
      key: 'details',
      label: t.detailsColumn,
      sortable: false,
      valueOf: (candidate) => candidate.text,
      renderCell: (candidate) => (
        <dl className="entry-details">
          <dt>{t.sourceColumn}</dt>
          <dd>{candidate.source === 'classical-seed' ? t.sourceClassicalSeed : t.sourceLlmFill}</dd>
          <dt>{t.triageColumn}</dt>
          <dd>
            {candidate.triageSignal === 'match'
              ? t.triageMatch
              : candidate.triageSignal === 'mismatch'
                ? t.triageMismatch
                : candidate.triageSignal === 'no-baseline'
                  ? t.triageNoBaseline
                  : t.triageUnchecked}
            {candidate.triageScore !== undefined && ` (${formatFixed(candidate.triageScore, 2)})`}
          </dd>
          <dt>{t.tagsColumn}</dt>
          <dd>
            {candidate.tags.map((tag) => (
              <span key={tag} className="cell-tag">
                {tagLabel(tag, uiLocale)}
                <span className="cell-explanation">{tagExplanation(tag, uiLocale)}</span>
              </span>
            ))}
          </dd>
          <dt>{t.textColumn}</dt>
          <dd className="entry-text">{candidate.text}</dd>
        </dl>
      ),
    },
    {
      key: 'actions',
      label: t.actionsColumn,
      sortable: false,
      valueOf: () => '',
      renderCell: (candidate) => (
        <span className="actions">
          <button
            type="button"
            className="quiet"
            disabled={deciding}
            onClick={() => {
              decide([candidate.id], 'accept');
            }}
          >
            {t.acceptButton}
          </button>{' '}
          <button
            type="button"
            className="quiet danger"
            disabled={deciding}
            onClick={() => {
              decide([candidate.id], 'reject');
            }}
          >
            {t.rejectButton}
          </button>
        </span>
      ),
    },
  ];

  return (
    <main className="shell">
      <p className="back">
        <a href="#/admin">&larr; {shared.back}</a>
      </p>
      <h1>{t.heading}</h1>
      <p>{t.intro}</p>

      {loadError !== undefined && <StatusMessage kind="error">{t.couldNotLoad(loadError)}</StatusMessage>}

      <div className="field-grid">
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

      {candidates === undefined ? (
        <StatusMessage kind="loading">{t.loadingCandidates}</StatusMessage>
      ) : candidates.length === 0 ? (
        <p className="empty">{t.noResults}</p>
      ) : (
        <>
          <p className="actions">
            <Checkbox
              label={t.selectAllLabel}
              checked={selected.size > 0 && selected.size === candidates.length}
              onChange={(value) => {
                toggleSelectAll(value);
              }}
            />{' '}
            {t.selectedCount(String(selected.size))}{' '}
            <button
              type="button"
              disabled={selected.size === 0 || deciding}
              onClick={() => {
                decide(Array.from(selected), 'accept');
              }}
            >
              {deciding ? t.deciding : t.acceptSelectedButton}
            </button>{' '}
            <button
              type="button"
              className="danger"
              disabled={selected.size === 0 || deciding}
              onClick={() => {
                decide(Array.from(selected), 'reject');
              }}
            >
              {deciding ? t.deciding : t.rejectSelectedButton}
            </button>
          </p>

          <SortableTable
            wrap
            headingLevel={2}
            caption={t.candidatesHeading}
            columns={columns}
            rows={candidates}
            getRowKey={(candidate) => candidate.id}
          />
        </>
      )}
    </main>
  );
}
