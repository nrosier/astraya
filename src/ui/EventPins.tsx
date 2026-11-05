/**
 * Pinning for Event search results (#1061, slice 2): a Pin toggle on each result and a list of pinned events.
 */
/**
 * @module EventPins
 * @purpose Renders the per-result Pin toggle, the Pinned events list and each pin annotation box of Event search, backed by the account op-log.
 * @conventions A pin id is derived from the result's identity, so pinning is idempotent and unpinning then pinning again restores the same entity; unpin is a delete with Undo (no erase: a sky event holds no personal data); store refusals are mapped to wording here; an annotation is saved as one new revision that names every leaf it saw as a parent, so forks stay visible and resolvable; all parts render nothing or an unavailable note until the store has opened.
 * @exports PinButton, PinnedEvents
 */
import { useEffect, useState } from 'react';
import type { EventSearchResult } from '../domain/event-search.js';
import { derivedPinId, newId } from '../domain/id.js';
import { ANNOTATION_MAX_CHARACTERS, AnnotationRefusedError, annotationRevision } from '../store/annotations.js';
import { isNoteTooLong, revisionParents, type Note } from '../store/notes.js';
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
import { NoteForks } from './NoteForks.js';
import { TextAreaField } from './primitives/TextAreaField.js';
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
    const done = pinned ? store.remove(PIN_ENTITY, id) : store.mutate(pinCreate(id, target));
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
                {pin.status === 'ready' && (
                  <PinAnnotation
                    store={store}
                    pinId={pin.id}
                    label={pin.target.label}
                    note={state.annotations.get(pin.id)}
                  />
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

/** The text box for one pin's annotation. The draft is local until Save writes one new revision. */
function PinAnnotation({
  store,
  pinId,
  label,
  note,
}: {
  readonly store: Store;
  readonly pinId: string;
  readonly label: string;
  readonly note: Note | undefined;
}): React.JSX.Element {
  const t = useMessages(eventPinsMessages);
  // The draft remembers the leaves the box showed when typing began, so a version that syncs in meanwhile stays a
  // visible fork instead of being closed off by this save.
  const [draft, setDraft] = useState<{ readonly text: string; readonly parents: readonly string[] }>();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ readonly kind: 'error' | 'success'; readonly text: string }>();
  const max = String(ANNOTATION_MAX_CHARACTERS);
  const saved = note?.content ?? '';
  // An unedited box follows the folded head, so a note synced from another device appears without a reload.
  const value = draft?.text ?? saved;
  const tooLong = isNoteTooLong(value);
  const dirty = draft !== undefined && draft.text !== saved;

  const save = (): void => {
    setStatus(undefined);
    if (draft === undefined || saving) return;
    setSaving(true);
    // Naming the leaves the box showed when typing began resolves the forks this save has seen.
    store
      .mutate([annotationRevision(pinId, newId('r'), value, draft.parents)])
      .then(() => {
        setSaving(false);
        setDraft(undefined);
        setStatus({ kind: 'success', text: t.annotationSaved });
      })
      .catch((cause: unknown) => {
        setSaving(false);
        const text =
          cause instanceof AnnotationRefusedError
            ? cause.refusal === 'too-long'
              ? t.annotationTooLong(max)
              : t.annotationInvalid
            : `${t.pinFailed} ${cause instanceof Error ? cause.message : String(cause)}`;
        setStatus({ kind: 'error', text });
      });
  };

  return (
    <>
      <TextAreaField
        label={t.annotationLabel(label)}
        value={value}
        onChange={(next) => {
          setDraft({ text: next, parents: draft?.parents ?? (note === undefined ? [] : revisionParents(note)) });
          setStatus(undefined);
        }}
        help={t.annotationHelp(max)}
        error={tooLong ? t.annotationTooLong(max) : undefined}
        rows={3}
        disabled={!store.writable}
      />
      {note !== undefined && <NoteForks forks={note.forks} />}
      <div className="tool-actions">
        <Button
          variant="primary"
          size="compact"
          disabled={!store.writable || !dirty || tooLong || saving}
          onClick={save}
        >
          {t.annotationSave}
        </Button>
      </div>
      {status !== undefined && <StatusMessage kind={status.kind}>{status.text}</StatusMessage>}
    </>
  );
}
