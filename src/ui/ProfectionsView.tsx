/**
 * Annual and monthly profections for one person (#168), computed as of a chosen date.
 *
 * Profections rotate the natal Ascendant, so — same as `ChartView.tsx`'s houses/angles
 * tables — this whole screen is meaningless for a person whose birth time is unknown and
 * is gated the same way (`showHouses` there, `personReady` here).
 *
 * "As of" defaults to today because that is the question profections are usually asked to
 * answer ("whose year is it right now"), but any date works — including one before birth,
 * which comes back as a negative age rather than an error (`computeProfections`'s own doc
 * comment). The date input is a plain civil date at noon local, converted through the same
 * `julianDayFromUtc` the engine uses everywhere else a picked date becomes a Julian day.
 */
import { useEffect, useMemo, useState } from 'react';
import { resolvePlacementText } from '../interpretation/compose.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { bodyById } from '../astrology/bodies.js';
import { degreeParts } from '../domain/chart-tables.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import { computeProfections, type ProfectedPeriod, type ProfectionData } from '../domain/profections.js';
import { bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { todayInputValue } from './format.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { RulershipSetting } from './RulershipSetting.js';
import { useRulershipChoice } from './rulership-setting.js';
import { momentKey } from '../time/encode.js';
import { PersonNotFound } from './PersonNotFound.js';
import { profectionsViewMessages } from './ProfectionsView.messages.js';
import { SortableTable } from './SortableTable.js';
import { useStoreState } from './store-context.js';
import type { TableColumn } from './table-sort.js';
import type { CorpusEntry, Locale } from '../interpretation/schema.js';
import { ordinal } from './placement-label.js';
import { wheelCorpus } from './wheel-corpus.js';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: ProfectionData }
  | { readonly kind: 'error'; readonly message: string };

interface ProfectionRow {
  readonly period: string;
  readonly sign: string;
  readonly degree: number;
  readonly minute: number;
  readonly second: number;
  readonly ruler: string;
  readonly rulerKey: string;
  /** The second lord, under Both (#426). */
  readonly coRulerKey?: string;
}

function toRow(period: string, profected: ProfectedPeriod): ProfectionRow {
  const parts = degreeParts(profected.longitude);
  const ruler = bodyById(profected.ruler);
  const coRuler = profected.coRuler === undefined ? undefined : bodyById(profected.coRuler);
  return {
    period,
    ...parts,
    ruler: ruler?.name ?? String(profected.ruler),
    rulerKey: ruler?.key ?? String(profected.ruler),
    ...(coRuler === undefined ? {} : { coRulerKey: coRuler.key }),
  };
}

function columns(t: typeof profectionsViewMessages.en, locale: Locale): readonly TableColumn<ProfectionRow>[] {
  return [
    { key: 'period', label: t.periodLabel, valueOf: (row) => row.period },
    {
      key: 'sign',
      label: t.signLabel,
      valueOf: (row) => row.sign,
      render: (row) => signDisplayName(row.sign, locale),
    },
    { key: 'degree', label: t.degLabel, valueOf: (row) => row.degree },
    { key: 'minute', label: t.minLabel, valueOf: (row) => row.minute },
    { key: 'second', label: t.secLabel, valueOf: (row) => row.second },
    {
      key: 'ruler',
      label: t.lordLabel,
      valueOf: (row) => row.ruler,
      render: (row) =>
        bodyDisplayName(row.rulerKey, locale) +
        (row.coRulerKey === undefined ? '' : ` + ${bodyDisplayName(row.coRulerKey, locale)}`),
    },
  ];
}

export function ProfectionsView({ personId }: { personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const t = useMessages(profectionsViewMessages);
  const [locale] = useLocale();
  const [asOf, setAsOf] = useState(todayInputValue);
  const { provider } = useEphemerisProvider();
  const [rulership] = useRulershipChoice();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  // The reviewed text of each profected house (#427): the mechanical sentence until it arrives.
  const [corpus, setCorpus] = useState<readonly CorpusEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    wheelCorpus(locale).then(
      (loaded) => {
        if (!cancelled) setCorpus(loaded);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const targetDate = useMemo(() => {
    const [year, month, day] = asOf.split('-').map(Number);
    return year !== undefined && month !== undefined && day !== undefined ? { year, month, day } : undefined;
  }, [asOf]);

  useEffect(() => {
    if (person?.moment === undefined || provider === undefined || targetDate === undefined) return undefined;
    const moment = person.moment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        // Noon, not midnight: a date picker names a day, not a moment, and noon keeps the
        // civil day intact under any timezone offset the target's own calculation might
        // apply — midnight on a date near a DST/offset boundary can round to the day before.
        const targetJd = await provider.julianDayFromUtc(targetDate.year, targetDate.month, targetDate.day, 12, 0, 0);
        const data = await computeProfections(moment, targetJd, provider, { rulership });
        if (!effect.cancelled) setLoad({ kind: 'ready', data });
      } catch (error) {
        if (!effect.cancelled)
          setLoad({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [momentKey(person?.moment), provider, targetDate, rulership]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (person.moment === undefined) {
    return (
      <main className="shell">
        <p className="back">
          <a href={`#/person/${personId}`}>&larr; {person.displayName || t.personFallback}</a>
        </p>
        <h1>{t.profectionsFallback}</h1>
        <p>
          {t.notCompleteProfections(person.displayName || t.thisPerson)}{' '}
          <a href={`#/person/${personId}`}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  if (person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <p className="back">
          <a href={`#/person/${personId}`}>&larr; {person.displayName || t.personFallback}</a>
        </p>
        <h1>{t.profectionsFallback}</h1>
        <p>{t.needsKnownTime(person.displayName || t.thisPerson)}</p>
      </main>
    );
  }

  const rows =
    load.kind === 'ready' ? [toRow(t.yearPeriod, load.data.year), toRow(t.monthPeriod, load.data.month)] : undefined;

  return (
    <main className="shell">
      <p className="back">
        <a href={`#/person/${personId}`}>&larr; {person.displayName || t.personFallback}</a>
      </p>
      <h1>{person.displayName ? t.heading(person.displayName) : t.profectionsFallback}</h1>
      <p className="hint">{t.hint}</p>

      <section className="profections-rulers-section" aria-labelledby="rulers-heading">
        <h2 id="rulers-heading">{t.rulersHeading}</h2>
        <RulershipSetting />
        <p className="profections-rulers-description">
          {rulership === 'traditional' && t.rulersTraditional}
          {rulership === 'modern' && t.rulersModern}
          {rulership === 'both' && t.rulersBoth}
        </p>
      </section>

      <p>
        <label>
          {t.asOfLabel}{' '}
          <input
            type="date"
            value={asOf}
            onChange={(event) => {
              setAsOf(event.target.value);
            }}
          />
        </label>
      </p>

      {load.kind === 'loading' && <p className="status">{t.calculating}</p>}

      {load.kind === 'error' && (
        <p className="warning" role="alert">
          {t.error(load.message)}
        </p>
      )}

      {load.kind === 'ready' && (
        <>
          <p className="hint">
            {t.ageLine(`${load.data.age.toFixed(2)}${load.data.age < 0 ? ` ${t.beforeBirth}` : ''}`)}
          </p>
          {rows !== undefined && (
            <SortableTable
              caption={t.profectionsCaption}
              columns={columns(t, locale)}
              rows={rows}
              getRowKey={(row) => row.period}
              downloadFilename={deriveExportFilename(person.displayName, 'profections', 'csv')}
            />
          )}
          <section className="profection-meanings" aria-labelledby="profection-meanings-heading">
            <h2 id="profection-meanings-heading">{t.meaningHeading}</h2>
            {[
              { period: t.yearPeriod, house: load.data.year.house },
              { period: t.monthPeriod, house: load.data.month.house },
            ].map(({ period, house }) => (
              <div key={period}>
                <h3>{t.periodHouse(period, ordinal(house, locale))}</h3>
                <p>{resolvePlacementText({ category: 'profected-house', house }, locale, corpus)}</p>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
