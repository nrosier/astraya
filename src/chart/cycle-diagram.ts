/**
 * The zodiac with a planetary cycle's points joined in order (#410).
 *
 * Plot where each successive exact aspect of a cycle falls and join them in sequence: Venus's
 * inferior conjunctions with the Sun, each ~144° from the last, close into a five-pointed star
 * over eight years; Jupiter and Saturn's great conjunctions step ~240° each and walk round the
 * zodiac through one element for two centuries. Hence a diagram rather than a list — the
 * *pattern* is the cycle.
 *
 * Aries sits at twelve o'clock and longitude runs counterclockwise, the same convention the
 * chart wheel uses with its `aries-up` orientation, via the shared `wheelAngle`/`pointOnCircle`.
 * Colour lives in CSS (`app.css`), as everywhere in `src/chart/**`.
 */
/**
 * @module chart/cycle-diagram
 * @purpose Draws a planetary cycle (e.g. Venus/Sun inferior conjunctions, Jupiter/Saturn great conjunctions) as its successive exact-aspect points joined in sequence around the zodiac, revealing the cycle's geometric pattern (star, stepped rotation, etc).
 * @conventions The time-series variant (#1404, the graphic ephemeris) unrolls the same zodiac ring into a rectangle: the same `SIGNS` bands, sign glyphs, boundary/ring classes and `renderGlyph`, with the date along x and longitude up y (0° Aries at the bottom); a series is broken wherever it wraps through 0°/360° so no stroke crosses the plot. Fixed orientation `{ orientation: 'aries-up', sweep: 'counterclockwise' }` via the shared `wheelAngle`/`pointOnCircle`; points within `LABEL_CROWD_DEG` of an earlier point are pushed one ring further inward so labels don't overprint; a `selectedId` dims every point/segment except the selected point and the segment arriving at it, matching the wheel's own click-to-isolate convention.
 * @exports renderCycleDiagramSvg, renderCycleTimeSeriesSvg; CyclePoint, CycleTimeSeries, CycleTimeTick types.
 */
import { SIGNS } from '../astrology/signs.js';
import type { Degrees } from '../ephemeris/types.js';
import { bodyGlyph, renderGlyph, signGlyph } from './glyphs.js';
import { baselineOffset, circle, escapeXml, fmt, line, polyline, rect, text } from './svg-primitives.js';
import { pointOnCircle, wheelAngle } from './wheel.js';

export interface CyclePoint {
  readonly longitude: Degrees;
  /** Short label drawn beside the point — typically its position in the sequence. */
  readonly label: string;
  /** What the point is called to the page, so a click on it and a row of the table can name the same event (#418). Defaults to its position. */
  readonly id?: string;
}

/** Points closer than this share a neighbourhood, so their labels are stacked rather than overprinted. */
const LABEL_CROWD_DEG = 8;

function angularGap(a: Degrees, b: Degrees): Degrees {
  const diff = Math.abs((((a - b) % 360) + 360) % 360);
  return diff > 180 ? 360 - diff : diff;
}

const ORIENTATION = { orientation: 'aries-up', sweep: 'counterclockwise' } as const;

/**
 * With `selectedId`, only that point and the segment that arrives at it (with the point it comes
 * from) stay at full strength; every other point and segment is dimmed, the way the wheel dims
 * everything a selection does not involve (#400, #418). Each point carries its id and a hit area
 * larger than the dot, so it can be clicked; the markup is otherwise unchanged.
 */
export function renderCycleDiagramSvg(points: readonly CyclePoint[], size = 380, selectedId?: string): string {
  const idOf = (point: CyclePoint, index: number): string => point.id ?? String(index);
  const selectedIndex =
    selectedId === undefined ? -1 : points.findIndex((point, index) => idOf(point, index) === selectedId);
  const hasSelection = selectedIndex >= 0;
  // The point a selected one is reached from, whose segment to it is the one kept.
  const keptIndexes = new Set<number>(hasSelection ? [selectedIndex, selectedIndex - 1] : []);
  const dimmed = (kept: boolean): string => (hasSelection && !kept ? ' cycle-dimmed' : '');
  const c = size / 2;
  const ringOuter = size * 0.47;
  const ringInner = size * 0.39;
  const signRadius = (ringOuter + ringInner) / 2;
  const pointRadius = ringInner - size * 0.02;
  const labelRadius = pointRadius - size * 0.055;
  const parts: string[] = [circle(c, c, ringOuter, 'cycle-ring'), circle(c, c, ringInner, 'cycle-ring')];

  for (const sign of SIGNS) {
    const boundary = wheelAngle(sign.index * 30, 0, ORIENTATION);
    const outer = pointOnCircle(c, c, ringOuter, boundary);
    const inner = pointOnCircle(c, c, ringInner, boundary);
    parts.push(line(outer.x, outer.y, inner.x, inner.y, 'cycle-sign-boundary'));
    const definition = signGlyph(sign.name);
    if (definition) {
      const middle = pointOnCircle(c, c, signRadius, wheelAngle(sign.index * 30 + 15, 0, ORIENTATION));
      parts.push(
        renderGlyph(
          definition,
          middle.x,
          middle.y,
          size * 0.06,
          `chart-sign-glyph chart-sign-glyph-${sign.name.toLowerCase()} chart-sign-element-${sign.element}`,
        ),
      );
    }
  }

  const placed = points.map((point) => pointOnCircle(c, c, pointRadius, wheelAngle(point.longitude, 0, ORIENTATION)));
  for (let i = 1; i < placed.length; i++) {
    const from = placed[i - 1];
    const to = placed[i];
    if (from && to) parts.push(line(from.x, from.y, to.x, to.y, `cycle-link${dimmed(i === selectedIndex)}`));
  }
  const group: string[] = [];
  points.forEach((point, index) => {
    const at = placed[index];
    if (!at) return;
    const kept = keptIndexes.has(index);
    const id = escapeXml(idOf(point, index));
    const selectedClass = index === selectedIndex ? ' cycle-selected' : '';
    group.push(`<g class="cycle-point-group${selectedClass}${dimmed(kept)}" data-cycle-id="${id}">`);
    group.push(`<circle cx="${fmt(at.x)}" cy="${fmt(at.y)}" r="${fmt(size * 0.012)}" class="cycle-point" />`);
    // A point that nearly coincides with earlier ones (the sixth point of the Venus pentagram
    // closes on the first) gets its label one step further in, so the labels stay legible.
    const crowding = points
      .slice(0, index)
      .filter((other) => angularGap(other.longitude, point.longitude) < LABEL_CROWD_DEG).length;
    const label = pointOnCircle(
      c,
      c,
      labelRadius - crowding * size * 0.05,
      wheelAngle(point.longitude, 0, ORIENTATION),
    );
    group.push(
      text(
        label.x,
        label.y + baselineOffset(size * 0.035),
        'middle',
        'cycle-point-label',
        escapeXml(point.label),
        size * 0.035,
      ),
    );
    // Drawn last, so it is what a click lands on, over the dot it surrounds.
    // A transparent disc larger than the dot, so the point is easy to click (as the wheel's symbols are).
    group.push(
      `<circle cx="${fmt(at.x)}" cy="${fmt(at.y)}" r="${fmt(size * 0.035)}" class="cycle-hit-area" fill="transparent" pointer-events="all" />`,
    );
    group.push('</g>');
  });
  parts.push(...group);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(size)} ${fmt(size)}" width="${fmt(size)}" height="${fmt(size)}" class="cycle-diagram">${parts.join('')}</svg>`;
}

/** One body's path through time: `at` runs 0 (range start) to 1 (range end). */
export interface CycleTimeSeries {
  readonly key: string;
  readonly points: readonly { readonly at: number; readonly longitude: Degrees }[];
}

/** A date mark on the x axis: `at` runs 0 to 1, `label` is already formatted for the reader's locale. */
export interface CycleTimeTick {
  readonly at: number;
  readonly label: string;
}

const TIME_MARGIN = { left: 34, right: 30, top: 10, bottom: 24 } as const;

/**
 * The cycle diagram's zodiac laid out against time (#1404): twelve sign bands up the left, a date axis along the
 * bottom, one polyline per body (class `cycle-series cycle-series-<key>`, colour in CSS) with the body's glyph at its
 * end so identity is never colour alone. Glyphs at the end are spread apart so they do not overprint.
 */
export function renderCycleTimeSeriesSvg(
  series: readonly CycleTimeSeries[],
  ticks: readonly CycleTimeTick[],
  width = 760,
  height = 420,
): string {
  const left = TIME_MARGIN.left;
  const top = TIME_MARGIN.top;
  const plotWidth = width - left - TIME_MARGIN.right;
  const plotHeight = height - top - TIME_MARGIN.bottom;
  const xOf = (at: number): number => left + at * plotWidth;
  // 0° at the bottom, 360° at the top.
  const yOf = (longitude: Degrees): number => top + plotHeight - (longitude / 360) * plotHeight;
  const parts: string[] = [rect(left, top, plotWidth, plotHeight, 'cycle-ring')];

  for (const sign of SIGNS) {
    const boundary = yOf(sign.index * 30);
    if (sign.index > 0) parts.push(line(left, boundary, left + plotWidth, boundary, 'cycle-sign-boundary'));
    const definition = signGlyph(sign.name);
    if (definition) {
      parts.push(
        renderGlyph(
          definition,
          left / 2,
          yOf(sign.index * 30 + 15),
          plotHeight * 0.045,
          `chart-sign-glyph chart-sign-glyph-${sign.name.toLowerCase()} chart-sign-element-${sign.element}`,
        ),
      );
    }
  }

  for (const tick of ticks) {
    const x = xOf(tick.at);
    parts.push(line(x, top, x, top + plotHeight, 'cycle-sign-boundary cycle-time-grid'));
    parts.push(text(x, top + plotHeight + 15, 'middle', 'cycle-point-label', escapeXml(tick.label), 11));
  }

  const ends: { key: string; y: number }[] = [];
  for (const one of series) {
    // Break the path wherever it wraps through Aries, so the stroke does not cross the whole plot.
    const runs: { x: number; y: number }[][] = [];
    let run: { x: number; y: number }[] = [];
    let previous: Degrees | undefined;
    for (const point of one.points) {
      if (previous !== undefined && Math.abs(point.longitude - previous) > 180) {
        runs.push(run);
        run = [];
      }
      run.push({ x: xOf(point.at), y: yOf(point.longitude) });
      previous = point.longitude;
    }
    runs.push(run);
    for (const points of runs) {
      if (points.length > 1) parts.push(polyline(points, `cycle-series cycle-series-${one.key}`));
    }
    const last = one.points[one.points.length - 1];
    if (last) ends.push({ key: one.key, y: yOf(last.longitude) });
  }

  // Direct labels: the body's glyph just right of the plot, pushed apart where the lines end close together.
  const gap = 15;
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    const before = ends[i - 1];
    const here = ends[i];
    if (before && here && here.y - before.y < gap) here.y = before.y + gap;
  }
  for (const end of ends) {
    const definition = bodyGlyph(end.key);
    if (definition) {
      parts.push(
        renderGlyph(definition, left + plotWidth + 15, end.y, 13, `cycle-series-glyph cycle-series-glyph-${end.key}`),
      );
    }
  }

  // Fluid: the drawing scales to the card's width and keeps its proportions, so a wide card is filled, not left empty (#1404 review).
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="100%" height="auto" preserveAspectRatio="xMidYMid meet" class="cycle-diagram cycle-time-series">${parts.join('')}</svg>`;
}
