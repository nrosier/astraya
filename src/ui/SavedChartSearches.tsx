/**
 * @module SavedChartSearches
 * @purpose Saved searches section of the "Search charts" card (#1405): save the current conditions under a name, list saved searches, reopen one into the card, delete with Undo.
 * @conventions Thin: rules (validation, name cap, sort order, unreadable entries) live in `store/chart-searches` and `chart-search-draft`; writes go through `Store.mutate`/`remove`/`restore` so they reach the op-log. No rename in v1. Opening loads operator and conditions only and leaves the as-of date alone; it never runs the search. A refused save keeps the draft and shows the refusal code as copy. An unreadable or incomplete search is listed with its reason and can only be deleted. Every control is disabled while the store is not writable (the card states the reason once).
 * @exports SavedChartSearches
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
import { draftFromDefinition, definitionFromDraft, type ChartSearchDraft } from './chart-search-draft.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { EmptyState } from './primitives/EmptyState.js';
import { Notice } from './primitives/Notice.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { TextField } from './primitives/TextField.js';
import { useStore, useStoreState } from './store-context.js';

export interface SavedChartSearchesProps {
  /** The search being built: what Save search stores (operator and conditions, never the as-of date). */
  readonly draft: ChartSearchDraft;
  /** Replace the card's conditions with a saved search's; the as-of date in `draft.asOf` is kept. */
  readonly onOpen: (draft: ChartSearchDraft) => void;
}

export function SavedChartSearches({ draft, onOpen }: SavedChartSearchesProps): React.JSX.Element {
  const store = useStore();
  const state = useStoreState();
  const t = useMessages(chartSearchPanelMessages);
  const [locale] = useLocale();
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [lastDeleted, setLastDeleted] = useState<SavedChartSearch>();
  const max = String(SAVED_QUERY_NAME_MAX_CHARACTERS);
  const writable = store.writable;

  const searches = sortedChartSearches(state.chartSearches, locale);
  const nameError = isSavedQueryNameTooLong(name) ? t.nameTooLong(max) : undefined;
  const label = (search: SavedChartSearch): string => (search.name === '' ? t.unnamed : search.name);

  const fail = (cause: unknown): void => {
    setMessage(undefined);
    if (cause instanceof ChartSearchRefusedError) {
      setError(cause.refusal === 'name-too-long' ? t.nameTooLong(max) : t.invalidSearch);
    } else {
      setError(`${t.saveFailed} ${errorDetail(cause)}`);
    }
  };

  const save = (): void => {
    setError(undefined);
    const definition = definitionFromDraft(draft);
    if (!definition.ok) {
      fail(new ChartSearchRefusedError('invalid'));
      return;
    }
    const trimmed = name.trim();
    void store
      .mutate(chartSearchCreate(newId('s'), trimmed, definition.value))
      .then(() => {
        setName('');
        setLastDeleted(undefined);
        setMessage(t.saved(trimmed === '' ? t.unnamed : trimmed));
      })
      .catch(fail);
  };

  const open = (search: SavedChartSearch): void => {
    if (search.status !== 'ready') return;
    const opened = draftFromDefinition(search.definition, draft.asOf);
    if (!opened.ok) {
      setMessage(undefined);
      setError(t.unreadable.invalid);
      return;
    }
    onOpen(opened.value);
    setError(undefined);
    setLastDeleted(undefined);
    setMessage(t.opened(label(search)));
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
    <div className="saved" role="group" aria-labelledby="chart-search-saved-heading">
      <h3 id="chart-search-saved-heading">{t.savedHeading}</h3>
      <div className="save-row">
        <TextField
          label={t.nameLabel}
          value={name}
          onChange={setName}
          help={t.nameHelp(max)}
          error={nameError}
          autoComplete="off"
          disabled={!writable}
        />
        <Button variant="quiet" disabled={!writable || nameError !== undefined} onClick={save}>
          {t.saveSearch}
        </Button>
      </div>

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
        <EmptyState message={t.savedEmpty} />
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
