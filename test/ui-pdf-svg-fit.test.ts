/**
 * #579: a chart SVG in the PDF export must fit in the space left on its page, under its heading,
 * and never run past the bottom margin — including a chart sheet taller than an A4 page holds at
 * full width, which used to be pushed to the next page and still cut off there.
 */
import { describe, expect, it } from 'vitest';
import { fitSvgOnPage, MIN_FRACTION_OF_FRESH_PAGE, type SvgPageArea } from '../src/ui/pdf-svg-fit.js';

// A4 portrait in mm with the renderer's own margins: 210 x 297, 15 mm margins, content from y = 20.
const A4: SvgPageArea = { left: 15, contentWidth: 180, maxWidth: 160, top: 20, bottom: 282 };

describe('fitSvgOnPage (#579)', () => {
  it('draws a square wheel at the usual 160 mm when there is room, centred', () => {
    const fit = fitSvgOnPage(800, 800, 40, A4);
    expect(fit).toEqual({ newPage: false, x: 25, y: 40, width: 160, height: 160 });
  });

  it('shrinks a sheet taller than the page so it fits under its heading, instead of moving it', () => {
    // A chart sheet roughly twice as tall as it is wide: 160 mm wide it would need 320 mm.
    const cursorY = 40;
    const fit = fitSvgOnPage(1000, 2000, cursorY, A4);
    expect(fit.newPage).toBe(false);
    expect(fit.y).toBe(cursorY);
    expect(fit.y + fit.height).toBeCloseTo(A4.bottom, 9);
    expect(fit.height / fit.width).toBeCloseTo(2, 9);
  });

  it('never draws past the bottom margin, wherever the cursor is', () => {
    for (const cursorY of [20, 60, 120, 200, 260, 281]) {
      for (const [w, h] of [
        [800, 800],
        [1000, 2400],
        [1600, 900],
      ] as const) {
        const fit = fitSvgOnPage(w, h, cursorY, A4);
        expect(fit.y + fit.height).toBeLessThanOrEqual(A4.bottom + 1e-9);
        expect(fit.width).toBeLessThanOrEqual(A4.maxWidth + 1e-9);
        expect(fit.x).toBeGreaterThanOrEqual(A4.left);
        expect(fit.x + fit.width).toBeLessThanOrEqual(A4.left + A4.contentWidth + 1e-9);
      }
    }
  });

  it('starts a fresh page, fitted to all of it, when staying would shrink it too far', () => {
    const fit = fitSvgOnPage(800, 800, 220, A4);
    expect(fit.newPage).toBe(true);
    expect(fit).toEqual({ newPage: true, x: 25, y: 20, width: 160, height: 160 });
  });

  it('switches pages exactly at the documented threshold', () => {
    // Square block: fresh-page width is 160; staying gives (282 - y). Threshold y = 282 - 0.75 * 160.
    const threshold = A4.bottom - MIN_FRACTION_OF_FRESH_PAGE * 160;
    expect(fitSvgOnPage(800, 800, threshold, A4).newPage).toBe(false);
    expect(fitSvgOnPage(800, 800, threshold + 0.01, A4).newPage).toBe(true);
  });

  it('keeps a wide, short block at the width cap rather than stretching it to the content width', () => {
    const fit = fitSvgOnPage(2000, 500, 40, A4);
    expect(fit.width).toBe(160);
    expect(fit.height).toBe(40);
  });

  it('rejects a zero or non-finite size instead of drawing a NaN-sized block', () => {
    expect(() => fitSvgOnPage(0, 100, 40, A4)).toThrow(RangeError);
    expect(() => fitSvgOnPage(100, Number.NaN, 40, A4)).toThrow(RangeError);
  });
});
