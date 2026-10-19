/**
 * The draconic chart for a saved person (#398).
 *
 * A draconic chart is a single synthetic chart derived from one natal chart, not a comparison
 * between two — like harmonic charts (#170), this screen reuses `ChartDataView` wholesale rather
 * than the multi-wheel renderer. Unlike harmonic, there is no in-screen parameter to pick: the
 * draconic zero-point is always the natal North Node, so this view has no picker at all.
 */
/**
 * @module DraconicView
 * @purpose Renders the draconic chart screen for a saved person: every body re-measured from the natal North Node rather than zero Aries.
 * @conventions A single synthetic chart derived from one natal chart (not a comparison), so it reuses `ChartDataView` wholesale like HarmonicView; no in-screen parameter picker since the draconic zero-point is always the natal North Node. Text comes from co-located `DraconicView.messages.ts` via `useMessages()`.
 * @exports DraconicView
 */
import { useEffect, useMemo, useState } from 'react';
import { GlossaryTerms } from './GlossaryTerm.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { computeDraconic, type DraconicData } from '../domain/draconic.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import { ChartDataView } from './ChartView.js';
import { ChartTypeSelector, changeChartView } from './ChartTypeSelector.js';
import { type ChartType, type ChartViewKind } from './chart-sections.js';
import { chartHref, personHref } from './route.js';
import { ReportView } from './ReportView.js';
import { draconicViewMessages } from './DraconicView.messages.js';
import { useMessages } from './messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { useStoreState } from './store-context.js';
import type { ChartData } from '../domain/chart-compute.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useExtendedSettings } from './extended-settings-store.js';
import { orbsOf } from '../chart/extended-settings.js';
import { useStableBy, useStableMoment } from './use-stable-moment.js';
import { BackLink } from './BackLink.js';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: ChartData }
  | { readonly kind: 'error'; readonly message: string };

// Comparison mode (compareType) will be implemented in a follow-up (#439)
export function DraconicView({
  personId,
  view,
  compareType,
}: {
  personId: string;
  view?: ChartViewKind | undefined;
  compareType?: ChartType | undefined;
}): React.JSX.Element {
  if (compareType !== undefined) {
    // TODO: implement comparison mode for draconic charts (#439)
  }
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  const t = useMessages(draconicViewMessages);

  // Memoised: a new array each render (a change of section re-renders this screen) would redraw the wheel and drop a selection.
  const metaLines = useMemo(() => [t.headingFallback], [t.headingFallback]);

  const { provider } = useEphemerisProvider();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const customPoints = useStableBy(person?.customPoints, (points) => JSON.stringify(points ?? []));
  // The aspects use the device's orbs (#590), as the natal chart does.
  const [extendedSettings] = useExtendedSettings();
  const orbs = useStableBy(orbsOf(extendedSettings), (config) => JSON.stringify(config));

  useEffect(() => {
    if (personMoment === undefined || provider === undefined) return undefined;
    const moment = personMoment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        const data: DraconicData = await computeDraconic(moment, provider, {
          ...orbs,
          ...(customPoints === undefined ? {} : { customPoints }),
        });
        if (!effect.cancelled) setLoad({ kind: 'ready', data: data.draconic });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [personMoment, provider, customPoints, orbs]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (person.moment === undefined || person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <BackLink fallback={personHref(personId)} />
        <h1>{t.draconicChartFallback}</h1>
        <p>
          {t.needsCompleteRecord(person.displayName || t.thisPerson)}{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const displayName = person.displayName ? `${person.displayName} — ${t.headingFallback}` : t.headingFallback;

  return (
    <main className="shell shell--wide">
      <BackLink fallback={personHref(personId)} />
      <h1>{person.displayName ? t.heading(person.displayName) : t.headingFallback}</h1>
      <GlossaryTerms terms={['draconic', 'ascendant', 'aspect']} />
      <ChartTypeSelector personId={personId} type="draconic" view={view} />
      <p className="hint">{t.hint}</p>

      <ChartDataView
        chartType="draconic"
        load={load}
        displayName={displayName}
        showHouses
        metaLines={metaLines}
        view={view ?? 'wheel'}
        onViewChange={(next) => {
          changeChartView(personId, 'draconic', next);
        }}
        buildViewHref={(next) => chartHref(personId, next, 'draconic')}
        overlayContext={
          provider === undefined
            ? undefined
            : {
                moment: person.moment,
                provider,
                baseLabel: t.headingFallback,
                baseSource: 'draconic',
                ...(person.customPoints === undefined ? {} : { options: { customPoints: person.customPoints } }),
              }
        }
      />

      {load.kind === 'ready' && !housesAreDefined(load.data.houses) && (
        <StatusMessage kind="error">{t.housesUndefined}</StatusMessage>
      )}
      {load.kind === 'ready' && housesAreDefined(load.data.houses) && <ReportView chart={load.data} />}
    </main>
  );
}
