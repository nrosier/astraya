/**
 * Composite (midpoint) chart between a saved person and a second saved person (#169), using
 * #30's near-arc midpoint convention for positions and the same convention applied to house
 * cusps (see `composite.ts`'s own doc comment for why: there is no single Julian day to hand
 * an ephemeris for a "recompute houses from a midpoint Ascendant/MC" approach, and the
 * time/space-midpoint "Davison" method is offered beside it as a choice, #1406 D2).
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
 * @conventions Uses the near-arc midpoint convention for both positions and house cusps (`domain/composite.js`), by default, with the time/space-midpoint "Davison" relationship chart (`domain/davison.ts`) offered as a method choice (#1406 D2); reuses `ChartDataView`/`ReportView` wholesale since the composite is a single synthetic `ChartData`. Text comes from co-located `CompositeView.messages.ts` via `useMessages()`.
 * @exports CompositeView
 */
import { GlossaryText } from './GlossaryText.js';
import { Select } from './primitives/Select.js';
import { personHref, routeHref } from './route.js';
import { useEffect, useMemo, useState } from 'react';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { computeComposite, type CompositeData } from '../domain/composite.js';
import { computeDavison } from '../domain/davison.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import type { ChartViewKind } from './chart-sections.js';
import { ChartDataView } from './ChartView.js';
import { ChartControlsOnly } from './ChartTypeSelector.js';
import { ReportView } from './ReportView.js';
import { compositeViewMessages } from './CompositeView.messages.js';
import { useMessages } from './messages.js';
import { useEngineBasisLine, withBasisItems } from './calculation-basis.js';
import { calculationBasisMessages } from './calculation-basis.messages.js';
import { useRulershipChoice } from './rulership-setting.js';
import { ordered } from './people-list.js';
import { PersonNotFound } from './PersonNotFound.js';
import { useStoreState } from './store-context.js';
import type { ChartData } from '../domain/chart-compute.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { useStableMoment } from './use-stable-moment.js';
import { replaceRoute } from './nav-history.js';
import { PageHeader } from './PageHeader.js';

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
  const personMoment = useStableMoment(person?.moment);
  const t = useMessages(compositeViewMessages);
  // A composite belongs to no single person, so it follows the device default rulership (#806).
  const [rulership] = useRulershipChoice();
  // `computeComposite` takes no options: the engine defaults, with the near-arc midpoint of every body and cusp.
  // The composite method (owner decision, #1406 D2): the near-arc midpoint (the default) or the Davison relationship chart.
  const [compositeMethod, setCompositeMethod] = useState<'midpoint' | 'davison'>('midpoint');
  const compositeMethodBasisKey = compositeMethod === 'davison' ? 'davisonMethod' : 'midpointMethod';
  const basisLine = withBasisItems(
    useEngineBasisLine(rulership),
    useMessages(calculationBasisMessages)[compositeMethodBasisKey],
  );

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
  const partnerMoment = useStableMoment(partner?.moment);

  const { provider } = useEphemerisProvider();
  const [load, setLoad] = useState<Load>({ kind: 'idle' });

  useEffect(() => {
    if (personMoment === undefined || partnerMoment === undefined || provider === undefined) {
      setLoad({ kind: 'idle' });
      return undefined;
    }
    const momentA = personMoment;
    const momentB = partnerMoment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        const chart =
          compositeMethod === 'davison'
            ? (await computeDavison(momentA, momentB, provider)).davison
            : ((await computeComposite(momentA, momentB, provider)) satisfies CompositeData).composite;
        if (!effect.cancelled) setLoad({ kind: 'ready', data: chart });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [personMoment, partnerMoment, provider, compositeMethod]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (person.moment === undefined || person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <PageHeader headingLevel={2} title={t.compositeFallback} titleTerm="composite" />
        <p>
          <GlossaryText text={t.needsCompleteRecord(person.displayName || t.thisPerson)} />{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  const displayName =
    partner !== undefined ? `${person.displayName || t.personALabel} / ${partner.displayName || t.personBLabel}` : '';

  return (
    <main className="shell shell--wide">
      <PageHeader
        headingLevel={2}
        title={person.displayName ? t.heading(person.displayName) : t.compositeFallback}
        titleTerm="composite"
        basis={basisLine}
      />
      <p className="hint">
        <GlossaryText text={t.hint} />
      </p>
      <p className="hint">
        <GlossaryText text={t.overlayContext} />
      </p>

      <p>
        <ChoiceGroup
          segmented
          showLabel
          label={t.methodLabel}
          value={compositeMethod}
          options={[
            { value: 'midpoint', label: t.methodMidpoint },
            { value: 'davison', label: t.methodDavison },
          ]}
          onChange={(value) => {
            if (value === 'midpoint' || value === 'davison') setCompositeMethod(value);
          }}
        />
      </p>

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
          rulership={rulership}
          personId={personId}
          load={load}
          displayName={displayName || t.compositeFallback}
          typeSelector={<ChartControlsOnly />}
          showHouses
          metaLines={[displayName]}
          view={view ?? 'wheel'}
          onViewChange={(next) => {
            replaceRoute(compositeHref(personId, next));
          }}
          buildViewHref={(next) => compositeHref(personId, next)}
        />
      )}

      {partnerId !== '' && load.kind === 'ready' && !housesAreDefined(load.data.houses) && (
        <StatusMessage kind="error">
          <GlossaryText text={t.housesUndefined} />
        </StatusMessage>
      )}
      {partnerId !== '' && load.kind === 'ready' && housesAreDefined(load.data.houses) && (
        <ReportView personId={personId} chart={load.data} chartKind="composite" />
      )}
    </main>
  );
}
