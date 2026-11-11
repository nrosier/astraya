/**
 * Graphic ephemeris (#1404): several bodies' ecliptic longitudes over a date range, drawn with the cycle diagram's
 * zodiac laid out against time, with the same values in a table. Independent of any person or stored data (it needs
 * only the ephemeris), so it lives outside `Stored`, like `CyclesView`.
 *
 * The plot is app-generated from just-computed longitudes, never user-supplied markup, and is hidden from assistive
 * tech: the table beside it carries every value it plots.
 */
/**
 * @module GraphicEphemerisView
 * @purpose Renders the Graphic ephemeris tool screen: a selectable date range (one year by default) and body set (the classical seven by default, outer bodies optional), the time plot and a CSV-exportable table of the plotted longitudes.
 * @conventions Thin React over `domain/graphic-ephemeris` (positions from the EphemerisProvider only) and `chart/cycle-diagram` (`renderCycleTimeSeriesSvg`, the one drawing path). Laid out as a tool page (#1051): the form and a legend side by side, the plot and table full width below (`.tool-layout`). The plot is hidden from assistive tech since the table carries every value it plots.
 * @exports GraphicEphemerisView
 */
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { renderCycleTimeSeriesSvg } from '../chart/cycle-diagram.js';
import { DEFAULT_EXTENDED_SETTINGS } from '../chart/extended-settings.js';
import { DEFAULT_RULERSHIP_CHOICE } from '../astrology/rulership.js';
import {
  computeGraphicEphemeris,
  dateTicks,
  defaultRange,
  graphicEphemerisCsv,
  graphicEphemerisCsvFilename,
  GRAPHIC_EPHEMERIS_CLASSICAL_KEYS,
  isoFromDay,
  MAX_SPAN_DAYS,
  orderedBodyKeys,
  parseIsoDay,
  validateRange,
  type GraphicEphemeris,
} from '../domain/graphic-ephemeris.js';
import { useCalculationBasisLine } from './calculation-basis.js';
import { bodyDisplayName } from './astro-names.messages.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { formatAxisMonth, formatCivilDate, formatFixed, formatSignDegree, utcDay } from './format.js';
import { graphicEphemerisViewMessages } from './GraphicEphemerisView.messages.js';
import { GlossaryText } from './GlossaryText.js';
import { useGlyphVariants } from './glyph-variant-setting.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { PageHeader } from './PageHeader.js';
import { Button } from './primitives/Button.js';
import { Tooltip } from './primitives/Tooltip.js';
import { Checkbox } from './primitives/Checkbox.js';
import { DateField } from './primitives/DateField.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { SortableTable, useCsvExports } from './SortableTable.js';
import { useSymbolClass } from './symbol-setting.js';
import type { TableColumn } from './table-sort.js';
import { MAX_EPHEMERIS_YEAR, MIN_EPHEMERIS_YEAR } from './year-range.js';

type Result =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: GraphicEphemeris }
  | { readonly kind: 'error'; readonly message: string };

interface TableRow {
  readonly day: number;
  readonly longitudes: readonly number[];
}

export function GraphicEphemerisView(): React.JSX.Element {
  const t = useMessages(graphicEphemerisViewMessages);
  const basisLine = useCalculationBasisLine(DEFAULT_EXTENDED_SETTINGS, DEFAULT_RULERSHIP_CHOICE);
  const [symbolClass] = useSymbolClass();
  // The plot's markup is cached on these, so a change of symbol form redraws it.
  const [variants] = useGlyphVariants();
  const [locale] = useLocale();
  const { provider } = useEphemerisProvider();
  const initial = useMemo(() => defaultRange(utcDay()), []);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(GRAPHIC_EPHEMERIS_CLASSICAL_KEYS));
  const [validation, setValidation] = useState<string>();
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const runId = useRef(0);

  const nameOf = (key: string): string => bodyDisplayName(key, locale);

  const run = (): void => {
    if (provider === undefined) return;
    const problem = validateRange(start, end);
    if (problem !== undefined) {
      setValidation(
        problem === 'invalid'
          ? t.invalid
          : problem === 'reversed'
            ? t.reversed
            : problem === 'outside-ephemeris'
              ? t.outsideEphemeris(MIN_EPHEMERIS_YEAR, MAX_EPHEMERIS_YEAR)
              : t.tooLong(Math.floor(MAX_SPAN_DAYS / 365)),
      );
      return;
    }
    const keys = orderedBodyKeys(selected);
    if (keys.length === 0) {
      setValidation(t.noBodies);
      return;
    }
    setValidation(undefined);
    const startDay = parseIsoDay(start);
    const endDay = parseIsoDay(end);
    if (startDay === undefined || endDay === undefined) return;
    const id = ++runId.current;
    setResult({ kind: 'loading' });
    void computeGraphicEphemeris(provider, keys, startDay, endDay).then(
      (data) => {
        if (id === runId.current) setResult({ kind: 'ready', data });
      },
      (error: unknown) => {
        if (id === runId.current) {
          setResult({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      },
    );
  };

  // The default year is plotted as soon as the ephemeris is ready, so the screen opens on a result.
  const started = useRef(false);
  const plotOnOpen = useEffectEvent(() => {
    run();
  });
  useEffect(() => {
    if (provider === undefined || started.current) return;
    started.current = true;
    plotOnOpen();
  }, [provider]);

  const toggle = (key: string, on: boolean): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const columns = useMemo<readonly TableColumn<TableRow>[]>(() => {
    if (result.kind !== 'ready') return [];
    const keys = result.data.bodyKeys;
    return [
      { key: 'date', label: t.dateColumn, valueOf: (row) => row.day, render: (row) => isoFromDay(row.day) },
      ...keys.map((key, index): TableColumn<TableRow> => ({
        key,
        label: bodyDisplayName(key, locale),
        valueOf: (row) => row.longitudes[index] ?? 0,
        render: (row) => {
          const longitude = row.longitudes[index];
          return longitude === undefined ? '' : `${formatFixed(longitude, 3)}° (${formatSignDegree(longitude)})`;
        },
      })),
    ];
  }, [result, t, locale]);

  const plot = useMemo(() => {
    if (result.kind !== 'ready' || result.data.rows.length === 0) return undefined;
    const { data } = result;
    const span = Math.max(1, data.endDay - data.startDay);
    return renderCycleTimeSeriesSvg(
      data.bodyKeys.map((key, index) => ({
        key,
        points: data.rows.map((row) => ({
          at: (row.day - data.startDay) / span,
          longitude: row.longitudes[index] ?? 0,
        })),
      })),
      dateTicks(data.startDay, data.endDay).map((tick) => ({
        at: tick.at,
        label: formatAxisMonth(civilOf(tick.day), span > 400, locale),
      })),
    );
    // oxlint-disable-next-line react/exhaustive-deps -- the renderers read the glyph settings from module state, so these are cache keys, not inputs the callback reads.
  }, [result, locale, symbolClass, variants]);

  useCsvExports(
    result.kind === 'ready' && result.data.rows.length > 0
      ? [
          {
            key: 'graphic-ephemeris',
            caption: t.tableCaption,
            filename: graphicEphemerisCsvFilename(result.data),
            csv: () => graphicEphemerisCsv(result.data),
          },
        ]
      : undefined,
  );

  const legendKeys = result.kind === 'ready' ? result.data.bodyKeys : [];

  return (
    <main className="shell">
      <PageHeader title={t.heading} basis={basisLine} basisEditHref={null} headingLevel={2} />
      <p className="hint">
        <GlossaryText text={t.hint} />
      </p>

      <div className="tool-layout">
        <form
          className="tool-card tool-form"
          aria-labelledby="graphic-ephemeris-settings-heading"
          onSubmit={(event) => {
            event.preventDefault();
            run();
          }}
        >
          <h2 id="graphic-ephemeris-settings-heading">
            {t.settingsHeading}
            <Tooltip text={t.rangeHelp} label={t.rangeTooltipLabel} className="primitive-tooltip-icon">
              ?
            </Tooltip>
          </h2>
          <div className="tool-field-row">
            <DateField label={t.startLabel} value={start} onChange={setStart} />
            <DateField label={t.endLabel} value={end} onChange={setEnd} />
          </div>
          <fieldset className="primitive-choice-field">
            <legend className="primitive-field-label">{t.classicalLegend}</legend>
            <div className="primitive-choice-group">
              {GRAPHIC_EPHEMERIS_CLASSICAL_KEYS.map((key) => (
                <Checkbox
                  key={key}
                  label={nameOf(key)}
                  checked={selected.has(key)}
                  onChange={(on) => {
                    toggle(key, on);
                  }}
                />
              ))}
            </div>
          </fieldset>
          {validation !== undefined && <StatusMessage kind="error">{validation}</StatusMessage>}
          <div className="tool-actions">
            <Button
              type="submit"
              variant="primary"
              disabled={provider === undefined}
              busy={result.kind === 'loading'}
              busyLabel={t.plotting}
            >
              {t.plotButton}
            </Button>
          </div>
        </form>

        <aside className="tool-card tool-panel" aria-labelledby="graphic-ephemeris-legend-heading">
          <h2 id="graphic-ephemeris-legend-heading">{t.summaryHeading}</h2>
          <div className="tool-panel-body" aria-busy={result.kind === 'loading'}>
            {result.kind === 'loading' && <p className="hint">{t.plotting}</p>}
            {result.kind === 'ready' && (
              <p className="tool-panel-figure">
                {t.summary(
                  result.data.rows.length,
                  result.data.bodyKeys.length,
                  formatCivilDate(civilOf(result.data.startDay), locale),
                  formatCivilDate(civilOf(result.data.endDay), locale),
                )}
              </p>
            )}
            <ul className="graphic-ephemeris-legend">
              {legendKeys.map((key) => (
                <li key={key}>
                  <span className={`graphic-ephemeris-swatch graphic-ephemeris-swatch-${key}`} aria-hidden="true" />
                  {nameOf(key)}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {result.kind === 'error' && <StatusMessage kind="error">{t.error(result.message)}</StatusMessage>}

      <div aria-busy={result.kind === 'loading'}>
        {result.kind === 'ready' && plot !== undefined && (
          <section className="tool-card" aria-labelledby="graphic-ephemeris-plot-heading">
            <h2 id="graphic-ephemeris-plot-heading">{t.plotHeading}</h2>
            <figure className="cycle-figure">
              {/* Hidden from assistive technology: the table below carries every value the plot draws. */}
              <div className="graphic-ephemeris-plot" aria-hidden="true" dangerouslySetInnerHTML={{ __html: plot }} />
              <figcaption className="hint">{t.plotCaption}</figcaption>
            </figure>
          </section>
        )}
        {result.kind === 'ready' && result.data.rows.length > 0 && (
          <SortableTable
            caption={t.tableCaption}
            columns={columns}
            rows={result.data.rows}
            getRowKey={(row) => String(row.day)}
            downloadFilename={graphicEphemerisCsvFilename(result.data)}
          />
        )}
      </div>
    </main>
  );
}

function civilOf(day: number): { readonly year: number; readonly month: number; readonly day: number } {
  const date = new Date(day * 86_400_000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
