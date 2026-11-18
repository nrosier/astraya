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
 * @purpose Renders the People list screen: the app's landing page, where people are created, selected, deleted (tombstoned) and restored, with a toolbar above the one list (#1731): a quick name-and-place filter, the Chart query toggle that opens the collapsed query panel, and the Saved searches dropdown.
 * @conventions A person is the primary entity (charts belong to people, not vice versa); a person with no birth moment is listed as exactly that rather than hidden or faked complete; deletes are tombstones, shown under "Deleted" with a restore option until purged. A chart-query run filters the same list in place (matches, then a could-not-be-evaluated group with reasons), and the Chart query pill counts the conditions of the run that is filtering it; editing never runs the query. Everything that needs the chart-search code comes from one lazy chunk (`ChartSearchPanel.js`). Text comes from co-located `People.messages.ts` via `useMessages()`.
 * @exports People
 */
import { personHref, routeHref } from './route.js';
import { PageHeader } from './PageHeader.js';
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
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
import { appMessages } from './App.messages.js';
import { Button } from './primitives/Button.js';
import { EmptyState } from './primitives/EmptyState.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useRulershipChoice } from './rulership-setting.js';
import { clearNoteJournalsForPerson } from './use-note-autosave.js';
import { errorDetail } from './api-error.js';
import type { ChartSearch } from '../domain/chart-search.js';
import type { ChartSearchDraft } from './chart-search-draft.js';
import type { PersonRunResult } from './chart-search-run.js';
import { applyChartQuery, quickFilterPeople } from './people-query.js';
import { TextField } from './primitives/TextField.js';
import { useExclusiveOpen } from './use-exclusive-open.js';
import { useChartSearchRun } from './use-chart-search-run.js';

/**
 * The chart-search card is behind a dynamic import (#1405): its code and the chart-search run core
 * stay out of the eager bundle, so the People list costs a first-time visitor nothing extra. Same
 * shape as the lazy screens in App.tsx.
 */
const chartSearchChunk = () => import('./ChartSearchPanel.js');
const ChartSearchPanel = lazy(async () => ({ default: (await chartSearchChunk()).ChartSearchPanel }));
const ChartQueryStatus = lazy(async () => ({ default: (await chartSearchChunk()).ChartQueryStatus }));
const NotEvaluableList = lazy(async () => ({ default: (await chartSearchChunk()).NotEvaluableList }));
const SavedChartSearchList = lazy(async () => ({ default: (await chartSearchChunk()).SavedChartSearchList }));

/** A finished run and the search that produced it: what filters the list until Clear or Reset (#1731). */
interface AppliedQuery {
  readonly search: ChartSearch;
  readonly results: readonly PersonRunResult[];
}

export function People(): React.JSX.Element {
  const store = useStore();
  const state = useStoreState();
  const [locale] = useLocale();
  const t = useMessages(peopleMessages);
  const tApp = useMessages(appMessages);
  const [defaultProfile] = useDefaultCalculationProfile();
  const [defaultRulership] = useRulershipChoice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // The chart query's draft and run live here, so the page owns them (#1731). Empty until the lazy panel's first edit:
  // the panel builds the starting draft itself, so this file never loads the draft model eagerly.
  const [draft, setDraft] = useState<ChartSearchDraft | undefined>(undefined);
  const run = useChartSearchRun();
  const [quick, setQuick] = useState('');
  const [queryOpen, setQueryOpen] = useState(false);
  const [applied, setApplied] = useState<AppliedQuery>();
  // The search a run was started with, so the run's results are applied with the conditions that produced them.
  const pendingSearch = useRef<ChartSearch | undefined>(undefined);
  const saved = useExclusiveOpen<'saved'>('people-saved-searches');
  const queryToggleId = useId();

  // A run applies when it finishes, never while the query is edited; a failed run leaves the list unfiltered.
  useEffect(() => {
    const search = pendingSearch.current;
    setApplied(run.results === undefined || search === undefined ? undefined : { search, results: run.results });
  }, [run.results]);

  const startRun = (search: ChartSearch, asOf: string): void => {
    pendingSearch.current = search;
    run.run(search, asOf);
  };
  const reset = (): void => {
    setDraft(undefined);
    setApplied(undefined);
  };
  const openSaved = (opened: ChartSearchDraft): void => {
    setDraft(opened);
    setQueryOpen(true);
    saved.close();
  };

  const people = ordered(state.people);
  const filtered = quickFilterPeople(people, quick);
  const query = applied === undefined ? undefined : applyChartQuery(filtered, applied.results);
  const listed = query === undefined ? filtered : query.matches;
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
        setError(errorDetail(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const restore = (id: string): void => {
    void store.restore('person', id).catch((cause: unknown) => {
      setError(errorDetail(cause));
    });
  };

  const purge = (id: string, name: string): void => {
    // Confirmed here rather than left to a second screen: purge has no undo, unlike every
    // other action this page offers, so the warning has to land before the store call, not
    // instead of it.
    if (!window.confirm(t.confirmDelete(name))) return;
    // Pending note text goes with the person (#919): the journal holds plaintext until it commits.
    const rootIds = (store.state.consultationNotes.get(id) ?? []).map((note) => note.rootId);
    void store
      .purge('person', id)
      .then(() => {
        if (typeof localStorage !== 'undefined') clearNoteJournalsForPerson(localStorage, store.dbName, id, rootIds);
      })
      .catch((cause: unknown) => {
        setError(errorDetail(cause));
      });
  };

  return (
    <main className="shell">
      <PageHeader title={t.heading}>
        <Button
          variant="plain"
          type="button"
          shape="capsule"
          className="primitive-button-form-action"
          onClick={create}
          disabled={busy}
        >
          {t.addPerson}
        </Button>
      </PageHeader>
      <p className="tagline">{t.tagline}</p>

      {error !== undefined && (
        <StatusMessage kind="error">
          {t.saveFailed} {error}
        </StatusMessage>
      )}

      {/* The toolbar sits above the one list (#1731), and only when there is someone to find. */}
      {people.length > 0 && (
        <div className="people-toolbar" role="search" aria-label={t.toolbarLabel}>
          <div className="people-toolbar-filter">
            <TextField
              label={t.quickFilterLabel}
              hideLabel
              placeholder={t.quickFilterLabel}
              value={quick}
              onChange={setQuick}
              inputMode="search"
              autoComplete="off"
            />
          </div>
          <Button
            id={queryToggleId}
            size="compact"
            shape="capsule"
            aria-expanded={queryOpen}
            aria-controls="chart-query-panel"
            onClick={() => {
              setQueryOpen((open) => !open);
            }}
          >
            {applied === undefined ? t.chartQuery : t.chartQueryCount(String(applied.search.conditions.length))}
          </Button>
          <div
            className={saved.open === 'saved' ? 'people-saved-searches open' : 'people-saved-searches'}
            ref={saved.groupRef('saved')}
            onBlur={(event) => {
              saved.onGroupBlur('saved', event);
            }}
          >
            <Button
              ref={saved.buttonRef('saved')}
              size="compact"
              shape="capsule"
              aria-haspopup="dialog"
              aria-expanded={saved.open === 'saved'}
              aria-controls="people-saved-searches-card"
              onClick={() => {
                saved.toggle('saved');
              }}
            >
              {t.savedSearches}
            </Button>
            <div
              id="people-saved-searches-card"
              className="people-saved-searches-card"
              role="dialog"
              aria-label={t.savedSearches}
              hidden={saved.open !== 'saved'}
            >
              <Suspense fallback={<StatusMessage kind="loading">{tApp.loadingScreen}</StatusMessage>}>
                <SavedChartSearchList draft={draft} onOpen={openSaved} />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* The query panel opens between the toolbar and the list; it stays mounted while closed, so the draft survives. */}
      {people.length > 0 && (
        <div id="chart-query-panel" className="people-query-panel" hidden={!queryOpen}>
          <Suspense fallback={<StatusMessage kind="loading">{tApp.loadingScreen}</StatusMessage>}>
            <ChartSearchPanel
              draft={draft}
              onDraftChange={setDraft}
              runState={run.state}
              onRun={startRun}
              onReset={reset}
              labelledBy={queryToggleId}
            />
          </Suspense>
        </div>
      )}

      {applied !== undefined && query !== undefined && (
        <Suspense fallback={null}>
          <ChartQueryStatus
            search={applied.search}
            shown={query.matches.length}
            total={people.length}
            onClear={() => {
              setApplied(undefined);
            }}
          />
        </Suspense>
      )}

      {people.length === 0 ? (
        <EmptyState message={t.empty}>
          {/* The first-use state offers the way in for someone who already holds data (#1060): the restore and
              import on Preferences, since nothing is stored yet. It is derived from the stored people, never a flag. */}
          <p>
            <a className="quiet" href={routeHref({ kind: 'preferences', section: 'data' })}>
              {t.importData}
            </a>
          </p>
        </EmptyState>
      ) : (
        <>
          {/* With a query applied, an empty match list is already said by the status line above. */}
          {listed.length === 0 ? (
            query === undefined && <StatusMessage kind="zero">{t.noFilterMatch}</StatusMessage>
          ) : (
            <ul className="people">
              {listed.map((person) => (
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
          {query !== undefined && query.notEvaluable.length > 0 && (
            <Suspense fallback={null}>
              <NotEvaluableList items={query.notEvaluable} unnamed={t.unnamed} />
            </Suspense>
          )}
        </>
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
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => {
                    restore(person.id);
                  }}
                >
                  {t.restore}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    purge(person.id, person.displayName === '' ? t.unnamedPersonPlaceholder : person.displayName);
                  }}
                >
                  {t.deletePermanently}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
