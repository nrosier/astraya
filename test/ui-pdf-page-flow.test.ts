/** Placing PDF text lines and keep-together blocks on pages (#665). */
import { describe, expect, it } from 'vitest';
import { flowLines, flowPanelRows, startBlock } from '../src/ui/pdf-page-flow.js';

const AREA = { top: 20, bottom: 282 };

describe('flowLines', () => {
  it('keeps every line on this page when they fit', () => {
    const flow = flowLines(3, 100, 6, AREA);
    expect(flow.lines).toEqual([
      { newPage: false, y: 100 },
      { newPage: false, y: 106 },
      { newPage: false, y: 112 },
    ]);
    expect(flow.y).toBe(118);
  });

  it('moves a line that would pass the bottom margin to the top of the next page', () => {
    const flow = flowLines(4, 276, 6, AREA);
    expect(flow.lines).toEqual([
      { newPage: false, y: 276 },
      { newPage: false, y: 282 },
      { newPage: true, y: 20 },
      { newPage: false, y: 26 },
    ]);
    expect(flow.y).toBe(32);
  });

  it('never draws a baseline below the bottom margin, however long the text', () => {
    const flow = flowLines(200, 250, 6, AREA);
    expect(flow.lines.every((line) => line.y <= AREA.bottom)).toBe(true);
    expect(flow.lines.filter((line) => line.newPage).length).toBeGreaterThan(3);
  });
});

describe('startBlock', () => {
  it('starts here when the kept-together baselines fit', () => {
    expect(startBlock(260, 18, AREA)).toEqual({ newPage: false, y: 260 });
  });

  it('starts a fresh page when they do not, so a heading is not left at the foot of a page', () => {
    expect(startBlock(270, 18, AREA)).toEqual({ newPage: true, y: 20 });
  });

  it('stays at the top of a page even when the block is taller than a page', () => {
    expect(startBlock(20, 400, AREA)).toEqual({ newPage: false, y: 20 });
  });
});

describe('flowPanelRows (#1648)', () => {
  const LINE_HEIGHT = 5.6;
  const twoLines = Array.from({ length: 60 }, () => 2 * LINE_HEIGHT);

  /** Baseline of every row's first line, given where its segment starts. */
  function rowBaselines(heights: readonly number[], segments: ReturnType<typeof flowPanelRows>): number[] {
    const baselines: number[] = [];
    for (const segment of segments) {
      let y = segment.top + 1;
      for (let row = segment.fromRow; row < segment.toRow; row++) {
        baselines.push(y);
        y += heights[row] ?? 0;
      }
    }
    return baselines;
  }

  it('gives a short panel one segment, identical to today height and y', () => {
    const heights = [LINE_HEIGHT, 2 * LINE_HEIGHT, LINE_HEIGHT];
    const segments = flowPanelRows(heights, 100, AREA);
    expect(segments).toEqual([{ newPage: false, top: 100, fromRow: 0, toRow: 3, height: 4 * LINE_HEIGHT + 6 }]);
  });

  it('keeps every row exactly once and in order when a long panel runs over pages', () => {
    const segments = flowPanelRows(twoLines, 60, AREA);
    expect(segments.length).toBeGreaterThan(1);
    const covered = segments.flatMap((segment) =>
      Array.from({ length: segment.toRow - segment.fromRow }, (_, i) => segment.fromRow + i),
    );
    expect(covered).toEqual(twoLines.map((_, index) => index));
  });

  it('keeps every rectangle and every row baseline inside the bottom margin', () => {
    const segments = flowPanelRows(twoLines, 60, AREA);
    for (const segment of segments) {
      expect(segment.top - 4 + segment.height).toBeLessThanOrEqual(AREA.bottom);
      expect(segment.top - 4 + segment.height).toBeGreaterThan(AREA.top);
    }
    expect(rowBaselines(twoLines, segments).every((baseline) => baseline <= AREA.bottom)).toBe(true);
  });

  it('applies the same margin rules to a panel that starts partway down the page', () => {
    const segments = flowPanelRows(twoLines, 270, AREA);
    // The first row's rectangle would pass the margin at y=270, so the whole panel starts on a fresh page.
    expect(segments[0]).toMatchObject({ newPage: true, top: AREA.top, fromRow: 0 });
    expect(segments.slice(1).every((segment) => segment.newPage && segment.top === AREA.top)).toBe(true);
    expect(segments.every((segment) => segment.top - 4 + segment.height <= AREA.bottom)).toBe(true);
    expect(rowBaselines(twoLines, segments).every((baseline) => baseline <= AREA.bottom)).toBe(true);
  });

  it('places a row taller than a page alone, clipped to the margin, and loses none', () => {
    const segments = flowPanelRows([LINE_HEIGHT, 400, LINE_HEIGHT], 20, AREA);
    expect(segments.map((segment) => [segment.fromRow, segment.toRow])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    const tall = segments[1];
    expect(tall?.top).toBe(20);
    expect(tall !== undefined && tall.top - 4 + tall.height).toBe(AREA.bottom);
  });
});
