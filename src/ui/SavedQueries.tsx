/**
 * Saved event-search queries (#1061): save the form's parameters under a name, list them, reopen one into the form,
 * delete with Undo, and erase permanently. Parameters only: no results are stored, and opening a query never runs it.
 */
/**
 * @module SavedQueries
 * @purpose Renders the Saved queries panel of Event search: name and save the current parameters, list saved queries, reopen one into the form, delete with Undo, and erase permanently.
 * @conventions Thin: every rule (validation, folding, the name cap, sort order) lives in `store/saved-queries`; writes go through `Store.mutate`/`remove`/`restore`/`purge` so they reach the op-log and sync; the panel renders nothing interactive until the store is open; an unreadable or incomplete query is listed with its reason and can only be deleted, never defaulted; opening fills the form and leaves running the search to the explicit button.
 * @exports SavedQueries
 */
import { useState } from 'react';
import { newId } from '../domain/id.js';
import {
  SAVED_QUERY_ENTITY,
  SAVED_QUERY_NAME_MAX_CHARACTERS,
  SavedQueryRefusedError,
  isSavedQueryNameTooLong,
  savedQueryCreate,
  sortedSavedQueries,
  type EventSearchQueryParameters,
  type SavedQuery,
} from '../store/saved-queries.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { EmptyState } from './primitives/EmptyState.js';
import { Notice } from './primitives/Notice.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { TextField } from './primitives/TextField.js';
import { savedQueriesMessages } from './SavedQueries.messages.js';
import { useOptionalStore, useStoreState } from './store-context.js';
import type { Store } from '../store/store.js';

export interface SavedQueriesProps {
  /** The form's current parameters: what Save query stores. */
  readonly parameters: EventSearchQueryParameters;
  /** Fill the form from a saved query. */
  readonly onOpen: (parameters: EventSearchQueryParameters) => void;
  /** Labels for the event kinds, so a row can summarise a query in the reader's language. */
  readonly kindLabels: Readonly<Record<EventSearchQueryParameters['kinds'][number], string>>;
}

export function SavedQueries(props: SavedQueriesProps): React.JSX.Element {
  const store = useOptionalStore();
  const t = useMessages(savedQueriesMessages);
  return (
    <section className="tool-card saved-queries" aria-labelledby="saved-queries-heading">
      <h2 id="saved-queries-heading">{t.heading}</h2>
      <p className="hint">{t.scopeNote}</p>
      {store === undefined ? (
        <StatusMessage kind="loading">{t.unavailable}</StatusMessage>
      ) : (
        <Panel store={store} {...props} />
      )}
    </section>
  );
}

function Panel({
  store,
  parameters,
  onOpen,
  kindLabels,
}: SavedQueriesProps & { readonly store: Store }): React.JSX.Element {
  const t = useMessages(savedQueriesMessages);
  const [locale] = useLocale();
  const state = useStoreState();
  const [name, setName] = useState('');
  const [message, setMessage] = useState<React.ReactNode>();
  const [error, setError] = useState<string>();
  const [lastDeleted, setLastDeleted] = useState<SavedQuery>();
  const max = String(SAVED_QUERY_NAME_MAX_CHARACTERS);

  const queries = sortedSavedQueries(state.savedQueries, locale);
  const deleted = sortedSavedQueries(state.deleted.savedQueries, locale);
  const nameError = isSavedQueryNameTooLong(name) ? t.nameTooLong(max) : undefined;
  const label = (query: SavedQuery): string => (query.name === '' ? t.unnamed : query.name);

  const fail = (cause: unknown): void => {
    setMessage(undefined);
    if (cause instanceof SavedQueryRefusedError) {
      setError(cause.refusal === 'name-too-long' ? t.nameTooLong(max) : t.invalidQuery);
    } else {
      setError(`${t.saveFailed} ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  const save = (): void => {
    setError(undefined);
    const trimmed = name.trim();
    void store
      .mutate(
        savedQueryCreate(newId('q'), trimmed, {
          tool: 'event-search',
          version: 1,
          parameters: { ...parameters, kinds: [...parameters.kinds] },
        }),
      )
      .then(() => {
        setName('');
        setLastDeleted(undefined);
        setMessage(t.saved(trimmed === '' ? t.unnamed : trimmed));
      })
      .catch(fail);
  };

  const remove = (query: SavedQuery): void => {
    setError(undefined);
    void store
      .remove(SAVED_QUERY_ENTITY, query.id)
      .then(() => {
        setLastDeleted(query);
        setMessage(t.deleted(label(query)));
      })
      .catch(fail);
  };

  const restore = (query: SavedQuery): void => {
    setError(undefined);
    void store
      .restore(SAVED_QUERY_ENTITY, query.id)
      .then(() => {
        setLastDeleted(undefined);
        setMessage(undefined);
      })
      .catch(fail);
  };

  const erase = (query: SavedQuery): void => {
    // Confirmed before the store call: an erase has no undo, unlike every other action here.
    if (!window.confirm(t.confirmErase(label(query)))) return;
    setError(undefined);
    void store
      .purge(SAVED_QUERY_ENTITY, query.id)
      .then(() => {
        setLastDeleted(undefined);
        setMessage(undefined);
      })
      .catch(fail);
  };

  const open = (query: SavedQuery): void => {
    if (query.status !== 'ready') return;
    onOpen(query.definition.parameters);
    setError(undefined);
    setMessage(t.opened(label(query)));
  };

  return (
    <>
      <TextField
        label={t.nameLabel}
        value={name}
        onChange={setName}
        help={t.nameHelp(max)}
        error={nameError}
        autoComplete="off"
      />
      <div className="tool-actions">
        <Button variant="primary" disabled={!store.writable || nameError !== undefined} onClick={save}>
          {t.saveButton}
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
                restore(lastDeleted);
              }}
            >
              {t.undo}
            </Button>
          )}
        </StatusMessage>
      )}

      {queries.length === 0 ? (
        <EmptyState message={t.empty} />
      ) : (
        <ul className="people saved-query-list">
          {queries.map((query) => (
            <li key={query.id}>
              <span className="person">
                <span className={query.name === '' ? 'name unnamed' : 'name'}>{label(query)}</span>
                {query.status === 'ready' ? (
                  <span className="summary">
                    {t.summary(
                      query.definition.parameters.from,
                      query.definition.parameters.to,
                      query.definition.parameters.kinds.map((kind) => kindLabels[kind]).join(', '),
                    )}
                  </span>
                ) : (
                  <Notice className="summary">{t.unreadable[query.reason]}</Notice>
                )}
              </span>
              {query.status === 'ready' && (
                <Button
                  variant="quiet"
                  aria-label={t.openLabel(label(query))}
                  onClick={() => {
                    open(query);
                  }}
                >
                  {t.open}
                </Button>
              )}
              <Button
                variant="quiet"
                aria-label={t.deleteLabel(label(query))}
                disabled={!store.writable}
                onClick={() => {
                  remove(query);
                }}
              >
                {t.delete}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {deleted.length > 0 && (
        <div className="deleted">
          <h3>{t.deletedHeading}</h3>
          <ul className="people saved-query-list">
            {deleted.map((query) => (
              <li key={query.id}>
                <span className="person">
                  <span className="name">{label(query)}</span>
                </span>
                <Button
                  variant="quiet"
                  aria-label={t.restoreLabel(label(query))}
                  disabled={!store.writable}
                  onClick={() => {
                    restore(query);
                  }}
                >
                  {t.restore}
                </Button>
                <Button
                  variant="danger"
                  aria-label={t.eraseLabel(label(query))}
                  disabled={!store.writable}
                  onClick={() => {
                    erase(query);
                  }}
                >
                  {t.erase}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
