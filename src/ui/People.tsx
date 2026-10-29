/**
 * The person selector and creation flow (#82).
 *
 * A person is the primary entity: charts belong to people, not the other way round. So this
 * is the app's front door once there is anything stored, and the thing it must never do is
 * make a person's birth data look more complete than it is — a name with no birth moment is
 * listed as exactly that, because a chart cannot be cast from it.
 */
/**
 * @module People
 * @purpose Renders the People list screen: the app's landing page, where people are created, selected, deleted (tombstoned) and restored.
 * @conventions A person is the primary entity (charts belong to people, not vice versa); a person with no birth moment is listed as exactly that rather than hidden or faked complete; deletes are tombstones, shown under "Deleted" with a restore option until purged. Text comes from co-located `People.messages.ts` via `useMessages()`.
 * @exports People
 */
import { personHref } from './route.js';
import { PageHeader } from './PageHeader.js';
import { useState } from 'react';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { newId } from '../domain/id.js';
import { newPersonCalculationMutations } from '../domain/person.js';
import { useDefaultCalculationProfile } from './default-calculation-profile.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { caveated, ordered, summary } from './people-list.js';
import { peopleMessages } from './People.messages.js';
import { useStore, useStoreState } from './store-context.js';
import { trace } from '../trace.js';
import { EmptyState } from './primitives/EmptyState.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useRulershipChoice } from './rulership-setting.js';

export function People(): React.JSX.Element {
  const store = useStore();
  const state = useStoreState();
  const [locale] = useLocale();
  const t = useMessages(peopleMessages);
  const [defaultProfile] = useDefaultCalculationProfile();
  const [defaultRulership] = useRulershipChoice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const people = ordered(state.people);
  trace('People', 'render', { deviceId: store.deviceId, people: people.length });

  const create = (): void => {
    setBusy(true);
    setError(undefined);
    const id = newId('p');
    // Created with nothing but an id, then edited. The alternative — a modal that refuses to
    // create until every field is valid — loses whatever the user had typed if they close it,
    // and there is nothing wrong with a person whose birth data has not arrived yet.
    // It also receives a copy of the default calculation profile (#806), so later changes to the default leave this
    // person's charts as they were; one batch, so the person never exists half-configured.
    void store
      .mutate([
        { entity: 'person', entityId: id, field: 'displayName', value: '' },
        ...newPersonCalculationMutations(id, defaultProfile?.settings ?? DEFAULT_EXTENDED_SETTINGS, defaultRulership),
      ])
      .then(() => {
        window.location.hash = personHref(id);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const restore = (id: string): void => {
    void store.restore('person', id).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  };

  const purge = (id: string, name: string): void => {
    // Confirmed here rather than left to a second screen: purge has no undo, unlike every
    // other action this page offers, so the warning has to land before the store call, not
    // instead of it.
    if (!window.confirm(t.confirmDelete(name))) return;
    void store.purge('person', id).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  };

  return (
    <main className="shell">
      <PageHeader title={t.heading} />
      <p className="tagline">{t.tagline}</p>

      {error !== undefined && (
        <StatusMessage kind="error">
          {t.saveFailed} {error}
        </StatusMessage>
      )}

      <p>
        <button type="button" onClick={create} disabled={busy}>
          {t.addPerson}
        </button>
      </p>

      {people.length === 0 ? (
        <EmptyState message={t.empty} />
      ) : (
        <ul className="people">
          {people.map((person) => (
            <li key={person.id}>
              <a className="person" href={personHref(person.id)}>
                <span className={person.displayName === '' ? 'name unnamed' : 'name'}>
                  {person.displayName === '' ? t.unnamed : person.displayName}
                </span>
                <span className={person.moment === undefined ? 'summary incomplete' : 'summary'}>
                  {summary(person, locale)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {people.some(caveated) && (
        <p className="hint">
          {t.hintPrefix} <code>?</code> {t.hintSuffix}
        </p>
      )}

      {state.deleted.people.size > 0 && (
        <section className="deleted">
          <h2>{t.deletedHeading}</h2>
          {/* Deletes are tombstones, so "deleted" is a state a person can come back from.
              Showing them is the whole benefit of not having actually removed anything —
              and the fold materialises them, so each row can say who it is. */}
          <ul className="people">
            {ordered(state.deleted.people).map((person) => (
              <li key={person.id}>
                <span className="person">
                  <span className="name">{person.displayName === '' ? t.unnamed : person.displayName}</span>
                  <span className="summary">{summary(person, locale)}</span>
                </span>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    restore(person.id);
                  }}
                >
                  {t.restore}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    purge(person.id, person.displayName === '' ? t.unnamedPersonPlaceholder : person.displayName);
                  }}
                >
                  {t.deletePermanently}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
