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
import { SIGNS } from '../astrology/signs.js';
import type { Degrees } from '../ephemeris/types.js';
import { renderGlyph, signGlyph } from './glyphs.js';
import { baselineOffset, circle, escapeXml, fmt, line, text } from './svg-primitives.js';
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
