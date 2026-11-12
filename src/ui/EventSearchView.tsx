/**
 * Research-oriented batch ephemeris search (#562): a bounded UTC date range and explicit
 * event filters over stations, sign ingresses, lunations and exact moving-body aspects.
 */
/**
 * @module EventSearchView
 * @purpose Renders the person-independent ephemeris research screen and CSV download workflow.
 * @conventions Saved queries (#1061) keep the form's parameters only; reopening one fills the form and never runs it. Inputs are civil UTC dates so the range written to the CSV exactly matches the Julian-day search; all calculations use the shared EphemerisProvider and the domain event-search module.
 * @exports EventSearchView
 */
import { ASPECTS } from '../astrology/aspects.js';
import { BODIES, bodyByKey } from '../astrology/bodies.js';
import {
  eventSearchCsvFilename,
  eventSearchIcsFilename,
  eventSearchToCsv,
  searchEvents,
  type EventSearchKind,
  type EventSearchResult,
} from '../domain/event-search.js';
import { eventSearchToIcs } from '../domain/event-search-ics.js';
import { downloadText } from './download.js';
import { useRegisterExports } from './export-registry.js';
import { Fragment, useMemo, useRef, useState } from 'react';
import { Checkbox } from './primitives/Checkbox.js';
import { SortableTable } from './SortableTable.js';
import type { TableColumn } from './table-sort.js';
import { Select } from './primitives/Select.js';
import { Button } from './primitives/Button.js';
import { DateField } from './primitives/DateField.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useMessages } from './messages.js';
import { eventSearchViewMessages } from './EventSearchView.messages.js';
import { PageHeader } from './PageHeader.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../astrology/rulership.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { useCalculationBasisLine } from './calculation-basis.js';
import { SavedQueries } from './SavedQueries.js';
import { PinButton, PinnedEvents } from './EventPins.js';
import { eventPinsMessages } from './EventPins.messages.js';
import { parseSearchDate, type EventSearchQueryParameters } from '../store/saved-queries.js';

type Parameters = EventSearchQueryParameters;

type Result =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly rows: readonly EventSearchResult[];
      readonly fromJd: number;
      readonly toJd: number;
      readonly parameters: Parameters;
    }
  | { readonly kind: 'error'; readonly message: string };

const BODY_OPTIONS = BODIES.filter((body) => body.category !== 'node' && body.category !== 'lilith').map((body) => ({
  value: body.key,
  label: body.name,
}));

function toggle(
  kinds: readonly EventSearchKind[],
  kind: EventSearchKind,
  checked: boolean,
): readonly EventSearchKind[] {
  return checked ? [...new Set([...kinds, kind])] : kinds.filter((current) => current !== kind);
}

export function EventSearchView(): React.JSX.Element {
  const t = useMessages(eventSearchViewMessages);
  const pinMessages = useMessages(eventPinsMessages);
  const basisLine = useCalculationBasisLine(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
  const columns = useMemo<readonly TableColumn<EventSearchResult>[]>(
    () => [
      {
        key: 'date',
        label: t.date,
        valueOf: (row) => row.jd,
        align: 'start',
        render: (row) => new Date((row.jd - 2440587.5) * 86400000).toISOString().replace('.000Z', 'Z'),
      },
      { key: 'kind', label: t.kind, valueOf: (row) => t.kindLabels[row.kind] },
      { key: 'event', label: t.event, valueOf: (row) => row.label },
      {
        key: 'pin',
        label: pinMessages.pinColumn,
        valueOf: () => '',
        renderCell: (row) => <PinButton result={row} />,
        sortable: false,
        screenOnly: true,
      },
    ],
    [t, pinMessages],
  );
  const { provider } = useEphemerisProvider();
  const [parameters, setParameters] = useState<Parameters>({
    from: '2026-01-01',
    to: '2026-12-31',
    kinds: ['station', 'ingress', 'lunation', 'aspect'],
    stationBody: 'mercury',
    ingressBody: 'sun',
    aspectBodyA: 'jupiter',
    aspectBodyB: 'saturn',
    aspectKey: 'conjunction',
  });
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const runId = useRef(0);
  const patch = (next: Partial<Parameters>): void => {
    setParameters((current) => ({ ...current, ...next }));
  };

  const run = (): void => {
    const from = parseSearchDate(parameters.from);
    const to = parseSearchDate(parameters.to);
    const stationBody = bodyByKey(parameters.stationBody);
    const ingressBody = bodyByKey(parameters.ingressBody);
    const aspectBodyA = bodyByKey(parameters.aspectBodyA);
    const aspectBodyB = bodyByKey(parameters.aspectBodyB);
    if (provider === undefined) return;
    if (from === undefined || to === undefined || parameters.kinds.length === 0) {
      setResult({ kind: 'error', message: t.invalidRange });
      return;
    }
    if (
      parameters.kinds.includes('aspect') &&
      (aspectBodyA === undefined || aspectBodyB === undefined || aspectBodyA.id === aspectBodyB.id)
    ) {
      setResult({ kind: 'error', message: t.needsTwoBodies });
      return;
    }
    const id = ++runId.current;
    setResult({ kind: 'loading' });
    void Promise.all([provider.julianDay(...from, 0), provider.julianDay(...to, 24)])
      .then(async ([fromJd, toJd]) => {
        if (toJd < fromJd) throw new Error(t.invalidRange);
        const rows = await searchEvents(fromJd, toJd, provider, {
          kinds: parameters.kinds,
          ...(stationBody === undefined ? {} : { stationBodies: [stationBody.id] }),
          ...(ingressBody === undefined ? {} : { ingressBodies: [ingressBody.id] }),
          ...(aspectBodyA === undefined || aspectBodyB === undefined
            ? {}
            : { aspectPairs: [[aspectBodyA.id, aspectBodyB.id] as const] }),
          aspectKeys: [parameters.aspectKey],
        });
        if (id === runId.current) setResult({ kind: 'ready', rows, fromJd, toJd, parameters });
      })
      .catch((error: unknown) => {
        if (id === runId.current)
          setResult({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      });
  };

  const download = (): void => {
    if (result.kind !== 'ready') return;
    const stationBody = bodyByKey(result.parameters.stationBody);
    const ingressBody = bodyByKey(result.parameters.ingressBody);
    const aspectBodyA = bodyByKey(result.parameters.aspectBodyA);
    const aspectBodyB = bodyByKey(result.parameters.aspectBodyB);
    const csv = eventSearchToCsv(
      result.fromJd,
      result.toJd,
      {
        kinds: result.parameters.kinds,
        ...(stationBody === undefined ? {} : { stationBodies: [stationBody.id] }),
        ...(ingressBody === undefined ? {} : { ingressBodies: [ingressBody.id] }),
        ...(aspectBodyA === undefined || aspectBodyB === undefined
          ? {}
          : { aspectPairs: [[aspectBodyA.id, aspectBodyB.id] as const] }),
        aspectKeys: [result.parameters.aspectKey],
      },
      result.rows,
    );
    downloadText(eventSearchCsvFilename(new Date()), csv, 'text/csv;charset=utf-8');
  };

  /** The same results as an iCalendar file (#639). Sky events only, so no birth data is in it. */
  const downloadIcs = (): void => {
    if (result.kind !== 'ready') return;
    const now = new Date();
    downloadText(eventSearchIcsFilename(now), eventSearchToIcs(result.rows, now), 'text/calendar;charset=utf-8');
  };

  // The same two downloads as the results' body buttons, in the header Export menu (#887).
  useRegisterExports(
    result.kind === 'ready'
      ? [
          { key: 'csv', label: t.downloadCsv, run: download },
          { key: 'ics', label: t.downloadIcs, run: downloadIcs },
        ]
      : undefined,
  );

  return (
    <main className="shell">
      <PageHeader title={t.heading} basis={basisLine} basisEditHref={null} headingLevel={2} />
      <div className="tool-layout">
        <section className="tool-card tool-form" aria-labelledby="event-search-heading">
          <h2 id="event-search-heading">{t.searchHeading}</h2>
          <fieldset className="field-group">
            <legend>{t.rangeLegend}</legend>
            <div className="tool-field-row">
              <DateField
                label={t.fromLabel}
                value={parameters.from}
                onChange={(from) => {
                  patch({ from });
                }}
              />
              <DateField
                label={t.toLabel}
                value={parameters.to}
                onChange={(to) => {
                  patch({ to });
                }}
              />
            </div>
          </fieldset>
          <fieldset className="field-group">
            <legend>{t.eventsLegend}</legend>
            <div className="tool-choice-row">
              {(['station', 'ingress', 'lunation', 'aspect'] as const).map((kind) => (
                <Checkbox
                  key={kind}
                  label={t.kindLabels[kind]}
                  checked={parameters.kinds.includes(kind)}
                  onChange={(checked) => {
                    patch({ kinds: toggle(parameters.kinds, kind, checked) });
                  }}
                />
              ))}
            </div>
            <div className="tool-field-row">
              <Select
                label={t.stationBody}
                value={parameters.stationBody}
                options={BODY_OPTIONS}
                onChange={(stationBody) => {
                  patch({ stationBody });
                }}
              />
              <Select
                label={t.ingressBody}
                value={parameters.ingressBody}
                options={BODY_OPTIONS}
                onChange={(ingressBody) => {
                  patch({ ingressBody });
                }}
              />
            </div>
            <div className="tool-field-row">
              <Select
                label={t.aspectBodyA}
                value={parameters.aspectBodyA}
                options={BODY_OPTIONS}
                onChange={(aspectBodyA) => {
                  patch({ aspectBodyA });
                }}
              />
              <Select
                label={t.aspectBodyB}
                value={parameters.aspectBodyB}
                options={BODY_OPTIONS}
                onChange={(aspectBodyB) => {
                  patch({ aspectBodyB });
                }}
              />
            </div>
            <Select
              label={t.aspect}
              value={parameters.aspectKey}
              options={ASPECTS.map((aspect) => ({ value: aspect.key, label: aspect.name }))}
              onChange={(aspectKey) => {
                patch({ aspectKey });
              }}
            />
          </fieldset>
          {result.kind === 'error' && <StatusMessage kind="error">{result.message}</StatusMessage>}
          <div className="tool-actions">
            <Button variant="primary" disabled={provider === undefined} busy={result.kind === 'loading'} onClick={run}>
              {t.searchButton}
            </Button>
          </div>
          <SavedQueries
            parameters={parameters}
            kindLabels={t.kindLabels}
            onOpen={(opened) => {
              setParameters(opened);
              setResult({ kind: 'idle' });
            }}
          />
          <PinnedEvents />
        </section>

        <aside className="tool-card tool-panel" aria-labelledby="event-search-panel-heading">
          <h2 id="event-search-panel-heading">{t.panelHeading}</h2>
          {/* The panel describes the current result; the results region below carries the busy state (#888). */}
          <div className="tool-panel-body" aria-live="polite">
            {result.kind === 'loading' && <StatusMessage kind="loading">{t.searching}</StatusMessage>}
            {(result.kind === 'idle' || result.kind === 'error') && <p className="hint">{t.emptyState}</p>}
            {result.kind === 'ready' && (
              <>
                <p className="tool-panel-figure">{t.resultCount(String(result.rows.length))}</p>
                <dl className="tool-facts">
                  <dt>{t.rangeLegend}</dt>
                  <dd>{t.rangeValue(result.parameters.from, result.parameters.to)}</dd>
                  {result.parameters.kinds.map((kind) => (
                    <Fragment key={kind}>
                      <dt>{t.kindLabels[kind]}</dt>
                      <dd>{String(result.rows.filter((row) => row.kind === kind).length)}</dd>
                    </Fragment>
                  ))}
                </dl>
              </>
            )}
            <p className="hint">{t.intro}</p>
          </div>
        </aside>
      </div>

      {/* The result region: busy while the search runs, as the Astrocartography map is. */}
      <div aria-busy={result.kind === 'loading'}>
        {result.kind === 'ready' && (
          <section>
            <p>
              <Button variant="plain" type="button" onClick={download}>
                {t.downloadCsv}
              </Button>{' '}
              <Button variant="plain" type="button" onClick={downloadIcs}>
                {t.downloadIcs}
              </Button>
            </p>
            <SortableTable
              headingLevel={2}
              caption={t.resultsHeading}
              columns={columns}
              rows={result.rows}
              getRowKey={(row) => `${row.kind}-${String(row.jd)}-${row.label}`}
            />
          </section>
        )}
      </div>
    </main>
  );
}
