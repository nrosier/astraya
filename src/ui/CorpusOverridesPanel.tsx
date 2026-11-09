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
import { StagedDialog } from './primitives/StagedDialog.js';
import { Select } from './primitives/Select.js';
import { TextAreaField } from './primitives/TextAreaField.js';
import { TextField } from './primitives/TextField.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteCorpusOverride,
  exportCorpusOverrides,
  listCorpusOverrides,
  upsertCorpusOverride,
} from '../sync/admin-client.js';
import { loadRuntimeCorpus } from '../interpretation/corpus-client.js';
import { CORPUS_CATEGORIES, CORPUS_LOCALES, CORPUS_TIERS, categoryOfKey } from '../interpretation/schema.js';
import { downloadBlob, downloadText } from './download.js';
import { rowsToCsv, type TableColumn } from './table-sort.js';
import { LOCALE_LABELS, isLocale, useLocale } from './locale.js';
import { categoryLabel, compareSortKeys, labelForKey, sortKeyForKey, tagLabel, tierLabel } from './placement-label.js';
import { useMessages } from './messages.js';
import { corpusOverridesPanelMessages } from './CorpusOverridesPanel.messages.js';
import type { CorpusOverride } from '../sync/admin-client.js';
import type { CorpusCategory, CorpusEntry, CorpusTier, Locale } from '../interpretation/schema.js';
import { Badge } from './primitives/Badge.js';
import { Button } from './primitives/Button.js';
import { FilterSummary } from './primitives/FilterSummary.js';
import { EmptyState } from './primitives/EmptyState.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { PageHeader } from './PageHeader.js';
import { useRegisterExports } from './export-registry.js';
import { apiErrorText } from './api-error.js';

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

interface CorpusExportRow {
  readonly entry: CorpusEntry;
  readonly category: string;
  readonly overridden: boolean;
}

interface PendingReset {
  readonly key: string;
  readonly overrideId: string;
}

function splitTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
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
  const [newTag, setNewTag] = useState('');
  // The Edit button that opened the drawer: focus goes back to it when the drawer closes.
  const editTriggerRef = useRef<HTMLElement | null>(null);

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
      if (!cancelled) setLoadError(apiErrorText(error));
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
  const meaningOf = (key: string): string => labelForKey(key, uiLocale);
  const categoryLabelOf = (key: string): string => {
    const category = categoryOfKey(key);
    return category === undefined ? '—' : categoryLabel(category, uiLocale);
  };

  const startEdit = (entry: CorpusEntry, trigger: HTMLElement): void => {
    editTriggerRef.current = trigger;
    setNewTag('');
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
    setNewTag('');
    setSaveError(undefined);
  };

  const save = (): void => {
    if (editing === undefined) return;
    const identity = editing.key;
    setBusyKey(identity);
    setSaveError(undefined);
    const tags = splitTags(editing.tags);
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
        setSaveError(apiErrorText(cause));
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
        setSaveError(apiErrorText(cause));
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
        setLoadError(apiErrorText(cause));
      });
  };

  const exportFullJson = (): void => {
    if (data === undefined) return;
    downloadText(
      `astraya-corpus-${corpusLocale}.json`,
      JSON.stringify(data.corpus, null, 2),
      'application/json;charset=utf-8',
    );
  };

  const exportCsv = (): void => {
    if (data === undefined) return;
    const columns: readonly TableColumn<CorpusExportRow>[] = [
      { key: 'key', label: t.keyColumn, valueOf: (row) => row.entry.key },
      { key: 'category', label: t.categoryColumn, valueOf: (row) => row.category },
      { key: 'tier', label: t.tierColumn, valueOf: (row) => row.entry.tier },
      { key: 'tags', label: t.tagsColumn, valueOf: (row) => row.entry.tags.join(', ') },
      {
        key: 'status',
        label: t.statusColumn,
        valueOf: (row) => (row.overridden ? t.overriddenStatus : t.defaultStatus),
      },
      { key: 'text', label: t.textColumn, valueOf: (row) => row.entry.text },
    ];
    const rows = data.corpus.map((entry) => ({
      entry,
      category: categoryLabelOf(entry.key),
      overridden: overrideMap.has(entry.key),
    }));
    downloadText(`astraya-corpus-${corpusLocale}.csv`, rowsToCsv(columns, rows), 'text/csv;charset=utf-8');
  };

  // The one export control: the page header's Export menu (#887, #1335).
  useRegisterExports([
    { key: 'corpus-json', label: t.exportJson, run: exportFullJson, disabled: data === undefined },
    { key: 'corpus-csv', label: t.exportCsv, run: exportCsv, disabled: data === undefined },
    { key: 'corrections', label: t.exportCorrectionsOnly, run: exportCorrections },
  ]);

  const editTags = editing === undefined ? [] : splitTags(editing.tags);
  const addTag = (): void => {
    const tag = newTag.trim();
    if (editing === undefined || tag === '') return;
    if (!editTags.includes(tag)) setEditing({ ...editing, tags: [...editTags, tag].join(', ') });
    setNewTag('');
  };
  const removeTag = (tag: string): void => {
    if (editing === undefined) return;
    setEditing({ ...editing, tags: editTags.filter((existing) => existing !== tag).join(', ') });
  };

  const resetConfirmation =
    pendingReset === undefined ? null : (
      <StatusMessage kind="error">
        {t.resetWarning(`${labelForKey(pendingReset.key, uiLocale)} (${pendingReset.key})`)}{' '}
        <Button type="button" variant="danger" onClick={confirmReset}>
          {t.resetPermanentlyButton}
        </Button>{' '}
        <Button
          type="button"
          variant="quiet"
          onClick={() => {
            setPendingReset(undefined);
          }}
        >
          {t.cancelButton}
        </Button>
      </StatusMessage>
    );

  return (
    <main className="shell admin-view">
      <div className="admin-view-head">
        <PageHeader title={t.heading} />
        <p>{t.intro}</p>
      </div>
      <div className="admin-stack">
        {loadError !== undefined && <StatusMessage kind="error">{t.couldNotLoad(loadError)}</StatusMessage>}

        <div className="corpus-toolbar">
          <div className="corpus-toolbar-row">
            <div className="corpus-toolbar-search">
              <TextField label={t.searchLabel} value={search} onChange={setSearch} />
            </div>
            <Select
              label={t.corpusLocaleLabel}
              value={corpusLocale}
              options={CORPUS_LOCALES.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] }))}
              onChange={(value) => {
                if (isLocale(value)) setCorpusLocale(value);
              }}
            />
            <Checkbox label={t.overriddenOnlyLabel} checked={overriddenOnly} onChange={setOverriddenOnly} switchStyle />
          </div>
          <div className="corpus-toolbar-row">
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
          </div>
        </div>

        {saveError !== undefined && editing === undefined && (
          <StatusMessage kind="error">{t.saveFailed(saveError)}</StatusMessage>
        )}

        {pendingReset !== undefined && editing === undefined && resetConfirmation}

        <StagedDialog
          open={editing !== undefined}
          heading={editing === undefined ? t.editorHeading : labelForKey(editing.key, uiLocale)}
          closeLabel={t.closeEditorLabel}
          placement="right"
          dialogClassName="settings-card corpus-editor"
          onDiscard={cancelEdit}
          returnFocusTo={editTriggerRef}
          footer={
            editing === undefined ? null : (
              <>
                <div className="settings-card-footer-group">
                  {overrideMap.has(editing.key) && (
                    <Button type="button" variant="danger" disabled={busyKey === editing.key} onClick={requestReset}>
                      {t.resetButton}
                    </Button>
                  )}
                </div>
                <div className="settings-card-footer-group">
                  <Button type="button" variant="quiet" onClick={cancelEdit}>
                    {t.cancelButton}
                  </Button>
                  <Button variant="primary" type="button" disabled={busyKey === editing.key} onClick={save}>
                    {busyKey === editing.key ? t.savingLabel : t.saveButton}
                  </Button>
                </div>
              </>
            )
          }
        >
          {editing !== undefined && (
            <form
              className="corpus-editor-form"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              {saveError !== undefined && <StatusMessage kind="error">{t.saveFailed(saveError)}</StatusMessage>}
              {pendingReset !== undefined && resetConfirmation}
              <dl className="corpus-editor-identity">
                <div>
                  <dt>{t.keyColumn}</dt>
                  <dd>
                    <strong>{labelForKey(editing.key, uiLocale)}</strong>{' '}
                    <code className="entry-key">{editing.key}</code>
                  </dd>
                </div>
                <div>
                  <dt>{t.categoryColumn}</dt>
                  <dd>{categoryLabelOf(editing.key)}</dd>
                </div>
              </dl>
              <div className="corpus-editor-text">
                <TextAreaField
                  label={t.textLabel}
                  rows={12}
                  value={editing.text}
                  onChange={(value) => {
                    setEditing({ ...editing, text: value });
                  }}
                />
              </div>
              <Select
                label={t.tierFieldLabel}
                value={editing.tier}
                options={CORPUS_TIERS.map((tier) => ({ value: tier, label: tier }))}
                onChange={(value) => {
                  if (isCorpusTier(value)) setEditing({ ...editing, tier: value });
                }}
              />
              <fieldset className="field-group corpus-tags">
                <legend>{t.tagsFieldLabel}</legend>
                {editTags.length > 0 && (
                  <ul className="corpus-tag-chips">
                    {editTags.map((tag) => (
                      <li key={tag} className="corpus-tag-chip">
                        <span>{tag}</span>
                        <Button
                          variant="quiet"
                          size="compact"
                          aria-label={t.removeTagLabel(tag)}
                          onClick={() => {
                            removeTag(tag);
                          }}
                        >
                          ×
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="corpus-tag-add">
                  <TextField
                    label={t.addTagLabel}
                    value={newTag}
                    onChange={setNewTag}
                    inputProps={{
                      onKeyDown: (event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          addTag();
                        }
                      },
                    }}
                  />
                  <Button type="button" variant="quiet" disabled={newTag.trim() === ''} onClick={addTag}>
                    {t.addTagButton}
                  </Button>
                </div>
              </fieldset>
            </form>
          )}
        </StagedDialog>

        {data === undefined ? (
          <StatusMessage kind="loading">{t.loadingCorpus}</StatusMessage>
        ) : (
          <>
            <h2 className="sr-only">{t.entriesHeading}</h2>
            {filtered.length === 0 ? (
              <EmptyState message={t.noResults} />
            ) : (
              <ul className="corpus-entry-list">
                {visible.map((entry) => {
                  const overridden = overrideMap.has(entry.key);
                  return (
                    <li
                      key={entry.key}
                      className={overridden ? 'corpus-entry corpus-entry-overridden' : 'corpus-entry'}
                      data-overridden={overridden ? 'true' : 'false'}
                    >
                      <div className="corpus-entry-head">
                        {meaningOf(entry.key) !== entry.key && (
                          <h3 className="corpus-entry-meaning">
                            <span className="entry-meaning">{meaningOf(entry.key)}</span>
                          </h3>
                        )}
                        <code className="corpus-entry-key">{entry.key}</code>
                        <span className="corpus-entry-tags">
                          <Badge>{categoryLabelOf(entry.key)}</Badge>
                          <Badge>{tierLabel(entry.tier, uiLocale)}</Badge>
                          {overridden && <Badge tone="accent">{t.overriddenStatus}</Badge>}
                        </span>
                        <span className="corpus-entry-actions">
                          <Button
                            variant="quiet"
                            size="compact"
                            disabled={busyKey === entry.key}
                            busy={busyKey === entry.key}
                            busyLabel={t.savingLabel}
                            onClick={(event) => {
                              startEdit(entry, event.currentTarget);
                            }}
                          >
                            {t.editButton}
                          </Button>
                          {overridden && (
                            <Button
                              variant="danger"
                              size="compact"
                              disabled={busyKey === entry.key}
                              onClick={() => {
                                const override = overrideMap.get(entry.key);
                                if (override !== undefined)
                                  setPendingReset({ key: entry.key, overrideId: override.id });
                              }}
                            >
                              {t.resetButton}
                            </Button>
                          )}
                        </span>
                      </div>
                      <p className="corpus-entry-text">{entry.text}</p>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="corpus-footer">
              <FilterSummary summary={t.resultCount(String(visible.length), String(filtered.length))} />
              {visible.length < filtered.length && (
                <Button
                  variant="quiet"
                  onClick={() => {
                    setPage((current) => current + 1);
                  }}
                >
                  {t.loadMoreButton}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
