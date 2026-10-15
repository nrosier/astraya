/**
 * Where, and how large, a chart SVG is drawn on a PDF page (#579).
 *
 * The renderer used to draw every SVG at a fixed width and let its height follow from its aspect
 * ratio. A chart sheet (wheel, aspect matrix, elements grid and strip stacked) is much taller than it
 * is wide, so at that width it was taller than an A4 page could hold: it never fit under its own
 * heading, was pushed to the next page, and was still cut off at that page's bottom margin.
 *
 * Here the block is scaled down until it fits in the space actually left, keeping its aspect ratio.
 * It stays on the current page, under its heading, unless doing so would shrink it noticeably more
 * than a fresh page would — then it starts one, and is fitted to that whole page instead. Either way
 * its height never exceeds the space between the top and bottom margins, so it cannot be cut off.
 */
/**
 * @module ui/pdf-svg-fit
 * @purpose Fits a fixed-aspect SVG block into the space left on a PDF page so it is never cut off at the bottom margin, for the PDF export renderer (#579).
 * @conventions Pure arithmetic in the PDF's own units (mm), kept apart from pdf-export-render.ts so it can be unit-tested — that module's svg2pdf.js import does not load under Vitest. Aspect ratio is always preserved; the block is centred horizontally once shrunk below the content width.
 * @exports fitSvgOnPage, SvgPageArea, SvgPageFit, MIN_FRACTION_OF_FRESH_PAGE
 */

/** The drawable area of a page, in the PDF's units. */
export interface SvgPageArea {
  /** Left margin: x of the content area's left edge. */
  readonly left: number;
  /** Width between the left and right margins. */
  readonly contentWidth: number;
  /** The widest the block is ever drawn, even on an empty page — a wheel wider than this reads no better. */
  readonly maxWidth: number;
  /** y where content starts on a fresh page. */
  readonly top: number;
  /** y of the bottom margin: nothing may be drawn below it. */
  readonly bottom: number;
}

export interface SvgPageFit {
  /** True when the block should start on a fresh page rather than under what is already on this one. */
  readonly newPage: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * How small, relative to its size on a fresh page, a block may be drawn to stay under its heading.
 * Below this it moves to its own page instead: keeping a graph with its heading is worth a little
 * shrinking, not a graph too small to read. A judgement value for readability, not a domain number.
 */
export const MIN_FRACTION_OF_FRESH_PAGE = 0.75;

/** The largest width at which a block of this aspect ratio fits between `top` and `area.bottom`. */
function fitWidth(aspect: number, top: number, area: SvgPageArea): number {
  const widest = Math.min(area.contentWidth, area.maxWidth);
  return Math.max(0, Math.min(widest, (area.bottom - top) / aspect));
}

/**
 * Places an SVG of intrinsic size `svgWidth` x `svgHeight` (any units — only the ratio matters) on a
 * page whose drawing cursor is at `cursorY`.
 */
export function fitSvgOnPage(svgWidth: number, svgHeight: number, cursorY: number, area: SvgPageArea): SvgPageFit {
  if (!(svgWidth > 0) || !(svgHeight > 0)) {
    throw new RangeError(`an SVG block needs a positive size, got ${String(svgWidth)} x ${String(svgHeight)}`);
  }
  const aspect = svgHeight / svgWidth;
  const hereWidth = fitWidth(aspect, cursorY, area);
  const freshWidth = fitWidth(aspect, area.top, area);
  const newPage = hereWidth < freshWidth * MIN_FRACTION_OF_FRESH_PAGE;
  const width = newPage ? freshWidth : hereWidth;
  return {
    newPage,
    x: area.left + (area.contentWidth - width) / 2,
    y: newPage ? area.top : cursorY,
    width,
    height: width * aspect,
  };
}
