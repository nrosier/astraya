/**
 * @module ui/timeline-gantt
 * @purpose Pure layout for the timing timeline's Gantt chart (#1237): where each event's bar sits on the shared date axis, which events are points, and where the year ticks and the target date fall.
 * @conventions Positions are fractions of the axis (0 at the window's start, 1 at its end), so the chart scales to any width and holds no pixel sizes. An event with no end, or the same end as its start, is a point. A bar is clamped to the window, so one that starts before or ends after it still shows. An orb window (an event with an exact date, #1401) is a bar with the exact date marked inside it. Nothing here calculates astrology: it only places the normalised `TimingTimelineEvent` records the table also lists.
 * @exports GanttMark, GanttRow, YearTick, stackSameDayExacts, STACK_TOLERANCE, MARKER_MERGE_DISTANCE, techniqueColorVar, barLabelFits, visibleBarLabels, BAR_GAP_PX, barSpan, ganttFraction, ganttRows, yearTicks, thinYearTicks
 */
import type { JulianDayUT } from '../ephemeris/types.js';
import type { TimingTimelineEvent, TimingTimelineTrack, TimingTimelineTrackEvents } from '../domain/timing-timeline.js';
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
  /** Where the exact date falls inside a bar that is an orb window (#1401). */
  readonly exact?: number;
  /**
   * How many events share this exact day in the row (owner review, #1442): the exact mark is drawn once with this count
   * instead of stacking one mark per event. 1 when the event stands alone.
   */
  readonly stackCount?: number;
  /** Every event that shares the exact day with this mark, so the count can be explained on hover. */
  readonly stacked?: readonly TimingTimelineEvent[];
}

export interface GanttRow {
  readonly track: TimingTimelineTrackEvents['track'];
  readonly marks: readonly GanttMark[];
}

/**
 * The colour token of each technique (#1442), the same on its Gantt bars and its table badge. Forecast events are transits
 * seen over a month or a year, so they share the transit colour; the issue names seven techniques and no eighth hue.
 */
const TECHNIQUE_COLOR_VAR: Readonly<Record<TimingTimelineTrack, string>> = {
  'zodiacal-releasing': '--color-tech-zr',
  firdaria: '--color-tech-firdaria',
  profections: '--color-tech-profection',
  'primary-directions': '--color-tech-pd',
  'secondary-progression': '--color-tech-sec',
  'solar-arc': '--color-tech-sa',
  transit: '--color-tech-transit',
  'periodic-transit': '--color-tech-transit',
};

/** The `var(--color-tech-*)` reference for a technique, for a `--tech` custom property on a row or badge. */
export function techniqueColorVar(track: TimingTimelineTrack): string {
  return `var(${TECHNIQUE_COLOR_VAR[track]})`;
}

/** Average glyph width as a share of the font size, and the room kept either side of a label inside its bar. */
const LABEL_GLYPH_EM = 0.65;
const LABEL_PADDING_PX = 8;

/** Whether a bar `barWidthPx` wide can hold `label` at `fontPx` (#1442); a narrower bar draws no label, so none is cut mid-word. */
export function barLabelFits(label: string, barWidthPx: number, fontPx: number): boolean {
  return label.length > 0 && barWidthPx >= label.length * LABEL_GLYPH_EM * fontPx + 2 * LABEL_PADDING_PX;
}

/** One candidate in-bar label: its mark, its text, and the mark's pass label text (if any) beside its exact date. */
export interface BarLabelCandidate {
  readonly mark: GanttMark;
  readonly text: string;
  readonly passText?: string;
}

/**
 * The keys of the marks whose in-bar label is drawn (#1442). A label is drawn only when it fits its own bar
 * (`barLabelFits`), does not run over the exact-date mark or pass label of any window in the row, and does not touch a label
 * already placed, earlier marks winning, so no two texts in a row overlap. Everything else keeps its full text in the bar's title and the table.
 */
export function visibleBarLabels(
  candidates: readonly BarLabelCandidate[],
  plotWidthPx: number,
  fontPx: number,
): ReadonlySet<string> {
  const glyph = LABEL_GLYPH_EM * fontPx;
  const taken: [number, number][] = [];
  for (const { mark, passText } of candidates) {
    if (mark.exact !== undefined) {
      const x = mark.exact * plotWidthPx;
      taken.push([x - 1, x + 4 + (passText?.length ?? 0) * glyph + 1]);
    }
  }
  const shown = new Set<string>();
  for (const { mark, text } of candidates) {
    if (mark.point || mark.sub) continue;
    const widthPx = (mark.end - mark.start) * plotWidthPx;
    if (!barLabelFits(text, widthPx, fontPx)) continue;
    const from = mark.start * plotWidthPx;
    const textBox: [number, number] = [from + LABEL_PADDING_PX, from + LABEL_PADDING_PX + text.length * glyph];
    // The bar's own exact mark and pass label are in `taken` too, so an orb window with a label inside is dropped when they collide.
    if (taken.some(([a, b]) => textBox[0] < b && a < textBox[1])) continue;
    taken.push(textBox);
    shown.add(mark.key);
  }
  return shown;
}

/** The least rendered gap, in CSS pixels, between two bars side by side in a row (#1442). */
export const BAR_GAP_PX = 3;

/**
 * A bar's x and width in viewBox units (#1442). The SVG is stretched to the plot, so a fixed number of units is a different
 * number of pixels at every width; the inset is therefore converted from pixels with the measured scale (`viewWidth / plotWidthPx`).
 * Each end is pulled in by half the gap, so two bars that meet are `gapPx` apart in rendered pixels at any plot width. A bar too
 * short to keep `minWidth` units after the inset keeps `minWidth`, centred on its own middle, so it still shows and never goes
 * negative. An unmeasured plot (width 0) has no scale to convert with, so it draws no inset until it is measured.
 */
export function barSpan(
  start: number,
  end: number,
  viewWidth: number,
  plotWidthPx: number,
  gapPx: number,
  minWidth: number,
): { readonly x: number; readonly width: number } {
  const inset = plotWidthPx > 0 ? ((gapPx / 2) * viewWidth) / plotWidthPx : 0;
  const from = start * viewWidth;
  const to = end * viewWidth;
  const width = to - from - 2 * inset;
  if (width >= minWidth) return { x: from + inset, width };
  return { x: (from + to) / 2 - minWidth / 2, width: minWidth };
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
    marks: stackSameDayExacts(
      events.map((event, index) => {
        const start = ganttFraction(event.startJd, fromJd, toJd);
        const end = ganttFraction(event.endJd ?? event.startJd, fromJd, toJd);
        return {
          key: `${track}-${event.kind}-${String(event.startJd)}-${String(index)}`,
          start,
          end,
          point: event.endJd === undefined || event.endJd === event.startJd,
          sub: event.subject.kind === 'releasing' && event.subject.level === 2,
          event,
          ...(event.exactJd === undefined ? {} : { exact: ganttFraction(event.exactJd, fromJd, toJd) }),
        };
      }),
    ),
  }));
}

/**
 * Exact marks that would draw on top of each other are drawn once, with a count (owner review, #1442). Two exacts stack
 * when their lines fall within `STACK_TOLERANCE` of the axis (a fraction of the width), which is what the eye reads as one
 * dark mark. The first mark in each cluster (in row order) keeps the line and carries the count and every event in it.
 */
export const STACK_TOLERANCE = 0.001;

/**
 * How close two stacks can sit before their count markers would overlap on screen, as a fraction of the axis. A marker is
 * about 24 CSS pixels wide on a plot of roughly 740 pixels, so stacks within this distance are merged into one marker
 * (owner review, round 8, #1442: several overlapping buttons on one stripe).
 */
export const MARKER_MERGE_DISTANCE = 0.03;

export function stackSameDayExacts(marks: readonly GanttMark[]): readonly GanttMark[] {
  // Cluster the exact marks by position: a mark joins the first cluster whose anchor is within the tolerance.
  const anchors: { at: number; members: GanttMark[] }[] = [];
  for (const mark of marks) {
    if (mark.exact === undefined) continue;
    const cluster = anchors.find((anchor) => Math.abs(anchor.at - (mark.exact ?? 0)) <= STACK_TOLERANCE);
    if (cluster === undefined) anchors.push({ at: mark.exact, members: [mark] });
    else cluster.members.push(mark);
  }
  // Merge clusters whose markers would sit on top of each other on screen, so one visible spot is one marker.
  anchors.sort((a, b) => a.at - b.at);
  const merged: { at: number; members: GanttMark[] }[] = [];
  for (const anchor of anchors) {
    const last = merged[merged.length - 1];
    if (last !== undefined && anchor.at - last.at <= MARKER_MERGE_DISTANCE) {
      last.members.push(...anchor.members);
    } else {
      merged.push({ at: anchor.at, members: [...anchor.members] });
    }
  }
  anchors.length = 0;
  anchors.push(...merged);
  const clusterOf = new Map<GanttMark, { at: number; members: GanttMark[] }>();
  for (const anchor of anchors) for (const member of anchor.members) clusterOf.set(member, anchor);
  return marks.map((mark) => {
    const cluster = clusterOf.get(mark);
    if (cluster === undefined) return mark;
    const stacked = cluster.members.map((member) => member.event);
    return { ...mark, stackCount: cluster.members.length, stacked };
  });
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
