/**
 * Pinning for Event search results (#1061, slice 2): a Pin toggle on each result and a list of pinned events.
 */
/**
 * @module EventPins
 * @purpose Renders the per-result Pin toggle and the Pinned events list of Event search, backed by the account op-log.
 * @conventions A pin id is derived from the result's identity, so pinning is idempotent and unpinning then pinning again restores the same entity; unpin is a delete with Undo (no erase: a sky event holds no personal data); store refusals are mapped to wording here; both parts render nothing or an unavailable note until the store has opened.
 * @exports PinButton, PinnedEvents
 */
import { useEffect, useState } from 'react';
import type { EventSearchResult } from '../domain/event-search.js';
import { derivedPinId } from '../domain/id.js';
import {
  PIN_ENTITY,
  PinRefusedError,
  pinCreate,
  pinIdentity,
  pinTargetOf,
  sortedPins,
  type Pin,
} from '../store/pins.js';
import type { Store } from '../store/store.js';
import { eventPinsMessages } from './EventPins.messages.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { EmptyState } from './primitives/EmptyState.js';
import { Notice } from './primitives/Notice.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useOptionalStore, useStoreState } from './store-context.js';

function useFailureText(): (cause: unknown) => string {
  const t = useMessages(eventPinsMessages);
  return (cause) =>
    cause instanceof PinRefusedError
      ? t.invalidPin
      : `${t.pinFailed} ${cause instanceof Error ? cause.message : String(cause)}`;
}

/** The Pin toggle for one result. Renders nothing until the store has opened. */
export function PinButton({ result }: { readonly result: EventSearchResult }): React.JSX.Element | null {
  const store = useOptionalStore();
  return store === undefined ? null : <Toggle store={store} result={result} />;
}

function Toggle({ store, result }: { readonly store: Store; readonly result: EventSearchResult }): React.JSX.Element {
  const t = useMessages(eventPinsMessages);
  const failureText = useFailureText();
  const state = useStoreState();
  const [id, setId] = useState<string>();
  const [error, setError] = useState<string>();
  const target = pinTargetOf(result);
  const identity = pinIdentity(target);

  useEffect(() => {
    let current = true;
    void derivedPinId(identity).then((derived) => {
      if (current) setId(derived);
    });
    return () => {
      current = false;
    };
  }, [identity]);

  const pinned = id !== undefined && state.pins.has(id);
  const toggle = (): void => {
    if (id === undefined) return;
    setError(undefined);
    const done = state.deleted.pins.has(id)
      ? store.restore(PIN_ENTITY, id)
      : pinned
        ? store.remove(PIN_ENTITY, id)
        : store.mutate([pinCreate(id, target)]);
    done.catch((cause: unknown) => {
      setError(failureText(cause));
    });
  };

  return (
    <>
      <Button
        variant="quiet"
        size="compact"
        aria-pressed={pinned}
        aria-label={(pinned ? t.unpinLabel : t.pinLabel)(result.label)}
        disabled={id === undefined || !store.writable}
        onClick={toggle}
      >
        {pinned ? t.unpin : t.pin}
      </Button>
      {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
    </>
  );
}

/** The Pinned events list, in the style of the Saved queries panel. */
export function PinnedEvents(): React.JSX.Element {
  const store = useOptionalStore();
  const t = useMessages(eventPinsMessages);
  return (
    <section className="tool-card saved-queries" aria-labelledby="pinned-events-heading">
      <h2 id="pinned-events-heading">{t.heading}</h2>
      <p className="hint">{t.scopeNote}</p>
      {store === undefined ? <StatusMessage kind="loading">{t.unavailable}</StatusMessage> : <List store={store} />}
    </section>
  );
}

function instantText(at: number): string {
  return new Date(at * 1000).toISOString().replace('.000Z', 'Z');
}

function List({ store }: { readonly store: Store }): React.JSX.Element {
  const t = useMessages(eventPinsMessages);
  const failureText = useFailureText();
  const state = useStoreState();
  const [lastUnpinned, setLastUnpinned] = useState<Pin>();
  const [error, setError] = useState<string>();
  const pins = sortedPins(state.pins);
  const name = (pin: Pin): string => (pin.status === 'ready' ? pin.target.label : t.unreadablePin);

  const unpin = (pin: Pin): void => {
    setError(undefined);
    store
      .remove(PIN_ENTITY, pin.id)
      .then(() => {
        setLastUnpinned(pin);
      })
      .catch((cause: unknown) => {
        setError(failureText(cause));
      });
  };

  const restore = (pin: Pin): void => {
    setError(undefined);
    store
      .restore(PIN_ENTITY, pin.id)
      .then(() => {
        setLastUnpinned(undefined);
      })
      .catch((cause: unknown) => {
        setError(failureText(cause));
      });
  };

  return (
    <>
      {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
      {error === undefined && lastUnpinned !== undefined && (
        <StatusMessage kind="success">
          {t.unpinned(name(lastUnpinned))}{' '}
          <Button
            variant="quiet"
            size="compact"
            onClick={() => {
              restore(lastUnpinned);
            }}
          >
            {t.undo}
          </Button>
        </StatusMessage>
      )}
      {pins.length === 0 ? (
        <EmptyState message={t.empty} />
      ) : (
        <ul className="people saved-query-list">
          {pins.map((pin) => (
            <li key={pin.id}>
              <span className="person">
                <span className="name">{name(pin)}</span>
                {pin.status === 'ready' ? (
                  <span className="summary">{instantText(pin.target.at)}</span>
                ) : (
                  <Notice className="summary">{t.unreadable[pin.reason]}</Notice>
                )}
              </span>
              <Button
                variant="quiet"
                aria-label={t.unpinLabel(name(pin))}
                disabled={!store.writable}
                onClick={() => {
                  unpin(pin);
                }}
              >
                {t.unpin}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
