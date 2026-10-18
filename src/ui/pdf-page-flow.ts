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
 * @exports PageFlowArea, PagePlacement, startBlock, flowLines
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
