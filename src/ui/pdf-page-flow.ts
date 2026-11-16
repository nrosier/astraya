/**
 * Where lines of text go on PDF pages (#665).
 *
 * The renderer used to check for room only before it started a paragraph, then drew every line of
 * it, so a long paragraph that started near the foot of a page ran past the bottom margin. A body
 * heading or a placement label could also be the last thing on a page, with its text on the next.
 *
 * Here each line is placed on its own: one that would fall below the bottom margin starts the next
 * page instead. A block that must not be split from what follows (a heading with the first lines of
 * its text) is moved to a fresh page as a whole when it does not fit in what is left of this one.
 */
/**
 * @module ui/pdf-page-flow
 * @purpose Places lines and keep-together blocks of PDF text on pages so nothing is drawn past the bottom margin and no heading is left alone at the foot of a page (#665).
 * @conventions Pure arithmetic in the PDF's own units (mm), kept apart from pdf-export-render.ts so it can be unit-tested — that module's svg2pdf.js import does not load under Vitest. A y value is a text baseline, as jsPDF's `text` takes it; a line fits when its baseline is at or above the bottom margin.
 * @exports PageFlowArea, PagePlacement, PanelSegment, startBlock, flowLines, flowPanelRows
 */

/** The vertical extent of a page's content area, in the PDF's units. */
export interface PageFlowArea {
  /** Baseline of the first line on a fresh page. */
  readonly top: number;
  /** The bottom margin: no baseline may fall below it. */
  readonly bottom: number;
}

export interface PagePlacement {
  /** True when this starts a fresh page. */
  readonly newPage: boolean;
  readonly y: number;
}

/**
 * Where a block starts whose first baseline is at `y` and whose last kept-together baseline is
 * `needed` below it: here when that fits above the bottom margin, otherwise at the top of a fresh
 * page. A block that already starts at the top of a page stays there, even when it is taller than
 * the page, since another page would not hold it either.
 */
export function startBlock(y: number, needed: number, area: PageFlowArea): PagePlacement {
  if (y + needed <= area.bottom || y <= area.top) return { newPage: false, y };
  return { newPage: true, y: area.top };
}

/**
 * Baselines for `count` lines `lineHeight` apart, starting at `y`. A line that would fall below the
 * bottom margin starts the next page. Also returns the y the next block starts at.
 */
export function flowLines(
  count: number,
  y: number,
  lineHeight: number,
  area: PageFlowArea,
): { readonly lines: readonly PagePlacement[]; readonly y: number } {
  const lines: PagePlacement[] = [];
  let current = y;
  for (let index = 0; index < count; index++) {
    if (current > area.bottom && current > area.top) {
      lines.push({ newPage: true, y: area.top });
      current = area.top;
    } else {
      lines.push({ newPage: false, y: current });
    }
    current += lineHeight;
  }
  return { lines, y: current };
}

/**
 * A run of consecutive rows of a tinted panel (#1648), drawn in one rectangle. The rectangle's top
 * sits 4 mm above `top`, its height is the rows plus 6 mm, and the first row's baseline is 1 mm below
 * `top`, as the panel has always been drawn.
 */
export interface PanelSegment {
  /** True when this segment starts a fresh page. */
  readonly newPage: boolean;
  /** The y the segment starts at: the rectangle's top is 4 mm above it, the first row's baseline 1 mm below. */
  readonly top: number;
  /** The first row in this segment. */
  readonly fromRow: number;
  /** The row after this segment (exclusive). */
  readonly toRow: number;
  /** The rectangle's height: the segment's rows plus 6 mm. */
  readonly height: number;
}

const PANEL_RECT_ABOVE = 4;
const PANEL_PADDING = 6;

/**
 * Splits a panel's rows across pages (#1648). A row is never split and goes on the current page while
 * its rectangle's bottom stays at or above the bottom margin; otherwise the panel continues at the top
 * of a fresh page. A row taller than a whole page is placed on a page of its own, its rectangle
 * clipped to the margin, and the rows after it start a fresh page.
 */
export function flowPanelRows(rowHeights: readonly number[], y: number, area: PageFlowArea): readonly PanelSegment[] {
  const segments: PanelSegment[] = [];
  const bottomWith = (segmentTop: number, rows: number): number => segmentTop - PANEL_RECT_ABOVE + rows + PANEL_PADDING;
  let top = y;
  let newPage = false;
  let fromRow = 0;
  let used = 0;
  let row = 0;
  while (row < rowHeights.length) {
    const height = rowHeights[row] ?? 0;
    if (bottomWith(top, used + height) <= area.bottom) {
      used += height;
      row++;
    } else if (used > 0) {
      segments.push({ newPage, top, fromRow, toRow: row, height: used + PANEL_PADDING });
      top = area.top;
      newPage = true;
      fromRow = row;
      used = 0;
    } else if (top <= area.top) {
      segments.push({ newPage, top, fromRow: row, toRow: row + 1, height: area.bottom - top + PANEL_RECT_ABOVE });
      row++;
      top = area.top;
      newPage = true;
      fromRow = row;
    } else {
      top = area.top;
      newPage = true;
    }
  }
  if (fromRow < rowHeights.length || rowHeights.length === 0) {
    segments.push({ newPage, top, fromRow, toRow: rowHeights.length, height: used + PANEL_PADDING });
  }
  return segments;
}
