/**
 * Composite (midpoint) chart between a saved person and a second saved person (#169), using
 * #30's near-arc midpoint convention for positions and the same convention applied to house
 * cusps (see `composite.ts`'s own doc comment for why: there is no single Julian day to hand
 * an ephemeris for a "recompute houses from a midpoint Ascendant/MC" approach, and the
 * time/space-midpoint "Davison" method is this issue's own explicit non-goal).
 *
 * The second person is picked from within this screen, not carried in the URL — the same
 * reasoning `SynastryView.tsx` gives for its own partner picker applies unchanged here. Unlike
 * synastry, the composite is a single synthetic `ChartData`, not a comparison between two live
 * ones, so this screen reuses `ChartDataView` wholesale (the same way `SharedChartView.tsx`
 * does) rather than calling the multi-wheel renderer directly.
 */
/**
 * @module CompositeView
 * @purpose Renders the composite (midpoint) chart screen between a saved person and a second, in-screen-picked partner.
 * @conventions Uses the near-arc midpoint convention for both positions and house cusps (`domain/composite.js`), not the time/space-midpoint "Davison" method; reuses `ChartDataView`/`ReportView` wholesale since the composite is a single synthetic `ChartData`. Text comes from co-located `CompositeView.messages.ts` via `useMessages()`.
 * @exports CompositeView
 */
import { Select } from './primitives/Select.js';
import { GlossaryTerms } from './GlossaryTerm.js';
import { personHref, routeHref } from './route.js';
import { useEffect, useMemo, useState } from 'react';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { computeComposite, type CompositeData } from '../domain/composite.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import type { ChartViewKind } from './chart-sections.js';
import { ChartDataView } from './ChartView.js';
import { ReportView } from './ReportView.js';
import { compositeViewMessages } from './CompositeView.messages.js';
import { useMessages } from './messages.js';
import { ordered } from './people-list.js';
import { momentKey } from '../time/encode.js';
import { PersonNotFound } from './PersonNotFound.js';
import { useStoreState } from './store-context.js';
import type { ChartData } from '../domain/chart-compute.js';
import { StatusMessage } from './primitives/StatusMessage.js';

type Load =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: ChartData }
  | { readonly kind: 'error'; readonly message: string };

/** This screen's own view-href shape (#511): `#/composite/<id>`, with no chart-type axis to carry. */
function compositeHref(personId: string, view: ChartViewKind): string {
  return routeHref({ kind: 'composite', personId, view });
}

export function CompositeView({
  personId,
  view,
}: {
  personId: string;
  view?: ChartViewKind | undefined;
}): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const t = useMessages(compositeViewMessages);

  const candidates = useMemo(
    () =>
      ordered(state.people).filter(
        (candidate) =>
          candidate.id !== personId && candidate.moment !== undefined && candidate.timeAccuracy !== 'unknown',
      ),
    [state.people, personId],
  );
  const [partnerId, setPartnerId] = useState<string>('');
  const partner = partnerId === '' ? undefined : state.people.get(partnerId);

  const { provider } = useEphemerisProvider();
  const [load, setLoad] = useState<Load>({ kind: 'idle' });

  useEffect(() => {
    if (person?.moment === undefined || partner?.moment === undefined || provider === undefined) {
      setLoad({ kind: 'idle' });
      return undefined;
    }
    const momentA = person.moment;
    const momentB = partner.moment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        const data: CompositeData = await computeComposite(momentA, momentB, provider);
        if (!effect.cancelled) setLoad({ kind: 'ready', data: data.composite });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [momentKey(person?.moment), momentKey(partner?.moment), provider]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (person.moment === undefined || person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <p className="back">
          <a href={personHref(personId)}>&larr; {person.displayName || t.personFallback}</a>
        </p>
        <h1>{t.compositeFallback}</h1>
        <p>
          {t.needsCompleteRecord(person.displayName || t.thisPerson)}{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const displayName =
    partner !== undefined ? `${person.displayName || t.personALabel} / ${partner.displayName || t.personBLabel}` : '';

  return (
    <main className="shell shell--wide">
      <p className="back">
        <a href={personHref(personId)}>&larr; {person.displayName || t.personFallback}</a>
      </p>
      <h1>{person.displayName ? t.heading(person.displayName) : t.compositeFallback}</h1>
      <GlossaryTerms terms={['composite', 'aspect', 'midheaven']} />
      <p className="hint">{t.hint}</p>

      <p>
        <Select
          label={t.composeWithLabel}
          value={partnerId}
          onChange={setPartnerId}
          options={[
            { value: '', label: t.choosePersonOption },
            ...candidates.map((candidate) => ({
              value: candidate.id,
              label: candidate.displayName || t.unnamedOption,
            })),
          ]}
        />
      </p>

      {partnerId !== '' && candidates.every((candidate) => candidate.id !== partnerId) && (
        <StatusMessage kind="error">{t.partnerGoneWarning}</StatusMessage>
      )}

      {partnerId !== '' && load.kind !== 'idle' && (
        <ChartDataView
          load={load}
          displayName={displayName || t.compositeFallback}
          showHouses
          metaLines={[displayName]}
          view={view ?? 'wheel'}
          onViewChange={(next) => {
            window.history.replaceState(null, '', compositeHref(personId, next));
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          }}
          buildViewHref={(next) => compositeHref(personId, next)}
        />
      )}

      {partnerId !== '' && load.kind === 'ready' && !housesAreDefined(load.data.houses) && (
        <StatusMessage kind="error">{t.housesUndefined}</StatusMessage>
      )}
      {partnerId !== '' && load.kind === 'ready' && housesAreDefined(load.data.houses) && (
        <ReportView chart={load.data} chartKind="composite" />
      )}
    </main>
  );
}
