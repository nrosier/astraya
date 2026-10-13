/**
 * Multi-wheel overlay for one saved person (#558): natal always innermost, with an optional
 * transit ring, progressed ring, and/or an optional relocated ring, each independently toggled — not a fixed
 * biwheel like TransitView/SynastryView/PrimaryDirectionsView, which each hardcode exactly two
 * ring sources. `chart/multi-wheel.ts`'s `renderMultiWheelSvg` and
 * `chart/sheet-geometry.ts`'s `resolveRingBands` already support an arbitrary ring count (see
 * their own doc comments) — this screen is the first one to actually exercise more than two
 * rings at once, composing `chartWheelRing` outputs from independent `compute*` calls rather
 * than adding anything to the renderer itself.
 *
 * Cross-ring aspects are drawn between natal and the selected transit/progressed ring, reusing
 * each technique's own natal contacts. A relocated
 * ring's positions are identical to natal's (same moment, different place only moves
 * houses/angles — see `domain/relocated-chart.ts`'s own header), so "cross aspects" between
 * natal and relocated would be meaningless — every body would be marked exactly conjunct
 * itself. No generic any-ring-pair cross-aspect computation is attempted here.
 */
/**
 * @module MultiWheelView
 * @purpose Renders the multi-wheel overlay screen: natal ring always present, independently toggled transit, progressed, and relocated rings, composed via chartWheelRing + renderMultiWheelSvg.
 * @conventions Reuses chartWheelRing (one adapter per ring source) and renderMultiWheelSvg directly, bypassing the single-ring AstroChartWheel wrapper, same as TransitView/SynastryView/PrimaryDirectionsView; transit/progressed rings reuse each technique's own noon-UTC date convention and natal contacts; the relocated ring reuses domain/relocated-chart.ts's own location-input idiom. Text comes from co-located MultiWheelView.messages.ts via useMessages().
 * @exports MultiWheelView
 */
import { useEffect, useMemo, useState } from 'react';
import { GlossaryTerms } from './GlossaryTerm.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { computeChartData, housesAreDefined, type ChartData } from '../domain/chart-compute.js';
import type { Aspect } from '../astrology/aspects.js';
import { bodyById } from '../astrology/bodies.js';
import { computeTransit } from '../domain/transit.js';
import { computeRelocatedChart } from '../domain/relocated-chart.js';
import { computeSecondaryProgression, type SecondaryProgressionData } from '../domain/secondary-progression.js';
import { chartWheelRing } from '../domain/chart-tables.js';
import { TRANSIT_ORB_CONFIG } from '../astrology/transit-importance.js';
import { renderMultiWheelSvg, type CrossRingAspects } from '../chart/multi-wheel.js';
import { momentKey } from '../time/encode.js';
import { personHref } from './route.js';
import { multiWheelViewMessages } from './MultiWheelView.messages.js';
import { useMessages } from './messages.js';
import { parseCoordinate } from './map-settings.js';
import { Checkbox } from './primitives/Checkbox.js';
import { DateField } from './primitives/DateField.js';
import { NumberField } from './primitives/NumberField.js';
import { todayInputValue } from './format.js';
import { PersonNotFound } from './PersonNotFound.js';
import { useStoreState } from './store-context.js';
import { StatusMessage } from './primitives/StatusMessage.js';

function progressedWheelRing(data: SecondaryProgressionData, label: string) {
  return {
    label,
    houses: data.houses,
    bodies: data.positions.map((position) => ({
      body: position.body,
      key: bodyById(position.body)?.key ?? String(position.body),
      longitude: position.longitude,
      retrograde: position.retrograde,
    })),
  };
}

type Load =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly natal: ChartData;
      readonly transit?: ChartData | undefined;
      readonly transitContacts?: readonly Aspect[] | undefined;
      readonly progressed?: SecondaryProgressionData | undefined;
      readonly relocated?: ChartData | undefined;
    }
  | { readonly kind: 'error'; readonly message: string };

export function MultiWheelView({ personId }: { personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const t = useMessages(multiWheelViewMessages);

  const [includeTransit, setIncludeTransit] = useState(false);
  const [transitDate, setTransitDate] = useState(todayInputValue);
  const [includeProgressed, setIncludeProgressed] = useState(false);
  const [progressedDate, setProgressedDate] = useState(todayInputValue);

  const [includeRelocated, setIncludeRelocated] = useState(false);
  const [latInput, setLatInput] = useState('');
  const [lonInput, setLonInput] = useState('');
  const latitude = parseCoordinate(latInput, -90, 90);
  const longitude = parseCoordinate(lonInput, -180, 180);
  const hasBothFields = latInput.trim() !== '' && lonInput.trim() !== '';
  const relocationValid = latitude !== undefined && longitude !== undefined;

  const { provider } = useEphemerisProvider();
  const [load, setLoad] = useState<Load>({ kind: 'idle' });

  useEffect(() => {
    if (person?.moment === undefined || provider === undefined) {
      setLoad({ kind: 'idle' });
      return undefined;
    }
    const moment = person.moment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        const natal = await computeChartData(moment, provider);

        let transit: ChartData | undefined;
        let transitContacts: readonly Aspect[] | undefined;
        if (includeTransit) {
          const [year, month, day] = transitDate.split('-').map(Number);
          if (year !== undefined && month !== undefined && day !== undefined) {
            // Noon, not midnight — same reasoning as TransitView.tsx/ProfectionsView.tsx: a date
            // picker names a day, not a moment.
            const targetJd = await provider.julianDayFromUtc(year, month, day, 12, 0, 0);
            const transitData = await computeTransit(moment, targetJd, provider, {}, TRANSIT_ORB_CONFIG);
            transit = transitData.transit;
            transitContacts = transitData.contacts;
          }
        }

        let progressed: SecondaryProgressionData | undefined;
        if (includeProgressed) {
          const [year, month, day] = progressedDate.split('-').map(Number);
          if (year !== undefined && month !== undefined && day !== undefined) {
            const targetJd = await provider.julianDayFromUtc(year, month, day, 12, 0, 0);
            progressed = await computeSecondaryProgression(moment, targetJd, provider);
          }
        }

        let relocated: ChartData | undefined;
        if (includeRelocated && latitude !== undefined && longitude !== undefined) {
          const relocatedData = await computeRelocatedChart(moment, { latitude, longitude, altitude: 0 }, provider);
          relocated = relocatedData.relocated;
        }

        if (!effect.cancelled) setLoad({ kind: 'ready', natal, transit, transitContacts, progressed, relocated });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [
    momentKey(person?.moment),
    provider,
    includeTransit,
    transitDate,
    includeProgressed,
    progressedDate,
    includeRelocated,
    latitude,
    longitude,
  ]);

  const wheelMarkup = useMemo(() => {
    if (load.kind !== 'ready') return undefined;
    const rings = [chartWheelRing(load.natal, t.natalLabel)];
    const crossAspects: CrossRingAspects[] = [];
    if (load.transit !== undefined) {
      rings.push(chartWheelRing(load.transit, t.transitRingLabel));
      if (load.transitContacts !== undefined) {
        crossAspects.push({ innerRingIndex: 0, outerRingIndex: rings.length - 1, aspects: load.transitContacts });
      }
    }
    if (load.progressed !== undefined) {
      rings.push(progressedWheelRing(load.progressed, t.progressedRingLabel));
    }
    if (load.relocated !== undefined) {
      rings.push(chartWheelRing(load.relocated, t.relocatedRingLabel));
    }
    return renderMultiWheelSvg(rings, crossAspects);
  }, [load, t]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (person.moment === undefined || person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <p className="back">
          <a href={personHref(personId)}>&larr; {person.displayName || t.personFallback}</a>
        </p>
        <h1>{t.multiWheelFallback}</h1>
        <p>
          {t.needsCompleteRecord(person.displayName || t.thisPerson)}{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  return (
    <main className="shell shell--wide">
      <p className="back">
        <a href={personHref(personId)}>&larr; {person.displayName || t.personFallback}</a>
      </p>
      <h1>{person.displayName ? t.heading(person.displayName) : t.headingFallback}</h1>
      <GlossaryTerms terms={['houses', 'aspect', 'transit']} />
      <p className="hint">{t.hint}</p>

      <div className="field-grid">
        <Checkbox label={t.includeTransit} checked={includeTransit} onChange={setIncludeTransit} />
        {includeTransit && <DateField label={t.transitDateLabel} value={transitDate} onChange={setTransitDate} />}
        <Checkbox label={t.includeProgressed} checked={includeProgressed} onChange={setIncludeProgressed} />
        {includeProgressed && (
          <DateField label={t.progressedDateLabel} value={progressedDate} onChange={setProgressedDate} />
        )}
      </div>

      <div className="field-grid">
        <Checkbox label={t.includeRelocated} checked={includeRelocated} onChange={setIncludeRelocated} />
        {includeRelocated && (
          <>
            <NumberField
              label={t.latitudeLabel}
              value={latInput}
              min={-90}
              max={90}
              step={0.0001}
              decreaseLabel={t.latitudeDecreaseLabel}
              increaseLabel={t.latitudeIncreaseLabel}
              onChange={setLatInput}
            />
            <NumberField
              label={t.longitudeLabel}
              value={lonInput}
              min={-180}
              max={180}
              step={0.0001}
              decreaseLabel={t.longitudeDecreaseLabel}
              increaseLabel={t.longitudeIncreaseLabel}
              onChange={setLonInput}
            />
          </>
        )}
      </div>
      {includeRelocated && !hasBothFields && <p className="hint">{t.needsLocation}</p>}
      {includeRelocated && hasBothFields && !relocationValid && (
        <StatusMessage kind="error">{t.invalidLocation}</StatusMessage>
      )}

      {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}
      {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}

      {load.kind === 'ready' && !housesAreDefined(load.natal.houses) && (
        <StatusMessage kind="error">{t.multiWheelFallback}</StatusMessage>
      )}

      {load.kind === 'ready' && wheelMarkup !== undefined && housesAreDefined(load.natal.houses) && (
        // App-generated SVG from just-computed chart data, never user-supplied markup — the
        // same trust boundary ChartView.tsx's/TransitView.tsx's sheet markup is injected under.
        <div className="chart-wheel" aria-hidden="true" dangerouslySetInnerHTML={{ __html: wheelMarkup }} />
      )}
    </main>
  );
}
