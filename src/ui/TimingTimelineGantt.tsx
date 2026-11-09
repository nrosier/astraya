/**
 * @module ui/TimingTimelineGantt
 * @purpose The timing timeline's Gantt chart (#1237): one labelled row per technique over the shared date axis, a bar for each period, a tick for each point event, and a vertical line at the target date.
 * @conventions Drawn as one small SVG per row (viewBox 0 0 1000 24, stretched to the row's width, strokes non-scaling) beside an HTML label, so the track names and the year labels stay readable at any width. Colours are tokens only: bars in the accent, the target date in the solar colour. The chart is a picture of the events the table below it lists, so each row is an image with a name that counts its events and each bar carries a title; the table is the text equivalent. No calculation: positions come from `timeline-gantt.ts`.
 * @exports TimingTimelineGantt
 */
import type { JulianDayUT } from '../ephemeris/types.js';
import type { TimingTimelineEvent, TimingTimelineTrack } from '../domain/timing-timeline.js';
import { useLayoutEffect, useRef, useState } from 'react';
import { ganttFraction, thinYearTicks, yearTicks, type GanttRow } from './timeline-gantt.js';

/** Neighbouring year labels keep at least this many label font sizes between their centres (a four-digit year is about 2.4 wide, so 3 leaves a gap). */
const TICK_SEPARATION_EM = 3;
const WIDTH = 1000;
const HEIGHT = 24;
/** A bar never draws narrower than this, so a short period is still a visible mark. */
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
  /** The target date in words, for the line's title. */
  readonly targetTitle: string;
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
  targetTitle,
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
      {rows.map((row) => (
        <div key={row.track} className="gantt-row">
          <span className="gantt-label">{trackLabels[row.track]}</span>
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
            {row.marks.map((mark) =>
              mark.point ? (
                <line
                  key={mark.key}
                  className="gantt-point"
                  x1={mark.start * WIDTH}
                  x2={mark.start * WIDTH}
                  y1={4}
                  y2={HEIGHT - 4}
                >
                  <title>{describe(mark.event)}</title>
                </line>
              ) : (
                <rect
                  key={mark.key}
                  className={mark.sub ? 'gantt-bar gantt-bar-sub' : 'gantt-bar'}
                  x={mark.start * WIDTH}
                  width={Math.max((mark.end - mark.start) * WIDTH, MIN_BAR)}
                  y={mark.sub ? 15 : 3}
                  height={mark.sub ? 6 : 18}
                  rx={2}
                >
                  <title>{describe(mark.event)}</title>
                </rect>
              ),
            )}
            <line className="gantt-target" x1={target} x2={target} y1={0} y2={HEIGHT}>
              <title>{targetTitle}</title>
            </line>
          </svg>
        </div>
      ))}
    </div>
  );
}
