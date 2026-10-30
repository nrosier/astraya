/**
 * Eclipses (#404): the solar and lunar eclipses in a span of years, each placed in the zodiac,
 * and — for a chosen person — which of their natal points each one touches. Lives inside
 * `Stored` because the person list comes from the local store; the search itself needs only the
 * ephemeris.
 */
/**
 * @module EclipsesView
 * @purpose Renders the Eclipses tool screen: solar/lunar eclipses over a span of years, each placed in the zodiac, and (for a chosen person) which of their natal points each eclipse touches.
 * @conventions Lives inside `Stored` because the person picker reads the local store, though the eclipse search itself needs only the ephemeris. Text comes from co-located `EclipsesView.messages.ts` via `useMessages()`.
 * @exports EclipsesView
 */
import { GlossaryTerms } from './GlossaryTerm.js';
import { formatOrb } from './format.js';
import { Select } from './primitives/Select.js';
import { TextField } from './primitives/TextField.js';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { bodyById } from '../astrology/bodies.js';
import { eclipseContacts, findEclipses, type Eclipse, type NatalPoint } from '../astrology/eclipses.js';
import { computeChartData } from '../domain/chart-compute.js';
import { ordered } from './people-list.js';
import { aspectDisplayName, bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { eclipseRows, MAX_ECLIPSE_SPAN_YEARS, type EclipseRow } from './eclipses.js';
import { eclipsesViewMessages } from './EclipsesView.messages.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { SortableTable } from './SortableTable.js';
import { useStoreState } from './store-context.js';
import type { TableColumn } from './table-sort.js';
import { clampEphemerisYear, MAX_EPHEMERIS_YEAR, MIN_EPHEMERIS_YEAR } from './year-range.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { BackLink } from './BackLink.js';

type Result =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly rows: readonly EclipseRow[];
      readonly fromYear: number;
      readonly toYear: number;
      /** Set when a person was chosen but their ASC/MC had to be left out. */
      readonly anglesLeftOut: boolean;
    }
  | { readonly kind: 'error'; readonly message: string };

export function EclipsesView(): React.JSX.Element {
  const t = useMessages(eclipsesViewMessages);
  const [locale] = useLocale();
  const state = useStoreState();
  const { provider } = useEphemerisProvider();
  const thisYear = new Date().getUTCFullYear();
  const [fromYear, setFromYear] = useState(String(thisYear - 1));
  const [toYear, setToYear] = useState(String(thisYear + 3));
  const [personId, setPersonId] = useState('');
  const [validation, setValidation] = useState<string>();
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const runId = useRef(0);

  const people = useMemo(() => ordered(state.people), [state.people]);

  const run = (): void => {
    if (provider === undefined) return;
    setValidation(undefined);
    const from = clampEphemerisYear(fromYear);
    const to = clampEphemerisYear(toYear);
    if (from === undefined || to === undefined) {
      setValidation(t.badYear(MIN_EPHEMERIS_YEAR, MAX_EPHEMERIS_YEAR));
      return;
    }
    if (to < from) {
      setValidation(t.yearsReversed);
      return;
    }
    if (to - from + 1 > MAX_ECLIPSE_SPAN_YEARS) {
      setValidation(t.spanTooLong(MAX_ECLIPSE_SPAN_YEARS));
      return;
    }
    const person = personId === '' ? undefined : state.people.get(personId);
    if (personId !== '' && person?.moment === undefined) {
      setValidation(t.noBirthRecord((person?.displayName ?? '') || t.unnamedPerson));
      return;
    }
    const id = ++runId.current;
    setResult({ kind: 'loading' });
    void (async () => {
      try {
        const fromJd = await provider.julianDayFromUtc(from, 1, 1, 0, 0, 0);
        const toJd = await provider.julianDayFromUtc(to + 1, 1, 1, 0, 0, 0);
        const eclipses: readonly Eclipse[] = await findEclipses(provider, fromJd, toJd);

        let points: readonly NatalPoint[] = [];
        let anglesLeftOut = false;
        if (person?.moment !== undefined) {
          const chart = await computeChartData(person.moment, provider);
          const bodies = chart.positions.flatMap((position) => {
            const key = bodyById(position.body)?.key;
            return key === undefined ? [] : [{ key, longitude: position.longitude }];
          });
          // An unknown birth time makes the Ascendant and Midheaven meaningless, not approximate.
          anglesLeftOut = person.timeAccuracy === 'unknown';
          points = anglesLeftOut
            ? bodies
            : [
                ...bodies,
                { key: 'asc', longitude: chart.houses.ascendant },
                { key: 'mc', longitude: chart.houses.midheaven },
              ];
        }
        if (id !== runId.current) return;
        setResult({
          kind: 'ready',
          rows: eclipseRows(eclipses, (eclipse) => eclipseContacts(eclipse, points)),
          fromYear: from,
          toYear: to,
          anglesLeftOut,
        });
      } catch (error) {
        if (id === runId.current) {
          setResult({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      }
    })();
  };

  // Opens on a result: the default span is searched as soon as the ephemeris is ready. An effect event, so the
  // search reads the span as it is then and the effect itself depends on the provider alone.
  const started = useRef(false);
  const searchOnOpen = useEffectEvent(run);
  useEffect(() => {
    if (provider === undefined || started.current) return;
    started.current = true;
    searchOnOpen();
  }, [provider]);

  const typeOf = useCallback(
    (row: EclipseRow): string => {
      const family = t.families[row.family];
      const kind =
        row.family === 'solar'
          ? t.solarKinds[row.kind as keyof typeof t.solarKinds]
          : t.lunarKinds[row.kind as keyof typeof t.lunarKinds];
      return `${family} — ${kind.toLowerCase()}`;
    },
    [t],
  );

  const columns = useMemo<readonly TableColumn<EclipseRow>[]>(
    () => [
      { key: 'date', label: t.dateColumn, valueOf: (row) => row.jd, render: (row) => row.date },
      { key: 'type', label: t.typeColumn, valueOf: (row) => typeOf(row), render: (row) => typeOf(row) },
      {
        key: 'position',
        label: t.positionColumn,
        valueOf: (row) => row.longitude,
        render: (row) => `${signDisplayName(row.signName, locale)} ${row.position}`,
      },
      {
        key: 'contacts',
        label: t.contactsColumn,
        valueOf: (row) => row.contacts.length,
        render: (row) =>
          row.contacts.length === 0
            ? t.none
            : row.contacts
                .map((contact) =>
                  t.contact(
                    bodyDisplayName(contact.pointKey, locale),
                    aspectDisplayName(contact.kind, locale),
                    formatOrb(contact.orb),
                  ),
                )
                .join('; '),
      },
    ],
    [t, locale, typeOf],
  );

  return (
    <main className="shell">
      <BackLink fallback="#/people" />
      <h1>{t.heading}</h1>
      <GlossaryTerms terms={['eclipse', 'aspect', 'houses']} />
      <p className="hint">{t.hint}</p>

      <div className="field-grid">
        <TextField label={t.fromYearLabel} inputMode="numeric" value={fromYear} onChange={setFromYear} />
        <TextField label={t.toYearLabel} inputMode="numeric" value={toYear} onChange={setToYear} />
        <Select
          label={t.personLabel}
          value={personId}
          options={[
            { value: '', label: t.personNone },
            ...people.map((person) => ({ value: person.id, label: person.displayName || t.unnamedPerson })),
          ]}
          onChange={setPersonId}
        />
      </div>
      <p>
        <button type="button" disabled={provider === undefined || result.kind === 'loading'} onClick={run}>
          {result.kind === 'loading' ? t.finding : t.findButton}
        </button>
      </p>

      {validation !== undefined && <StatusMessage kind="error">{validation}</StatusMessage>}
      {/* The result region: busy while the eclipses (re)calculate, as the Astrocartography map is. */}
      <div aria-busy={result.kind === 'loading'}>
        {result.kind === 'error' && <StatusMessage kind="error">{t.error(result.message)}</StatusMessage>}

        {result.kind === 'ready' &&
          (result.rows.length === 0 ? (
            <p className="hint">{t.noEclipses}</p>
          ) : (
            <>
              <p>{t.summary(result.rows.length, result.fromYear, result.toYear)}</p>
              {result.anglesLeftOut && <p className="hint">{t.anglesNote}</p>}
              <SortableTable
                caption={t.tableCaption}
                columns={columns}
                rows={result.rows}
                getRowKey={(row) => row.id}
                downloadFilename={`eclipses-${String(result.fromYear)}-${String(result.toYear)}.csv`}
              />
            </>
          ))}
      </div>
    </main>
  );
}
