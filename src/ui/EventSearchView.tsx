/**
 * Research-oriented batch ephemeris search (#562): a bounded UTC date range and explicit
 * event filters over stations, sign ingresses, lunations and exact moving-body aspects.
 */
/**
 * @module EventSearchView
 * @purpose Renders the person-independent ephemeris research screen and CSV download workflow.
 * @conventions Inputs are civil UTC dates so the range written to the CSV exactly matches the Julian-day search; all calculations use the shared EphemerisProvider and the domain event-search module.
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
import { useRef, useState } from 'react';
import { Checkbox } from './primitives/Checkbox.js';
import { Select } from './primitives/Select.js';
import { TextField } from './primitives/TextField.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { useMessages } from './messages.js';
import { eventSearchViewMessages } from './EventSearchView.messages.js';

interface Parameters {
  readonly from: string;
  readonly to: string;
  readonly kinds: readonly EventSearchKind[];
  readonly stationBody: string;
  readonly ingressBody: string;
  readonly aspectBodyA: string;
  readonly aspectBodyB: string;
  readonly aspectKey: string;
}

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

function parseDate(value: string): readonly [number, number, number] | undefined {
  const match = /^(\d{4,6})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return [year, month, day];
}

function toggle(
  kinds: readonly EventSearchKind[],
  kind: EventSearchKind,
  checked: boolean,
): readonly EventSearchKind[] {
  return checked ? [...new Set([...kinds, kind])] : kinds.filter((current) => current !== kind);
}

export function EventSearchView(): React.JSX.Element {
  const t = useMessages(eventSearchViewMessages);
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
    const from = parseDate(parameters.from);
    const to = parseDate(parameters.to);
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

  return (
    <main className="shell">
      <h1>{t.heading}</h1>
      <p>{t.intro}</p>
      <fieldset className="field-group">
        <legend>{t.rangeLegend}</legend>
        <TextField
          label={t.fromLabel}
          value={parameters.from}
          placeholder="YYYY-MM-DD"
          onChange={(from) => {
            patch({ from });
          }}
        />
        <TextField
          label={t.toLabel}
          value={parameters.to}
          placeholder="YYYY-MM-DD"
          onChange={(to) => {
            patch({ to });
          }}
        />
      </fieldset>
      <fieldset className="field-group">
        <legend>{t.eventsLegend}</legend>
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
        <Select
          label={t.aspect}
          value={parameters.aspectKey}
          options={ASPECTS.map((aspect) => ({ value: aspect.key, label: aspect.name }))}
          onChange={(aspectKey) => {
            patch({ aspectKey });
          }}
        />
      </fieldset>
      <p>
        <button type="button" onClick={run} disabled={provider === undefined || result.kind === 'loading'}>
          {t.searchButton}
        </button>
      </p>
      {result.kind === 'loading' && <StatusMessage kind="loading">{t.searching}</StatusMessage>}
      {result.kind === 'error' && <StatusMessage kind="error">{result.message}</StatusMessage>}
      {result.kind === 'ready' && (
        <section aria-live="polite">
          <p>{t.resultCount(String(result.rows.length))}</p>
          <p>
            <button type="button" onClick={download}>
              {t.downloadCsv}
            </button>{' '}
            <button type="button" onClick={downloadIcs}>
              {t.downloadIcs}
            </button>
          </p>
          <div className="data-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.date}</th>
                  <th>{t.kind}</th>
                  <th>{t.event}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={`${row.kind}-${row.jd}-${row.label}`}>
                    <td>{new Date((row.jd - 2440587.5) * 86400000).toISOString().replace('.000Z', 'Z')}</td>
                    <td>{t.kindLabels[row.kind]}</td>
                    <td>{row.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
