/** Placing PDF text lines and keep-together blocks on pages (#665). */
import { describe, expect, it } from 'vitest';
import { flowLines, startBlock } from '../src/ui/pdf-page-flow.js';

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
