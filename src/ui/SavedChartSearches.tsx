/**
 * @module SavedChartSearches
 * @purpose Saved chart queries on People (#1405, #1731): `SaveChartSearchForm` saves the current conditions under a name from inside the query panel, and `SavedChartSearchList` lists saved searches in the Saved searches dropdown, reopens one into the query, and deletes with Undo.
 * @conventions Thin: rules (validation, name cap, sort order, unreadable entries) live in `store/chart-searches` and `chart-search-draft`; writes go through `Store.mutate`/`remove`/`restore` so they reach the op-log. No rename in v1. Opening loads operator and conditions only and leaves the as-of date alone; it never runs the search. A refused save keeps the draft and shows the refusal code as copy. An unreadable or incomplete search is listed with its reason and can only be deleted. Every control is disabled while the store is not writable (the panel states the reason once). With nothing saved, the list says so in one short line rather than an empty-state box (#1731).
 * @exports SaveChartSearchForm, SavedChartSearchList
 */
import { useState } from 'react';
import { newId } from '../domain/id.js';
import {
  CHART_SEARCH_ENTITY,
  ChartSearchRefusedError,
  chartSearchCreate,
  sortedChartSearches,
  type SavedChartSearch,
} from '../store/chart-searches.js';
import { SAVED_QUERY_NAME_MAX_CHARACTERS, isSavedQueryNameTooLong } from '../store/saved-queries.js';
import { errorDetail } from './api-error.js';
import { chartSearchPanelMessages } from './ChartSearchPanel.messages.js';
import { draftFromDefinition, definitionFromDraft, initialDraft, type ChartSearchDraft } from './chart-search-draft.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { Notice } from './primitives/Notice.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { TextField } from './primitives/TextField.js';
import { useStore, useStoreState } from './store-context.js';

type Messages = (typeof chartSearchPanelMessages)['en'];

const MAX = String(SAVED_QUERY_NAME_MAX_CHARACTERS);

/** The copy for a failed save, open or delete: a refusal says why, anything else says it did not save. */
function failureText(cause: unknown, t: Messages): string {
  if (cause instanceof ChartSearchRefusedError) {
    return cause.refusal === 'name-too-long' ? t.nameTooLong(MAX) : t.invalidSearch;
  }
  return `${t.saveFailed} ${errorDetail(cause)}`;
}

/** Save search, inside the query panel: the name field and the button (#1731). */
export function SaveChartSearchForm({ draft }: { readonly draft: ChartSearchDraft }): React.JSX.Element {
  const store = useStore();
  const t = useMessages(chartSearchPanelMessages);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const writable = store.writable;
  const nameError = isSavedQueryNameTooLong(name) ? t.nameTooLong(MAX) : undefined;

  const save = (): void => {
    setError(undefined);
    setMessage(undefined);
    const definition = definitionFromDraft(draft);
    if (!definition.ok) {
      setError(failureText(new ChartSearchRefusedError('invalid'), t));
      return;
    }
    const trimmed = name.trim();
    void store
      .mutate(chartSearchCreate(newId('s'), trimmed, definition.value))
      .then(() => {
        setName('');
        setMessage(t.saved(trimmed === '' ? t.unnamed : trimmed));
      })
      .catch((cause: unknown) => {
        setError(failureText(cause, t));
      });
  };

  return (
    <div className="saved" role="group" aria-label={t.saveSearch}>
      <div className="save-row">
        <TextField
          label={t.nameLabel}
          value={name}
          onChange={setName}
          help={t.nameHelp(MAX)}
          error={nameError}
          autoComplete="off"
          disabled={!writable}
        />
        <Button
          shape="capsule"
          className="primitive-button-form-action"
          variant="quiet"
          disabled={!writable || nameError !== undefined}
          onClick={save}
        >
          {t.saveSearch}
        </Button>
      </div>
      {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
      {error === undefined && message !== undefined && <StatusMessage kind="success">{message}</StatusMessage>}
    </div>
  );
}

export interface SavedChartSearchListProps {
  /** The search being built, or `undefined` before its first edit: its as-of date is kept when a saved search is reopened. */
  readonly draft: ChartSearchDraft | undefined;
  /** Replace the query's conditions with a saved search's; never runs it. */
  readonly onOpen: (draft: ChartSearchDraft) => void;
}

/** The saved searches, in the Saved searches dropdown (#1731): reopen, delete with Undo, unreadable entries with their reason. */
export function SavedChartSearchList({ draft, onOpen }: SavedChartSearchListProps): React.JSX.Element {
  const store = useStore();
  const state = useStoreState();
  const t = useMessages(chartSearchPanelMessages);
  const [locale] = useLocale();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [lastDeleted, setLastDeleted] = useState<SavedChartSearch>();
  const writable = store.writable;

  const searches = sortedChartSearches(state.chartSearches, locale);
  const label = (search: SavedChartSearch): string => (search.name === '' ? t.unnamed : search.name);
  const fail = (cause: unknown): void => {
    setMessage(undefined);
    setError(failureText(cause, t));
  };

  const open = (search: SavedChartSearch): void => {
    if (search.status !== 'ready') return;
    const opened = draftFromDefinition(search.definition, (draft ?? initialDraft()).asOf);
    if (!opened.ok) {
      setMessage(undefined);
      setError(t.unreadable.invalid);
      return;
    }
    setError(undefined);
    setLastDeleted(undefined);
    setMessage(t.opened(label(search)));
    onOpen(opened.value);
  };

  const remove = (search: SavedChartSearch): void => {
    setError(undefined);
    void store
      .remove(CHART_SEARCH_ENTITY, search.id)
      .then(() => {
        setLastDeleted(search);
        setMessage(t.deleted(label(search)));
      })
      .catch(fail);
  };

  const undo = (search: SavedChartSearch): void => {
    setError(undefined);
    void store
      .restore(CHART_SEARCH_ENTITY, search.id)
      .then(() => {
        setLastDeleted(undefined);
        setMessage(undefined);
      })
      .catch(fail);
  };

  return (
    <div className="saved-search-list">
      {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
      {error === undefined && message !== undefined && (
        <StatusMessage kind="success">
          {message}{' '}
          {lastDeleted !== undefined && (
            <Button
              variant="quiet"
              size="compact"
              onClick={() => {
                undo(lastDeleted);
              }}
            >
              {t.undo}
            </Button>
          )}
        </StatusMessage>
      )}
      {searches.length === 0 ? (
        <p className="hint">{t.noSavedShort}</p>
      ) : (
        <ul className="people saved-query-list">
          {searches.map((search) => (
            <li key={search.id}>
              <span className="person">
                <span className={search.name === '' ? 'name unnamed' : 'name'}>{label(search)}</span>
                {search.status === 'ready' ? (
                  <span className="summary">
                    {t.savedSummary(
                      String(search.definition.conditions.length),
                      t.operator[search.definition.operator === 'and' ? 'all' : 'any'],
                    )}
                  </span>
                ) : (
                  <Notice className="summary">{t.unreadable[search.reason]}</Notice>
                )}
              </span>
              {search.status === 'ready' && (
                <Button
                  variant="quiet"
                  size="compact"
                  shape="capsule"
                  aria-label={t.reopenLabel(label(search))}
                  onClick={() => {
                    open(search);
                  }}
                >
                  {t.reopen}
                </Button>
              )}
              <Button
                variant="quiet"
                size="compact"
                shape="capsule"
                aria-label={t.deleteLabel(label(search))}
                disabled={!writable}
                onClick={() => {
                  remove(search);
                }}
              >
                {t.delete}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
