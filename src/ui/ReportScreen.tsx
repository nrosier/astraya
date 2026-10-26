/**
 * The written report for one person (#271), as its own route (`#/report/:id`) rather than a
 * `?tab=report` query on the chart route — matching every other person-scoped view
 * (`#/profections/:id`, `#/transit/:id`, ...). Loads the same natal `ChartData` `ChartView`
 * does, but shows nothing else from that page: no wheel, no export controls, no share link,
 * no positions/houses/aspects/dignities/derived-points sub-tabs. A report is text, not a
 * chart reading, and belongs on a page of its own.
 */
/**
 * @module ReportScreen
 * @purpose Standalone written-report route (`#/report/:id`) for one person, loading natal ChartData and delegating rendering to ReportView.
 * @conventions Gated for incomplete record/unknown time/undefined houses the same way other person-scoped views are; uses ReportScreen.messages.ts for en/nl text via useMessages().
 * @exports ReportScreen
 */
import { personHref } from './route.js';
import { useEffect, useMemo, useState } from 'react';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { computeChartData, housesAreDefined, type ChartData } from '../domain/chart-compute.js';
import { PersonNotFound } from './PersonNotFound.js';
import { reportScreenMessages } from './ReportScreen.messages.js';
import { ReportView } from './ReportView.js';
import { useMessages } from './messages.js';
import { useStoreState } from './store-context.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';
import { useOrbContextSource, useOrbLibrary } from './orb-library-store.js';
import { settingsForContext, toChartCalculationOptions } from '../chart/extended-settings.js';
import { interpretationExclusions } from '../chart/object-policy.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useStableBy, useStableMoment } from './use-stable-moment.js';
import { BackLink } from './BackLink.js';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: ChartData }
  | { readonly kind: 'error'; readonly message: string };

export function ReportScreen({ personId }: { personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  const customPoints = useStableBy(person?.customPoints, (points) => JSON.stringify(points ?? []));
  const t = useMessages(reportScreenMessages);
  const { provider } = useEphemerisProvider();
  // The chart the Charts page draws (#732): its natal-context settings, rulers and custom points — not a
  // default-settings chart under the same name, which would read out a different chart from the one on screen.
  const { settings: cardSettings, unreadable: settingsUnreadable, rulership } = usePersonCalculationSettings(personId);
  const orbLibrary = useOrbLibrary();
  const orbSources = useOrbContextSource();
  const settings = useMemo(
    () => settingsForContext(cardSettings, 'natal', orbLibrary, orbSources),
    [cardSettings, orbLibrary, orbSources],
  );
  // What the written reading leaves out (#721) — display-only hiding never lands here.
  const exclusions = useMemo(() => interpretationExclusions(settings.objectPolicies), [settings]);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    if (personMoment === undefined || provider === undefined || settingsUnreadable) return undefined;
    const moment = personMoment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        const data = await computeChartData(moment, provider, {
          ...toChartCalculationOptions(settings),
          rulership,
          ...(customPoints === undefined ? {} : { customPoints }),
        });
        if (!effect.cancelled) setLoad({ kind: 'ready', data });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [settingsUnreadable, personMoment, rulership, provider, settings, customPoints]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (settingsUnreadable) {
    return <UnreadableSettingsNotice personId={personId} name={person.displayName || ''} />;
  }

  if (person.moment === undefined) {
    return (
      <main className="shell">
        <BackLink fallback={personHref(personId)} />
        <h1>{t.reportFallback}</h1>
        <p>
          {t.notCompleteReport(person.displayName || t.thisPerson)}{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  // The report leans on houses/angles (the Ascendant-based sections `ChartView`'s own
  // `showHouses` gate covers) same as those tables do, so an unknown birth time means the
  // same "not meaningful" answer, not an approximation.
  if (person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <BackLink fallback={personHref(personId)} />
        <h1>{t.reportFallback}</h1>
        <p>{t.needsKnownTime(person.displayName || t.thisPerson)}</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <BackLink fallback={personHref(personId)} />
      <h1>{person.displayName ? t.heading(person.displayName) : t.reportFallback}</h1>

      {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}
      {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}
      {load.kind === 'ready' && !housesAreDefined(load.data.houses) && (
        <StatusMessage kind="error">{t.housesUndefined(person.displayName || t.thisPerson)}</StatusMessage>
      )}
      {load.kind === 'ready' && housesAreDefined(load.data.houses) && (
        <>
          {load.data.houses.warning !== undefined && (
            <StatusMessage kind="error">{load.data.houses.warning}</StatusMessage>
          )}
          <ReportView chart={load.data} exclude={exclusions} personId={personId} rulership={rulership} />
        </>
      )}
    </main>
  );
}
