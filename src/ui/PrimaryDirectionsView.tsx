/**
 * Primary directions for one person (#407), as of a chosen date or age.
 *
 * Its own screen rather than an option on `SolarArcView.tsx`: a primary direction has a
 * significator, a promissor and an arc in right ascension, none of which a solar-arc contact has,
 * and the list runs over a whole lifetime rather than one date. The date and the age are two ways
 * of setting the same moment — typing an age moves the date, picking a date shows the age.
 *
 * The bi-wheel is drawn with `renderMultiWheelSvg` directly, the way `TransitView.tsx` draws its
 * own: natal innermost, the chart directed to the chosen age outside it. It carries no cross-ring
 * lines — the tables carry the directions, and two of the four significators are angles, which a
 * cross-ring line (body to body) cannot reach.
 *
 * Needs a known birth time, the same gate every angle-dependent screen here uses.
 */
/**
 * @module PrimaryDirectionsView
 * @purpose Primary directions screen for one person: time-key picker, date and age inputs kept in step, natal/directed bi-wheel at the chosen age, the directions active at that age and the full lifetime list sorted by age.
 * @conventions Gated for unknown birth time like other angle-dependent screens; draws the bi-wheel with renderMultiWheelSvg directly (no cross-ring lines), injected as app-generated SVG the same way TransitView.tsx does; uses PrimaryDirectionsView.messages.ts for en/nl text via useMessages().
 * @exports PrimaryDirectionsView
 */
import { GlossaryTerms } from './GlossaryTerm.js';
import { personHref } from './route.js';
import { useEffect, useMemo, useState } from 'react';
import { ageInYears, TROPICAL_YEAR_DAYS } from '../astrology/progressions.js';
import { renderMultiWheelSvg, type WheelRingInput } from '../chart/multi-wheel.js';
import { chartWheelRing } from '../domain/chart-tables.js';
import { deriveExportFilename } from '../domain/export-filename.js';
import {
  PrimaryDirectionKey,
  PRIMARY_DIRECTION_ANGLE_KEYS,
  PRIMARY_DIRECTION_PROMISSORS,
  PRIMARY_DIRECTION_SIGNIFICATORS,
  activeDirections,
  ageToArc,
  directedChartAt,
  generatePrimaryDirections,
  type DirectedChart,
  type PrimaryDirection,
  type PrimaryDirectionsData,
} from '../domain/primary-directions.js';
import { civilFromJulianDay } from '../time/julian.js';
import { momentKey } from '../time/encode.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { formatFixed, todayInputValue } from './format.js';
import { useGlyphVariants } from './glyph-variant-setting.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { primaryDirectionsViewMessages } from './PrimaryDirectionsView.messages.js';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { DateField } from './primitives/DateField.js';
import { NumberField } from './primitives/NumberField.js';
import { SortableTable } from './SortableTable.js';
import { useStoreState } from './store-context.js';
import { useSymbolClass } from './symbol-setting.js';
import type { TableColumn } from './table-sort.js';
import type { Locale } from '../interpretation/schema.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { Checkbox } from './primitives/Checkbox.js';
import type { PrimaryDirectionMethod, PrimaryDirectionMode } from '../astrology/primary-directions.js';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: PrimaryDirectionsData }
  | { readonly kind: 'error'; readonly message: string };

type DirectedLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'before-birth'; readonly ageYears: number }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'ready'; readonly chart: DirectedChart }
  | { readonly kind: 'error'; readonly message: string };

type Messages = typeof primaryDirectionsViewMessages.en;

interface HitRow {
  readonly id: string;
  readonly significatorKey: string;
  readonly promissorKey: string;
  readonly aspectKey: string;
  readonly aspectOffset: number;
  readonly arc: number;
  readonly age: number;
}

function toHitRow(hit: PrimaryDirection): HitRow {
  return {
    id: `${hit.significator}-${hit.promissor}-${String(hit.aspectOffset)}`,
    significatorKey: hit.significator,
    promissorKey: hit.promissor,
    aspectKey: hit.aspect,
    aspectOffset: hit.aspectOffset,
    arc: hit.arcRA,
    age: hit.ageYears,
  };
}

/** "dexter square", "conjunction", … — the side named for the three aspects that have two. */
function aspectPhrase(row: HitRow, t: Messages, locale: Locale): string {
  const name = aspectDisplayName(row.aspectKey, locale).toLocaleLowerCase(locale);
  if (row.aspectOffset === 0 || row.aspectOffset === 180) return name;
  return row.aspectOffset > 0 ? t.sinister(name) : t.dexter(name);
}

function describe(row: HitRow, t: Messages, locale: Locale): string {
  return t.description(
    bodyDisplayName(row.significatorKey, locale),
    aspectPhrase(row, t, locale),
    bodyDisplayName(row.promissorKey, locale),
  );
}

function hitColumns(t: Messages, locale: Locale): readonly TableColumn<HitRow>[] {
  return [
    {
      key: 'significator',
      label: t.significatorLabel,
      valueOf: (row) => bodyDisplayName(row.significatorKey, locale),
    },
    {
      key: 'promissor',
      label: t.promissorLabel,
      valueOf: (row) => bodyDisplayName(row.promissorKey, locale),
    },
    { key: 'arc', label: t.arcLabel, valueOf: (row) => row.arc, render: (row) => `${formatFixed(row.arc, 2)}°` },
    { key: 'age', label: t.ageColumnLabel, valueOf: (row) => row.age, render: (row) => formatFixed(row.age, 2) },
    { key: 'description', label: t.descriptionLabel, valueOf: (row) => describe(row, t, locale) },
  ];
}

function dateInputValue(jd: number): string {
  const civil = civilFromJulianDay(jd);
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  return `${pad(civil.year, 4)}-${pad(civil.month)}-${pad(civil.day)}`;
}

export function PrimaryDirectionsView({ personId }: { personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const t = useMessages(primaryDirectionsViewMessages);
  const [locale] = useLocale();
  const { provider } = useEphemerisProvider();
  const [asOf, setAsOf] = useState(todayInputValue);
  // What the user is typing into the age field, kept as typed until it loses focus so the
  // field is not reformatted under the caret; undefined shows the age the date implies.
  const [ageDraft, setAgeDraft] = useState<string | undefined>(undefined);
  const [key, setKey] = useState<PrimaryDirectionKey>(PrimaryDirectionKey.NAIBOD);
  const [mode, setMode] = useState<PrimaryDirectionMode>('direct');
  const [method, setMethod] = useState<PrimaryDirectionMethod>('zodiacal');
  const [significators, setSignificators] = useState<readonly string[]>(PRIMARY_DIRECTION_SIGNIFICATORS);
  const [promissors, setPromissors] = useState<readonly string[]>(PRIMARY_DIRECTION_PROMISSORS);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [directed, setDirected] = useState<DirectedLoad>({ kind: 'loading' });

  const targetDate = useMemo(() => {
    const [year, month, day] = asOf.split('-').map(Number);
    return year !== undefined && month !== undefined && day !== undefined ? { year, month, day } : undefined;
  }, [asOf]);

  useEffect(() => {
    if (person?.moment === undefined || provider === undefined) return undefined;
    const moment = person.moment;
    const effect = { cancelled: false };
    setLoad({ kind: 'loading' });

    void (async () => {
      try {
        const data = await generatePrimaryDirections(moment, provider, key, undefined, {
          mode,
          method,
          significators,
          promissors,
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
  }, [momentKey(person?.moment), provider, key, method, mode, promissors, significators]);

  useEffect(() => {
    if (load.kind !== 'ready' || !load.data.defined || provider === undefined || targetDate === undefined) {
      return undefined;
    }
    const data = load.data;
    if (data.mode === 'converse') {
      setDirected({ kind: 'unavailable' });
      return undefined;
    }
    const effect = { cancelled: false };
    setDirected({ kind: 'loading' });

    void (async () => {
      try {
        // Noon, as every other "as of" screen here: a date picker names a day, not a moment.
        // `julianDay` rather than `julianDayFromUtc`, since most ages worth directing to fall
        // before 1972, when UTC began.
        const targetJd = await provider.julianDay(targetDate.year, targetDate.month, targetDate.day, 12);
        const age = ageInYears(data.natalJd, targetJd);
        if (age < 0) {
          if (!effect.cancelled) setDirected({ kind: 'before-birth', ageYears: age });
          return;
        }
        const chart = await directedChartAt(data, age, provider);
        if (!effect.cancelled) setDirected({ kind: 'ready', chart });
      } catch (error) {
        if (!effect.cancelled)
          setDirected({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      effect.cancelled = true;
    };
  }, [load, provider, targetDate]);

  const [symbolClass] = useSymbolClass();
  // The wheel's markup is cached on these, so a change of symbol form redraws it.
  const [variants] = useGlyphVariants();
  const wheelMarkup = useMemo(() => {
    if (load.kind !== 'ready' || directed.kind !== 'ready') return undefined;
    const natalRing = chartWheelRing(load.data.natal, t.natalRingLabel);
    const directedRing: WheelRingInput = {
      label: t.directedRingLabel,
      houses: directed.chart.houses,
      bodies: directed.chart.positions,
    };
    return renderMultiWheelSvg([natalRing, directedRing]);
  }, [load, directed, t, symbolClass, variants]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (person.moment === undefined) {
    return (
      <main className="shell">
        <p className="back">
          <a href={personHref(personId)}>&larr; {person.displayName || t.personFallback}</a>
        </p>
        <h1>{t.primaryDirectionsFallback}</h1>
        <p>
          {t.notCompletePrimaryDirections(person.displayName || t.thisPerson)}{' '}
          <a href={personHref(personId)}>{t.personPageLink}</a>.
        </p>
      </main>
    );
  }

  if (person.timeAccuracy === 'unknown') {
    return (
      <main className="shell">
        <p className="back">
          <a href={personHref(personId)}>&larr; {person.displayName || t.personFallback}</a>
        </p>
        <h1>{t.primaryDirectionsFallback}</h1>
        <p>{t.needsKnownTime(person.displayName || t.thisPerson)}</p>
      </main>
    );
  }

  const data = load.kind === 'ready' ? load.data : undefined;
  const shownAge = directed.kind === 'ready' ? directed.chart.ageYears : undefined;
  const allRows = data?.hits.map(toHitRow);
  const activeRows =
    data !== undefined && shownAge !== undefined ? activeDirections(data.hits, shownAge).map(toHitRow) : undefined;
  const columns = hitColumns(t, locale);

  return (
    <main className="shell">
      <p className="back">
        <a href={personHref(personId)}>&larr; {person.displayName || t.personFallback}</a>
      </p>
      <h1>{person.displayName ? t.heading(person.displayName) : t.primaryDirectionsFallback}</h1>
      <GlossaryTerms terms={['primaryDirection', 'ascendant', 'midheaven']} />
      <p className="hint">{t.hint}</p>
      <p className="hint">{t.source}</p>

      <div className="field-grid">
        <ChoiceGroup
          label={t.keyLabel}
          value={key}
          options={[
            { value: PrimaryDirectionKey.NAIBOD, label: t.naibodKey },
            { value: PrimaryDirectionKey.PTOLEMY, label: t.ptolemyKey },
          ]}
          onChange={(value) => {
            setKey(value === PrimaryDirectionKey.PTOLEMY ? PrimaryDirectionKey.PTOLEMY : PrimaryDirectionKey.NAIBOD);
          }}
        />
        <ChoiceGroup
          label={t.modeLabel}
          value={mode}
          options={[
            { value: 'direct', label: t.directMode },
            { value: 'converse', label: t.converseMode },
          ]}
          onChange={(value) => {
            setMode(value === 'converse' ? 'converse' : 'direct');
          }}
        />
        <ChoiceGroup
          label={t.methodLabel}
          value={method}
          options={[
            { value: 'zodiacal', label: t.zodiacalMethod },
            { value: 'in-mundo', label: t.inMundoMethod },
          ]}
          onChange={(value) => {
            setMethod(value === 'in-mundo' ? 'in-mundo' : 'zodiacal');
          }}
        />
        <fieldset>
          <legend>{t.significatorsPickerLabel}</legend>
          {PRIMARY_DIRECTION_ANGLE_KEYS.map((option) => (
            <Checkbox
              key={option}
              label={t.angleLabels[option]}
              checked={significators.includes(option)}
              onChange={() => {
                setSignificators((current) =>
                  current.includes(option)
                    ? current.length === 1
                      ? current
                      : current.filter((value) => value !== option)
                    : [...current, option],
                );
              }}
            />
          ))}
          {PRIMARY_DIRECTION_PROMISSORS.map((option) => (
            <Checkbox
              key={option}
              label={bodyDisplayName(option, locale)}
              checked={significators.includes(option)}
              onChange={() => {
                setSignificators((current) =>
                  current.includes(option)
                    ? current.length === 1
                      ? current
                      : current.filter((value) => value !== option)
                    : [...current, option],
                );
              }}
            />
          ))}
        </fieldset>
        <fieldset>
          <legend>{t.promissorsPickerLabel}</legend>
          {PRIMARY_DIRECTION_PROMISSORS.map((option) => (
            <Checkbox
              key={option}
              label={bodyDisplayName(option, locale)}
              checked={promissors.includes(option)}
              onChange={() => {
                setPromissors((current) =>
                  current.includes(option)
                    ? current.length === 1
                      ? current
                      : current.filter((value) => value !== option)
                    : [...current, option],
                );
              }}
            />
          ))}
        </fieldset>
        <DateField
          label={t.asOfLabel}
          value={asOf}
          onChange={(value) => {
            setAsOf(value);
          }}
        />
        <NumberField
          label={t.ageLabel}
          value={ageDraft ?? (shownAge === undefined ? '' : formatFixed(shownAge, 2))}
          min={0}
          step={0.1}
          disabled={data === undefined}
          onChange={(typed) => {
            setAgeDraft(typed);
            const age = Number(typed);
            if (data === undefined || typed === '' || !Number.isFinite(age) || age < 0) return;
            setAsOf(dateInputValue(data.natalJd + age * TROPICAL_YEAR_DAYS));
          }}
          onBlur={() => {
            setAgeDraft(undefined);
          }}
        />
      </div>

      {load.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}

      {load.kind === 'error' && <StatusMessage kind="error">{t.error(load.message)}</StatusMessage>}

      {data !== undefined && !data.defined && <StatusMessage kind="error">{t.undefinedAtLatitude}</StatusMessage>}

      {data?.defined === true && (
        <>
          {directed.kind === 'loading' && <StatusMessage kind="loading">{t.calculating}</StatusMessage>}
          {directed.kind === 'error' && <StatusMessage kind="error">{t.error(directed.message)}</StatusMessage>}
          {directed.kind === 'before-birth' && <p className="hint">{t.beforeBirth}</p>}
          {directed.kind === 'unavailable' && <p className="hint">{t.converseWheelUnavailable}</p>}

          {directed.kind === 'ready' && (
            <>
              <p className="hint">{t.ageLine(formatFixed(directed.chart.ageYears, 2))}</p>
              <p className="hint">{t.arcLine(formatFixed(ageToArc(directed.chart.ageYears, data.key), 2))}</p>
              {wheelMarkup !== undefined && (
                // App-generated SVG from just-computed chart data, never user-supplied markup —
                // the same trust boundary ChartView.tsx's sheet markup is injected under.
                <div className="chart-wheel" aria-hidden="true" dangerouslySetInnerHTML={{ __html: wheelMarkup }} />
              )}
            </>
          )}

          {activeRows !== undefined && activeRows.length > 0 && (
            <SortableTable
              caption={t.activeCaption(String(data.orb))}
              columns={columns}
              rows={activeRows}
              getRowKey={(row) => row.id}
              downloadFilename={deriveExportFilename(person.displayName, 'primary-directions-active', 'csv')}
            />
          )}
          {activeRows?.length === 0 && <p className="hint">{t.noActive}</p>}

          {allRows !== undefined && allRows.length > 0 && (
            <SortableTable
              caption={t.allCaption}
              columns={columns}
              rows={allRows}
              getRowKey={(row) => row.id}
              downloadFilename={deriveExportFilename(person.displayName, 'primary-directions', 'csv')}
            />
          )}
          {allRows?.length === 0 && <p className="hint">{t.noDirections}</p>}
        </>
      )}
    </main>
  );
}
