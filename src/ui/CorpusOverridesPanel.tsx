/**
 * Admin corpus-correction browsing and editing (#292): search/filter the interpretation
 * corpus and replace an entry's text without touching the committed JSON. Its own screen
 * rather than a tab inside `AdminPanel.tsx` — this dataset (~16k rows for `en.json` alone)
 * and its filter state are large enough to warrant that separation.
 *
 * The corpus-language selector below is deliberately **local state**, not the shared,
 * app-wide `useLocale()` store (`locale.ts`) that also drives this app's own UI language —
 * switching which corpus locale an admin is browsing must not silently change the language
 * the rest of the app speaks to them. `useMessages` (this panel's own labels) still reads
 * the shared store, same as every other screen.
 *
 * Reuses `loadRuntimeCorpus` (`corpus-client.ts`) for browsing — the exact function
 * `ReportView.tsx` calls to render a report — so the corpus admins see here is already
 * merged with any existing corrections. `listCorpusOverrides` supplies the metadata
 * (override id, "is this actually overridden") that merged `CorpusEntry` values alone don't
 * carry.
 */
/**
 * @module CorpusOverridesPanel
 * @purpose Renders the admin screen for browsing/searching/filtering the committed interpretation corpus and replacing an entry's text with a correction, without touching the committed JSON.
 * @conventions Reuses `loadRuntimeCorpus` (the same function ReportView uses) so the admin sees the corpus already merged with existing corrections; the corpus-language selector is local state, independent from the app's own `useLocale()`. Text comes from co-located `CorpusOverridesPanel.messages.ts` via `useMessages()`.
 * @exports CorpusOverridesPanel
 */
import { Checkbox } from './primitives/Checkbox.js';
import { Select } from './primitives/Select.js';
import { TextAreaField } from './primitives/TextAreaField.js';
import { TextField } from './primitives/TextField.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SortableTable } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';
import {
  deleteCorpusOverride,
  exportCorpusOverrides,
  listCorpusOverrides,
  upsertCorpusOverride,
} from '../sync/admin-client.js';
import { loadRuntimeCorpus } from '../interpretation/corpus-client.js';
import { CORPUS_CATEGORIES, CORPUS_LOCALES, CORPUS_TIERS, categoryOfKey } from '../interpretation/schema.js';
import { downloadBlob } from './download.js';
import { LOCALE_LABELS, isLocale, useLocale } from './locale.js';
import { EntryLabel } from './EntryLabel.js';
import {
  categoryExplanation,
  categoryLabel,
  compareSortKeys,
  labelForKey,
  sortKeyForKey,
  tagExplanation,
  tagLabel,
  tierExplanation,
  tierLabel,
} from './placement-label.js';
import { useMessages } from './messages.js';
import { corpusOverridesPanelMessages } from './CorpusOverridesPanel.messages.js';
import type { CorpusOverride } from '../sync/admin-client.js';
import type { CorpusCategory, CorpusEntry, CorpusTier, Locale } from '../interpretation/schema.js';
import { FilterSummary } from './primitives/FilterSummary.js';
import { EmptyState } from './primitives/EmptyState.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { BackLink } from './BackLink.js';

const PAGE_SIZE = 50;

function isCorpusCategory(value: string): value is CorpusCategory {
  return (CORPUS_CATEGORIES as readonly string[]).includes(value);
}

function isCorpusTier(value: string): value is CorpusTier {
  return (CORPUS_TIERS as readonly string[]).includes(value);
}

interface LoadedData {
  readonly corpus: readonly CorpusEntry[];
  readonly overrides: readonly CorpusOverride[];
}

interface EditState {
  readonly key: string;
  readonly text: string;
  readonly tier: CorpusTier;
  readonly tags: string;
}

interface PendingReset {
  readonly key: string;
  readonly overrideId: string;
}

export function CorpusOverridesPanel(): React.JSX.Element {
  const t = useMessages(corpusOverridesPanelMessages);
  // The admin's interface language: what an entry means is worded in it, whichever corpus language is browsed.
  const [uiLocale] = useLocale();

  const [corpusLocale, setCorpusLocale] = useState<Locale>('en');

  const [data, setData] = useState<LoadedData>();
  const [loadError, setLoadError] = useState<string>();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CorpusCategory | ''>('');
  const [tierFilter, setTierFilter] = useState<CorpusTier | ''>('');
  const [tagFilter, setTagFilter] = useState('');
  const [overriddenOnly, setOverriddenOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<EditState>();
  const [pendingReset, setPendingReset] = useState<PendingReset>();
  const [busyKey, setBusyKey] = useState<string>();
  const [saveError, setSaveError] = useState<string>();

  const load = useCallback(
    (): Promise<void> =>
      Promise.all([loadRuntimeCorpus(corpusLocale), listCorpusOverrides(corpusLocale)]).then(([corpus, overrides]) => {
        setData({ corpus, overrides });
      }),
    [corpusLocale],
  );

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    setLoadError(undefined);
    void load().catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [corpusLocale, categoryFilter, tierFilter, tagFilter, overriddenOnly, search]);

  const overrideMap = useMemo(() => {
    const map = new Map<string, CorpusOverride>();
    for (const override of data?.overrides ?? []) map.set(override.key, override);
    return map;
  }, [data]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const entry of data?.corpus ?? []) for (const tag of entry.tags) tags.add(tag);
    return Array.from(tags).sort();
  }, [data]);

  // Each entry with what it means and where it sorts, worked out once per corpus and language.
  const labelled = useMemo(
    () =>
      (data?.corpus ?? []).map((entry) => ({
        entry,
        label: labelForKey(entry.key, uiLocale),
        sort: sortKeyForKey(entry.key),
      })),
    [data, uiLocale],
  );

  const filtered = useMemo(() => {
    // Every word typed must appear in the meaning, the key or the text, so "sun 3rd house" finds
    // "Sun in the 3rd house" and a pasted key still finds its entry.
    const words = search
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word !== '');
    return (
      labelled
        .filter(({ entry, label }) => {
          if (categoryFilter !== '' && categoryOfKey(entry.key) !== categoryFilter) return false;
          if (tierFilter !== '' && entry.tier !== tierFilter) return false;
          if (tagFilter !== '' && !entry.tags.includes(tagFilter)) return false;
          if (overriddenOnly && !overrideMap.has(entry.key)) return false;
          if (words.length > 0) {
            const haystack = `${label} ${entry.key} ${entry.text}`.toLowerCase();
            if (!words.every((word) => haystack.includes(word))) return false;
          }
          return true;
        })
        // By what the entry means (planet, then sign or house in order), not by its key as text.
        .sort((a, b) => compareSortKeys(a.sort, b.sort))
        .map(({ entry }) => entry)
    );
  }, [labelled, categoryFilter, tierFilter, tagFilter, overriddenOnly, search, overrideMap]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const categoryExplanationOf = (key: string): string | undefined => {
    const category = categoryOfKey(key);
    return category === undefined ? undefined : categoryExplanation(category, uiLocale);
  };
  const categoryLabelOf = (key: string): string => {
    const category = categoryOfKey(key);
    return category === undefined ? '—' : categoryLabel(category, uiLocale);
  };

  const startEdit = (entry: CorpusEntry): void => {
    setEditing({
      key: entry.key,
      text: entry.text,
      tier: entry.tier,
      tags: entry.tags.join(', '),
    });
    setSaveError(undefined);
  };

  const cancelEdit = (): void => {
    setEditing(undefined);
    setSaveError(undefined);
  };

  const save = (): void => {
    if (editing === undefined) return;
    const identity = editing.key;
    setBusyKey(identity);
    setSaveError(undefined);
    const tags = editing.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== '');
    void upsertCorpusOverride({
      key: editing.key,
      locale: corpusLocale,
      text: editing.text,
      tier: editing.tier,
      tags,
    })
      .then(() => {
        setEditing(undefined);
        return load();
      })
      .catch((cause: unknown) => {
        setSaveError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusyKey(undefined);
      });
  };

  const requestReset = (): void => {
    if (editing === undefined) return;
    const override = overrideMap.get(editing.key);
    if (override === undefined) return;
    setPendingReset({ key: editing.key, overrideId: override.id });
  };

  const confirmReset = (): void => {
    const target = pendingReset;
    if (target === undefined) return;
    setPendingReset(undefined);
    setBusyKey(target.key);
    setSaveError(undefined);
    void deleteCorpusOverride(target.overrideId)
      .then(() => {
        setEditing(undefined);
        return load();
      })
      .catch((cause: unknown) => {
        setSaveError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusyKey(undefined);
      });
  };

  const exportCorrections = (): void => {
    setLoadError(undefined);
    void exportCorpusOverrides(corpusLocale)
      .then((blob) => {
        downloadBlob(`astraya-corpus-overrides-${corpusLocale}.json`, blob);
      })
      .catch((cause: unknown) => {
        setLoadError(cause instanceof Error ? cause.message : String(cause));
      });
  };

  const columns: readonly TableColumn<(typeof visible)[number]>[] = [
    {
      key: 'key',
      label: t.keyColumn,
      valueOf: (entry) => labelForKey(entry.key, uiLocale),
      renderCell: (entry) => <EntryLabel entryKey={entry.key} locale={uiLocale} />,
    },
    {
      key: 'details',
      label: t.detailsColumn,
      sortable: false,
      valueOf: (entry) => entry.text,
      renderCell: (entry) => (
        <dl className="entry-details">
          <dt>{t.categoryColumn}</dt>
          <dd>
            {categoryLabelOf(entry.key)}
            <span className="cell-explanation">{categoryExplanationOf(entry.key)}</span>
          </dd>
          <dt>{t.tierColumn}</dt>
          <dd>
            {tierLabel(entry.tier, uiLocale)}
            <span className="cell-explanation">{tierExplanation(entry.tier, uiLocale)}</span>
          </dd>
          <dt>{t.tagsColumn}</dt>
          <dd>
            {entry.tags.map((tag) => (
              <span key={tag} className="cell-tag">
                {tagLabel(tag, uiLocale)}
                <span className="cell-explanation">{tagExplanation(tag, uiLocale)}</span>
              </span>
            ))}
          </dd>
          <dt>{t.textColumn}</dt>
          <dd className="entry-text">{entry.text}</dd>
          <dt>{t.statusColumn}</dt>
          <dd>{overrideMap.has(entry.key) ? t.overriddenStatus : t.defaultStatus}</dd>
        </dl>
      ),
    },
    {
      key: 'actions',
      label: t.actionsColumn,
      sortable: false,
      valueOf: () => '',
      renderCell: (entry) => (
        <span className="actions">
          <button
            type="button"
            className="quiet"
            disabled={busyKey === entry.key}
            onClick={() => {
              startEdit(entry);
            }}
          >
            {busyKey === entry.key ? t.savingLabel : t.editButton}
          </button>
        </span>
      ),
    },
  ];

  return (
    <main className="shell">
      <BackLink fallback="#/admin" />
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
        <TextField label={t.searchLabel} value={search} onChange={setSearch} />
        <Select
          label={t.categoryLabel}
          value={categoryFilter}
          options={[
            { value: '', label: t.allCategories },
            ...CORPUS_CATEGORIES.map((category) => ({ value: category, label: categoryLabel(category, uiLocale) })),
          ]}
          onChange={(value) => {
            setCategoryFilter(isCorpusCategory(value) ? value : '');
          }}
        />
        <Select
          label={t.tierLabel}
          value={tierFilter}
          options={[
            { value: '', label: t.allTiers },
            ...CORPUS_TIERS.map((tier) => ({ value: tier, label: tierLabel(tier, uiLocale) })),
          ]}
          onChange={(value) => {
            setTierFilter(isCorpusTier(value) ? value : '');
          }}
        />
        <Select
          label={t.tagLabel}
          value={tagFilter}
          options={[
            { value: '', label: t.allTags },
            ...availableTags.map((tag) => ({ value: tag, label: tagLabel(tag, uiLocale) })),
          ]}
          onChange={setTagFilter}
        />
        <Checkbox label={t.overriddenOnlyLabel} checked={overriddenOnly} onChange={setOverriddenOnly} />
      </div>

      <p className="actions">
        <button type="button" className="quiet" onClick={exportCorrections}>
          {t.exportButton}
        </button>
      </p>

      {saveError !== undefined && <StatusMessage kind="error">{t.saveFailed(saveError)}</StatusMessage>}

      {pendingReset !== undefined && (
        <StatusMessage kind="error">
          {t.resetWarning(`${labelForKey(pendingReset.key, uiLocale)} (${pendingReset.key})`)}{' '}
          <button type="button" className="danger" onClick={confirmReset}>
            {t.resetPermanentlyButton}
          </button>{' '}
          <button
            type="button"
            className="quiet"
            onClick={() => {
              setPendingReset(undefined);
            }}
          >
            {t.cancelButton}
          </button>
        </StatusMessage>
      )}

      {editing !== undefined && (
        <form
          className="field-grid"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <p>
            <strong>{labelForKey(editing.key, uiLocale)}</strong> <code className="entry-key">{editing.key}</code>
          </p>
          <TextAreaField
            label={t.textLabel}
            rows={4}
            value={editing.text}
            onChange={(value) => {
              setEditing({ ...editing, text: value });
            }}
          />
          <Select
            label={t.tierFieldLabel}
            value={editing.tier}
            options={CORPUS_TIERS.map((tier) => ({ value: tier, label: tier }))}
            onChange={(value) => {
              if (isCorpusTier(value)) setEditing({ ...editing, tier: value });
            }}
          />
          <TextField
            label={t.tagsFieldLabel}
            value={editing.tags}
            onChange={(value) => {
              setEditing({ ...editing, tags: value });
            }}
          />
          <p className="actions">
            <button type="submit" disabled={busyKey === editing.key}>
              {busyKey === editing.key ? t.savingLabel : t.saveButton}
            </button>
            <button type="button" className="quiet" onClick={cancelEdit}>
              {t.cancelButton}
            </button>
            {overrideMap.has(editing.key) && (
              <button type="button" className="danger" disabled={busyKey === editing.key} onClick={requestReset}>
                {t.resetButton}
              </button>
            )}
          </p>
        </form>
      )}

      {data === undefined ? (
        <StatusMessage kind="loading">{t.loadingCorpus}</StatusMessage>
      ) : (
        <>
          {filtered.length === 0 ? (
            <EmptyState message={t.noResults} />
          ) : (
            <SortableTable
              wrap
              headingLevel={2}
              caption={t.entriesHeading}
              columns={columns}
              rows={visible}
              getRowKey={(entry) => entry.key}
            />
          )}

          <FilterSummary summary={t.resultCount(String(visible.length), String(filtered.length))} />
          {visible.length < filtered.length && (
            <p className="actions">
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setPage((current) => current + 1);
                }}
              >
                {t.loadMoreButton}
              </button>
            </p>
          )}
        </>
      )}
    </main>
  );
}
