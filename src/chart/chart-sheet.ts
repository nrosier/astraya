/**
 * The whole chart sheet as one SVG: header, wheel, and the three data panels.
 *
 * One document rather than four sibling elements, because every export path
 * Astraya already has — standalone SVG, PNG at 600/1200/2400, print to PDF —
 * takes a single SVG string. Splitting the sheet would mean teaching each of
 * those paths to compose, and a PNG that silently dropped the aspect grid.
 *
 * Nothing here holds a pixel figure of its own. Vertical positions come from
 * each panel's returned `height` and horizontal ones from fractions of the
 * content width, so a chart with the asteroids switched on pushes the panels
 * below it down instead of overlapping them, and the whole sheet scales with
 * the single `size` its wheel is drawn at.
 */
/**
 * @module chart/chart-sheet
 * @purpose Composes the wheel and the three data panels (aspect matrix, emphasis grid, degree strip) into one single SVG document representing the whole printable/exportable chart sheet.
 * @conventions Vertical layout is computed top-down purely from each panel's own returned `height` plus fractions of the shared content width — no panel's position is a hardcoded pixel figure, so a chart with more bodies/asteroids pushes later panels down rather than overlapping them; one SVG document is used because every export path (standalone SVG, PNG, print-to-PDF) takes a single SVG string.
 * @exports renderChartSheetSvg, renderChartDialSvg; ChartSheetInput, ChartSheetOptions, ChartSheet types.
 */
import type { AspectMatrixInput } from './aspect-matrix.js';
import { renderAspectMatrixSvg } from './aspect-matrix.js';
import { filterAntisciaForDisplay, renderAntisciaOverlaySvg } from './antiscia-overlay.js';
import { renderDeclinationOverlaySvg } from './declination-overlay.js';
import type { DegreeStripInput } from './degree-strip.js';
import { renderDegreeStripSvg } from './degree-strip.js';
import { renderDial90Svg } from './dial90.js';
import type { EmphasisGridInput } from './emphasis-grid.js';
import { renderEmphasisGridSvg } from './emphasis-grid.js';
import type { AntiscialContact } from '../astrology/antiscia.js';
import type { DeclinationContact } from '../astrology/declinations.js';
import type { MidpointTreeHit } from '../astrology/midpoints.js';
import { bodyById } from '../astrology/bodies.js';
import type { BodyId, Degrees } from '../ephemeris/types.js';
import type { CrossRingAspects, MultiWheelOptions, WheelRingInput } from './multi-wheel.js';
import { renderMultiWheelSvg } from './multi-wheel.js';
import type { PanelLayout } from './sheet-geometry.js';
import { resolveSheetGeometry } from './sheet-geometry.js';
import { baselineOffset, escapeXml, fmt, line, text } from './svg-primitives.js';

export interface ChartSheetInput {
  /**
   * Header lines, first one as the title. Supplied by the caller rather than
   * derived here: what belongs in a header (subject name, place, house system,
   * zodiac) is presentation, and `ChartData` deliberately carries none of it.
   */
  readonly metaLines: readonly string[];
  /** Wheel rings, innermost first — a single natal ring or a multi-ring overlay. */
  readonly rings: readonly WheelRingInput[];
  readonly crossAspects?: readonly CrossRingAspects[];
  /** Optional visual layers for a single-chart dial; each shares its positions with ring 0. */
  readonly overlays?: {
    readonly positions: readonly { readonly body: BodyId; readonly key: string; readonly longitude: Degrees }[];
    readonly antiscia?: readonly AntiscialContact[];
    readonly declinations?: readonly DeclinationContact[];
    /** Defined (including as an empty list) when the 90° dial is enabled. */
    readonly midpointHits?: readonly MidpointTreeHit[];
  };
  readonly matrix: AspectMatrixInput;
  readonly emphasis: EmphasisGridInput;
  readonly strip: DegreeStripInput;
}

/** Wheel options, minus `bare` — the sheet always embeds the wheel bare. */
export type ChartSheetOptions = Omit<MultiWheelOptions, 'bare'>;

/**
 * The rendered sheet and the box it drew into.
 *
 * The dimensions come back rather than being left for the caller to parse out
 * of the markup because the sheet is not square — its height depends on how
 * many bodies its panels hold — and a PNG export that assumed square would
 * squash it.
 */
export interface ChartSheet {
  readonly markup: string;
  readonly width: number;
  readonly height: number;
}

const DEFAULT_SIZE = 800;

function renderWheelOverlays(input: ChartSheetInput, options: ChartSheetOptions | undefined, size: number): string {
  const overlays = input.overlays;
  const ring = input.rings[0];
  if (overlays === undefined || ring === undefined) return '';
  const longitudeByBody = new Map(overlays.positions.map((position) => [position.body, position.longitude]));
  const longitudeOf = (body: BodyId): Degrees => {
    const longitude = longitudeByBody.get(body);
    if (longitude === undefined)
      throw new Error(`renderChartDialSvg: overlay body ${String(body)} is not present in the wheel`);
    return longitude;
  };
  const geometry = resolveSheetGeometry(size);
  const parts: string[] = [];
  if (overlays.antiscia !== undefined) {
    parts.push(
      `<g class="chart-wheel-overlay chart-wheel-overlay-antiscia">` +
        renderAntisciaOverlaySvg(
          filterAntisciaForDisplay(overlays.antiscia),
          longitudeOf,
          ring.houses.ascendant,
          geometry.cx,
          geometry.cy,
          geometry.aspectCircle,
          options,
        ) +
        `</g>`,
    );
  }
  if (overlays.declinations !== undefined) {
    parts.push(
      `<g class="chart-wheel-overlay chart-wheel-overlay-declination">` +
        renderDeclinationOverlaySvg(
          overlays.declinations,
          longitudeOf,
          ring.houses.ascendant,
          geometry.cx,
          geometry.cy,
          geometry.aspectCircle,
          options,
        ) +
        `</g>`,
    );
  }
  return parts.join('');
}

function renderDial90(input: ChartSheetInput, size: number): string {
  const overlays = input.overlays;
  if (overlays?.midpointHits === undefined) return '';
  return renderDial90Svg(
    {
      positions: overlays.positions,
      hits: overlays.midpointHits,
      keyOf: (body) => bodyById(body)?.key ?? String(body),
    },
    { size },
  );
}

/**
 * The wheel alone, for the screen (#511): the very group the sheet embeds — same size, same margin
 * around it, same `translate` — minus the title block and the three panels below it. Nothing about
 * the wheel's geometry or its `data-*` hit targets differs from the sheet's; only what surrounds it.
 * `renderChartSheetSvg` stays the one composition every export takes.
 */
export function renderChartDialSvg(input: ChartSheetInput, options?: ChartSheetOptions): ChartSheet {
  const size = options?.size ?? DEFAULT_SIZE;
  const padding = resolveSheetGeometry(size).labelMargin;
  const dial90 = renderDial90(input, size);
  const panelWidth = size + padding * 2;
  const width = dial90 === '' ? panelWidth : panelWidth * 2;
  const height = size + padding * 2;
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" ` +
    `width="${fmt(width)}" height="${fmt(height)}" class="chart-sheet chart-dial">` +
    `<g transform="translate(${fmt(padding)} ${fmt(padding)})">` +
    renderMultiWheelSvg(input.rings, input.crossAspects ?? [], { ...options, size, bare: true }) +
    renderWheelOverlays(input, options, size) +
    `</g></svg>`;
  const dialMarkup =
    dial90 === ''
      ? markup
      : markup.replace('</svg>', `<g transform="translate(${fmt(panelWidth)} 0)">${dial90}</g></svg>`);
  return { markup: dialMarkup, width, height };
}

/**
 * The element/modality table is a fraction of the content width, so it keeps its shape at every
 * size. It sits in the empty upper-right of the aspect staircase, or under it when that is too
 * crowded to leave room (#413).
 */
const EMPHASIS_WIDTH_FRACTION = 0.4;

export function renderChartSheetSvg(input: ChartSheetInput, options?: ChartSheetOptions): ChartSheet {
  const size = options?.size ?? DEFAULT_SIZE;
  const geometry = resolveSheetGeometry(size);
  const fontSize = geometry.panelFontSize;
  const padding = geometry.labelMargin;
  const gap = fontSize * 1.5;

  const contentWidth = size;
  const contentX = padding;
  const parts: string[] = [];
  let y = padding;

  input.metaLines.forEach((metaLine, index) => {
    const lineFontSize = index === 0 ? fontSize * 1.35 : fontSize;
    y += lineFontSize * 1.35;
    parts.push(
      text(
        contentX,
        y - baselineOffset(lineFontSize),
        'start',
        index === 0 ? 'chart-sheet-title' : 'chart-sheet-meta',
        escapeXml(metaLine),
        lineFontSize,
      ),
    );
  });
  if (input.metaLines.length > 0) {
    y += gap * 0.5;
    parts.push(line(contentX, y, contentX + contentWidth, y, 'chart-panel-rule'));
    y += gap * 0.5;
  }

  // The wheel's own coordinates run 0..size with its legend in the negative
  // margin, so it is translated as a group rather than re-parameterised.
  parts.push(
    `<g transform="translate(${fmt(contentX)} ${fmt(y)})">` +
      renderMultiWheelSvg(input.rings, input.crossAspects ?? [], { ...options, size, bare: true }) +
      renderWheelOverlays(input, options, size) +
      `</g>`,
  );
  y += size + gap;

  // The grid and its positions table take the full width; the element/modality table sits in
  // the empty upper-right of the staircase, as on the reference sheet, when it fits there.
  const matrixLayout: PanelLayout = { x: contentX, y, width: contentWidth };
  const matrix = renderAspectMatrixSvg(input.matrix, matrixLayout);
  const emphasisWidth = contentWidth * EMPHASIS_WIDTH_FRACTION;
  const emphasisLayout: PanelLayout = {
    x: contentX + contentWidth - emphasisWidth,
    y,
    width: emphasisWidth,
  };
  const emphasis = renderEmphasisGridSvg(input.emphasis, emphasisLayout, fontSize);
  const rowHeight = input.matrix.bodies.length === 0 ? 0 : matrix.height / input.matrix.bodies.length;
  // The staircase's right edge at row `r` is the table width plus `r + 1` cells; the emphasis
  // grid clears it when its last row's edge is still left of the grid's own left edge.
  const rowsUnderEmphasis = rowHeight === 0 ? 0 : Math.ceil(emphasis.height / rowHeight);
  const staircaseEdge = contentX + contentWidth - (input.matrix.bodies.length - rowsUnderEmphasis) * rowHeight;
  const emphasisFits = rowHeight > 0 && staircaseEdge + gap <= emphasisLayout.x;
  parts.push(matrix.markup);
  if (emphasisFits) {
    parts.push(emphasis.markup);
    y += matrix.height + gap;
  } else {
    const belowLayout: PanelLayout = {
      x: contentX + contentWidth - emphasisWidth,
      y: y + matrix.height + gap,
      width: emphasisWidth,
    };
    const below = renderEmphasisGridSvg(input.emphasis, belowLayout, fontSize);
    parts.push(below.markup);
    y += matrix.height + gap + below.height + gap;
  }

  const strip = renderDegreeStripSvg(
    input.strip,
    { x: contentX, y, width: contentWidth },
    fontSize,
    geometry.bodyGlyphSize,
  );
  parts.push(strip.markup);
  y += strip.height;

  const dial90 = renderDial90(input, size);
  if (dial90 !== '') {
    y += gap;
    parts.push(`<g transform="translate(${fmt(contentX)} ${fmt(y)})">${dial90}</g>`);
    y += size;
  }

  const width = contentWidth + padding * 2;
  const height = y + padding;
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" ` +
    `width="${fmt(width)}" height="${fmt(height)}" class="chart-sheet">` +
    `${parts.join('')}</svg>`;
  return { markup, width, height };
}
