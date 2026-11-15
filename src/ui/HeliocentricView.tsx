/**
 * @module HeliocentricView
 * @purpose Renders the heliocentric chart screen for a saved person (#1407): the Earth, Mercury to Pluto and Chiron as seen from the Sun.
 * @conventions A single synthetic chart, so it reuses `ChartDataView` wholesale like DraconicView, with `showHouses={false}`: no house collar, angles or house column, since houses have no heliocentric meaning (owner decision, 2026-11-14). No overlay rings and no PDF section yet. The basis line names the frame and leaves out the house system and node model. Text comes from co-located `HeliocentricView.messages.ts` via `useMessages()`.
 * @exports HeliocentricView
 */
import { useEffect, useMemo, useState } from 'react';
import { GlossaryText } from './GlossaryText.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { computeHeliocentric } from '../domain/heliocentric.js';
import { ChartDataView } from './ChartView.js';
import { ChartTypeSelector, changeChartView } from './ChartTypeSelector.js';
import { type ChartType, type ChartViewKind } from './chart-sections.js';
import { chartHref, personHref } from './route.js';
import { heliocentricViewMessages } from './HeliocentricView.messages.js';
import { useMessages } from './messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { useStoreState } from './store-context.js';
import type { ChartData } from '../domain/chart-compute.js';
import { useEngineBasisLine } from './calculation-basis.js';
import { calculationBasisMessages } from './calculation-basis.messages.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';
import { orbsOf } from '../chart/extended-settings.js';
import { useStableBy, useStableMoment } from './use-stable-moment.js';
import { PageHeader } from './PageHeader.js';
import { ChartHelpTooltip } from './ChartHelpTooltip.js';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: ChartData }
  | { readonly kind: 'error'; readonly message: string };

// Comparison mode (compareType) follows the other derived charts (#439).
export function HeliocentricView({
  personId,
  view,
}: {
  personId: string;
  view?: ChartViewKind | undefined;
  compareType?: ChartType | undefined;
}): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  const t = useMessages(heliocentricViewMessages);
  const { provider } = useEphemerisProvider();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const {
    settings: extendedSettings,
    unreadable: settingsUnreadable,
    rulership,
  } = usePersonCalculationSettings(personId);
  const orbs = useStableBy(orbsOf(extendedSettings), (config) => JSON.stringify(config));
  // The engine defaults (tropical) with the person's orbs and rulers; no houses and no lunar nodes to name.
  const basisLine = useEngineBasisLine(
    rulership,
    extendedSettings,
    useMessages(calculationBasisMessages).heliocentric,
    undefined,
    { houses: 'none' },
  );
  // Memoised: a new array each render would redraw the wheel and drop a selection, as on the draconic chart.
  const metaLines = useMemo(() => [t.headingFallback], [t.headingFallback]);

  useEffect(() => {
    if (personMoment === undefined || provider === undefined || settingsUnreadable) return undefined;
    const moment = personMoment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });
    void (async () => {
      try {
        const data = await computeHeliocentric(moment, provider, { ...orbs, rulership });
        if (!effect.cancelled) setLoad({ kind: 'ready', data: data.heliocentric });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      effect.cancelled = true;
    };
  }, [settingsUnreadable, personMoment, provider, orbs, rulership]);

  if (person === undefined) return <PersonNotFound />;
  if (settingsUnreadable) return <UnreadableSettingsNotice name={person.displayName || ''} />;

  if (person.moment === undefined || person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <PageHeader title={t.heliocentricChartFallback} />
        <p>
          <GlossaryText text={t.needsCompleteRecord(person.displayName || t.thisPerson)} />{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const displayName = person.displayName ? `${person.displayName} — ${t.headingFallback}` : t.headingFallback;
  return (
    <main className="shell shell--wide">
      <PageHeader
        title={person.displayName ? t.heading(person.displayName) : t.headingFallback}
        titleAside={<ChartHelpTooltip explanation={t.hint} />}
        basis={basisLine}
      />
      <ChartTypeSelector personId={personId} type="heliocentric" view={view} />
      <ChartDataView
        wheelHint={false}
        personId={personId}
        chartType="heliocentric"
        load={load}
        displayName={displayName}
        showHouses={false}
        frameHasHouses={false}
        metaLines={metaLines}
        rulership={rulership}
        view={view ?? 'wheel'}
        onViewChange={(next) => {
          changeChartView(personId, 'heliocentric', next);
        }}
        buildViewHref={(next) => chartHref(personId, next, 'heliocentric')}
      />
    </main>
  );
}
