/**
 * @module ui/timeline-gantt
 * @purpose Pure layout for the timing timeline's Gantt chart (#1237): where each event's bar sits on the shared date axis, which events are points, and where the year ticks and the target date fall.
 * @conventions Positions are fractions of the axis (0 at the window's start, 1 at its end), so the chart scales to any width and holds no pixel sizes. An event with no end, or the same end as its start, is a point. A bar is clamped to the window, so one that starts before or ends after it still shows. Nothing here calculates astrology: it only places the normalised `TimingTimelineEvent` records the table also lists.
 * @exports GanttMark, GanttRow, YearTick, ganttFraction, ganttRows, yearTicks, thinYearTicks
 */
import type { JulianDayUT } from '../ephemeris/types.js';
import type { TimingTimelineEvent, TimingTimelineTrackEvents } from '../domain/timing-timeline.js';
import { civilFromJulianDay } from '../time/julian.js';

/** One event's mark on its track: a bar from `start` to `end`, or a point where they are equal. */
export interface GanttMark {
  readonly key: string;
  readonly start: number;
  readonly end: number;
  readonly point: boolean;
  /** A level-2 subperiod (zodiacal releasing), drawn as a thinner bar beneath the level-1 period. */
  readonly sub: boolean;
  readonly event: TimingTimelineEvent;
}

export interface GanttRow {
  readonly track: TimingTimelineTrackEvents['track'];
  readonly marks: readonly GanttMark[];
}

/** A date's place on the axis, 0 to 1, clamped to the window. */
export function ganttFraction(jd: JulianDayUT, fromJd: JulianDayUT, toJd: JulianDayUT): number {
  if (toJd <= fromJd) return 0;
  return Math.min(1, Math.max(0, (jd - fromJd) / (toJd - fromJd)));
}

/** The rows of the chart, one per track that has events in the window, in the tracks' own order. */
export function ganttRows(
  tracks: readonly TimingTimelineTrackEvents[],
  fromJd: JulianDayUT,
  toJd: JulianDayUT,
): readonly GanttRow[] {
  return tracks.map(({ track, events }) => ({
    track,
    marks: events.map((event, index) => {
      const start = ganttFraction(event.startJd, fromJd, toJd);
      const end = ganttFraction(event.endJd ?? event.startJd, fromJd, toJd);
      return {
        key: `${track}-${event.kind}-${String(event.startJd)}-${String(index)}`,
        start,
        end,
        point: event.endJd === undefined || event.endJd === event.startJd,
        sub: event.subject.kind === 'releasing' && event.subject.level === 2,
        event,
      };
    }),
  }));
}

/** The first of January of every year inside the window, with its year, for the axis labels. */
export function yearTicks(
  fromJd: JulianDayUT,
  toJd: JulianDayUT,
): readonly { readonly year: number; readonly fraction: number }[] {
  const ticks: { year: number; fraction: number }[] = [];
  for (let jd = Math.ceil(fromJd); jd <= toJd; jd += 1) {
    const civil = civilFromJulianDay(jd);
    if (civil.month === 1 && civil.day === 1)
      ticks.push({ year: civil.year, fraction: ganttFraction(jd, fromJd, toJd) });
  }
  return ticks;
}

export interface YearTick {
  readonly year: number;
  readonly fraction: number;
}

/**
 * Drops every other (then every third, ...) year tick until neighbouring kept ticks sit at least `minSeparationPx` apart on a
 * plot `plotWidthPx` wide (#1369). Keeps the first tick and an even stride, so the range stays readable; the caller draws the
 * grid mark and the label of a kept tick together. An unmeasured plot (width 0) keeps every tick.
 */
export function thinYearTicks(
  ticks: readonly YearTick[],
  plotWidthPx: number,
  minSeparationPx: number,
): readonly YearTick[] {
  if (plotWidthPx <= 0 || ticks.length < 2) return ticks;
  for (let step = 1; step < ticks.length; step += 1) {
    const kept = ticks.filter((_, index) => index % step === 0);
    let ok = true;
    for (let i = 1; i < kept.length; i += 1) {
      const a = kept[i - 1];
      const b = kept[i];
      if (a !== undefined && b !== undefined && (b.fraction - a.fraction) * plotWidthPx < minSeparationPx) ok = false;
    }
    if (ok) return kept;
  }
  return ticks.slice(0, 1);
}
