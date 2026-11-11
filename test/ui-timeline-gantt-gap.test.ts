/**
 * Adjacent Gantt bars in a row are at least 1 rendered CSS pixel apart at any plot width (#1442).
 */
import { describe, expect, it } from 'vitest';
import { BAR_GAP_PX, barSpan } from '../src/ui/timeline-gantt.js';

describe('barSpan', () => {
  it.each([388, 1278, 1918])('keeps at least BAR_GAP_PX (3px) between two touching bars on a %i px plot', (plotPx) => {
    const a = barSpan(0.1, 0.4, 1000, plotPx, BAR_GAP_PX, 3);
    const b = barSpan(0.4, 0.7, 1000, plotPx, BAR_GAP_PX, 3);
    const gapPx = ((b.x - (a.x + a.width)) * plotPx) / 1000;
    expect(BAR_GAP_PX).toBe(3);
    expect(gapPx).toBeGreaterThanOrEqual(BAR_GAP_PX - 1e-9);
  });

  it('never gives a short bar a negative or too-small width', () => {
    const tiny = barSpan(0.5, 0.5001, 1000, 388, BAR_GAP_PX, 3);
    expect(tiny.width).toBe(3);
    expect(tiny.x).toBeCloseTo(500.05 - 1.5, 6);
  });

  it('draws no inset before the plot is measured', () => {
    expect(barSpan(0, 0.5, 1000, 0, 2, 3)).toEqual({ x: 0, width: 500 });
  });
});
