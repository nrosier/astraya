/**
 * @module ui/TimingTimelineGantt
 * @purpose The timing timeline's Gantt chart (#1237): one labelled row per technique over the shared date axis, a bar for each period, a tick for each point event, an orb window as a bar with its exact date marked and its pass number labelled (#1401), and a vertical line at the target date.
 * @conventions Drawn as one small SVG per row (viewBox 0 0 1000 24, stretched to the row's width, strokes non-scaling) beside an HTML label, so the track names and the year labels stay readable at any width. Colours are tokens only: each row carries its technique colour as `--tech` (#1442), the target date is in the solar colour. A bar's white label is HTML laid over the stretched SVG, drawn only when the bar is wide enough and clipped to it. The chart is a picture of the events the table below it lists, so each row is an image with a name that counts its events and each bar carries a title; the table is the text equivalent. No calculation: positions come from `timeline-gantt.ts`.
 * @exports TimingTimelineGantt
 */
import type { JulianDayUT } from '../ephemeris/types.js';
import type { TimingTimelineEvent, TimingTimelineTrack } from '../domain/timing-timeline.js';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  BAR_GAP_PX,
  barSpan,
  visibleBarLabels,
  forecastBand,
  ganttFraction,
  techniqueColorVar,
  thinYearTicks,
  yearTicks,
  type GanttRow,
} from './timeline-gantt.js';

/** Neighbouring year labels keep at least this many label font sizes between their centres (a four-digit year is about 2.4 wide, so 3 leaves a gap). */
const TICK_SEPARATION_EM = 3;
const WIDTH = 1000;
const HEIGHT = 24;
/** A bar never draws narrower than this many viewBox units, so a short period is still a visible mark. */
const MIN_BAR = 3;

export interface TimingTimelineGanttProps {
  readonly rows: readonly GanttRow[];
  readonly fromJd: JulianDayUT;
  readonly toJd: JulianDayUT;
  readonly targetJd: JulianDayUT;
  /** Names the whole chart, e.g. the shared-axis sentence. */
  readonly label: string;
  readonly trackLabels: Readonly<Record<TimingTimelineTrack, string>>;
  /** A row's accessible name, e.g. "Firdaria: 3 events". */
  readonly rowLabel: (track: string, count: number) => string;
  /** One event in words with its dates, for the bar's title. */
  readonly describe: (event: TimingTimelineEvent) => string;
  /** The short name drawn inside a wide bar, e.g. "From Fortune: Leo, ruled by Sun". */
  readonly barLabel: (event: TimingTimelineEvent) => string;
  /** A pass number as the short label beside an orb window's exact mark, e.g. "2/3". */
  readonly passLabel: (number: number, count: number) => string;
  /** The accessible label of the forecast band, given how many transits it covers (#1442). */
  readonly bandLabel: (count: number) => string;
  /** The target date in words, for the line's title. */
  readonly targetTitle: string;
  /** The event the pointer or focus is on (a bar or its table row), or `undefined` (#1442). The other bars dim to 20%. */
  readonly hoveredKey?: string | undefined;
  /** The selected event; its bar is ringed. */
  readonly selectedKey?: string | undefined;
  readonly onHover?: ((key: string | undefined) => void) | undefined;
  readonly onSelect?: ((key: string) => void) | undefined;
}

export function TimingTimelineGantt({
  rows,
  fromJd,
  toJd,
  targetJd,
  label,
  trackLabels,
  rowLabel,
  describe,
  barLabel,
  passLabel,
  bandLabel,
  targetTitle,
  hoveredKey,
  selectedKey,
  onHover,
  onSelect,
}: TimingTimelineGanttProps): React.JSX.Element {
  const scaleRef = useRef<HTMLSpanElement>(null);
  const [plot, setPlot] = useState({ width: 0, fontPx: 12 });
  useLayoutEffect(() => {
    const element = scaleRef.current;
    if (element === null || typeof ResizeObserver === 'undefined') return undefined;
    const measure = (): void => {
      const fontPx = parseFloat(getComputedStyle(element).fontSize);
      setPlot({ width: element.clientWidth, fontPx: Number.isFinite(fontPx) ? fontPx : 12 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const ticks = thinYearTicks(yearTicks(fromJd, toJd), plot.width, TICK_SEPARATION_EM * plot.fontPx);
  // The SVG sits inside a 1px border on each side; its viewBox is stretched over what is left.
  const plotInnerPx = plot.width > 2 ? plot.width - 2 : 0;
  const target = ganttFraction(targetJd, fromJd, toJd) * WIDTH;
  return (
    <div className="gantt" role="group" aria-label={label}>
      <div className="gantt-axis" aria-hidden="true">
        <span />
        <span className="gantt-scale" ref={scaleRef}>
          {ticks.map((tick) => (
            <span key={tick.year} className="gantt-tick" style={{ left: `${String(tick.fraction * 100)}%` }}>
              {tick.year}
            </span>
          ))}
        </span>
      </div>
      {rows.map((row) => {
        const band = forecastBand(row.marks);
        // With a band, the forecast transits are drawn as that one band, so their own bars, labels and exact lines are not
        // drawn (owner review, round 11, #1442: their pass labels piled into a dark smudge). The table lists every transit.
        const drawn = row.marks;
        return (
          <div
            key={row.track}
            className="gantt-row"
            style={{ '--tech': techniqueColorVar(row.track) } as React.CSSProperties}
          >
            <span className="gantt-label">{trackLabels[row.track]}</span>
            <div className="gantt-plotbox">
              <svg
                className="gantt-plot"
                viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={rowLabel(trackLabels[row.track], row.marks.length)}
              >
                {ticks.map((tick) => (
                  <line
                    key={tick.year}
                    className="gantt-grid"
                    x1={tick.fraction * WIDTH}
                    x2={tick.fraction * WIDTH}
                    y1={0}
                    y2={HEIGHT}
                  />
                ))}
                {drawn.map((mark) => {
                  const dimmed = hoveredKey !== undefined && hoveredKey !== mark.key;
                  const state = [
                    dimmed ? 'gantt-dim' : undefined,
                    hoveredKey === mark.key ? 'gantt-hovered' : undefined,
                    selectedKey === mark.key ? 'gantt-selected' : undefined,
                  ]
                    .filter((value) => value !== undefined)
                    .join(' ');
                  // A bar is a mouse target only: the table beside it is the keyboard route to the same event (hover on
                  // focus, Enter or Space to select), so a long chart does not become hundreds of tab stops.
                  return (
                    <g
                      key={mark.key}
                      className={state === '' ? undefined : state}
                      data-mark-key={mark.key}
                      onMouseEnter={() => {
                        onHover?.(mark.key);
                      }}
                      onMouseLeave={() => {
                        onHover?.(undefined);
                      }}
                      onClick={() => {
                        onSelect?.(mark.key);
                      }}
                    >
                      {mark.point ? (
                        <>
                          {/* A wider invisible line, so a 2px tick is easy to point at. */}
                          <line
                            className="gantt-hit"
                            x1={mark.start * WIDTH}
                            x2={mark.start * WIDTH}
                            y1={0}
                            y2={HEIGHT}
                          />
                          <line
                            className="gantt-point"
                            x1={mark.start * WIDTH}
                            x2={mark.start * WIDTH}
                            y1={4}
                            y2={HEIGHT - 4}
                          >
                            <title>{describe(mark.event)}</title>
                          </line>
                        </>
                      ) : (
                        <rect
                          className={mark.sub ? 'gantt-bar gantt-bar-sub' : 'gantt-bar'}
                          {...barSpan(mark.start, mark.end, WIDTH, plotInnerPx, BAR_GAP_PX, MIN_BAR)}
                          y={mark.sub ? 15 : 3}
                          height={mark.sub ? 6 : 18}
                          rx={2}
                        >
                          <title>{describe(mark.event)}</title>
                        </rect>
                      )}
                    </g>
                  );
                })}
                {drawn.map((mark) =>
                  mark.exact === undefined ? null : (
                    <line
                      key={`${mark.key}-exact`}
                      className="gantt-exact"
                      x1={mark.exact * WIDTH}
                      x2={mark.exact * WIDTH}
                      y1={3}
                      y2={HEIGHT - 3}
                    />
                  ),
                )}
                {band !== undefined && (
                  <rect
                    className="gantt-band"
                    x={band.start * WIDTH}
                    y={HEIGHT / 2 - 4}
                    width={Math.max(3, (band.end - band.start) * WIDTH)}
                    height={8}
                    rx={2}
                  >
                    <title>{bandLabel(band.count)}</title>
                  </rect>
                )}
                <line className="gantt-target" x1={target} x2={target} y1={0} y2={HEIGHT}>
                  <title>{targetTitle}</title>
                </line>
              </svg>
              {(() => {
                const shown = visibleBarLabels(
                  drawn.map((mark) => ({
                    mark,
                    text: barLabel(mark.event),
                    ...(mark.exact !== undefined && mark.event.pass !== undefined
                      ? { passText: passLabel(mark.event.pass.number, mark.event.pass.count) }
                      : {}),
                  })),
                  plot.width,
                  plot.fontPx,
                );
                return drawn.map((mark) => {
                  // A dimmed bar draws no label; it returns when the bar is hovered (owner decision on #1442).
                  const dimmed = hoveredKey !== undefined && hoveredKey !== mark.key;
                  return dimmed || !shown.has(mark.key) ? null : (
                    <span
                      key={`${mark.key}-label`}
                      className="gantt-bar-label"
                      style={{
                        left: `${String(mark.start * 100)}%`,
                        width: `${String((mark.end - mark.start) * 100)}%`,
                      }}
                      aria-hidden="true"
                    >
                      {barLabel(mark.event)}
                    </span>
                  );
                });
              })()}
              {band === undefined &&
                drawn.map((mark) =>
                  mark.exact === undefined || mark.event.pass === undefined ? null : (
                    <span
                      key={mark.key}
                      className="gantt-pass"
                      style={{ left: `${String(mark.exact * 100)}%` }}
                      aria-hidden="true"
                    >
                      {passLabel(mark.event.pass.number, mark.event.pass.count)}
                    </span>
                  ),
                )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
