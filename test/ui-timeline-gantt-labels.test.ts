/**
 * In-bar Gantt labels never overlap (#1442): a label is drawn only when it fits its bar and clears the exact-date mark,
 * pass label and earlier labels of the row.
 */
import { describe, expect, it } from 'vitest';
import { visibleBarLabels, type GanttMark } from '../src/ui/timeline-gantt.js';

function mark(key: string, start: number, end: number, exact?: number): GanttMark {
  const base = { key, start, end, point: false, sub: false, event: {} as GanttMark['event'] };
  return exact === undefined ? base : { ...base, exact };
}

describe('visibleBarLabels', () => {
  it('draws a label that fits and hides one that does not', () => {
    const shown = visibleBarLabels(
      [
        { mark: mark('wide', 0, 0.5), text: 'Saturn square Sun' },
        { mark: mark('narrow', 0.6, 0.65), text: 'Saturn square Sun' },
      ],
      1000,
      12,
    );
    expect([...shown]).toEqual(['wide']);
  });

  it('hides a label that would run over the exact-date mark and pass label of its window', () => {
    const shown = visibleBarLabels(
      [{ mark: mark('orb', 0, 0.5, 0.02), text: 'Saturn square Sun', passText: '2/3' }],
      1000,
      12,
    );
    expect(shown.size).toBe(0);
  });

  it('keeps the earlier of two labels that would touch', () => {
    const shown = visibleBarLabels(
      [
        { mark: mark('a', 0, 0.5), text: 'Saturn square Sun' },
        { mark: mark('b', 0, 0.5), text: 'Saturn square Sun' },
      ],
      1000,
      12,
    );
    expect([...shown]).toEqual(['a']);
  });
});

describe('forecastBand (#1442)', () => {
  it('spans the forecast transits in a row as one band with their count, and is absent when there are none', async () => {
    const { forecastBand } = await import('../src/ui/timeline-gantt.js');
    const transit = (start: number, end: number) =>
      ({
        key: `t${String(start)}`,
        start,
        end,
        point: false,
        sub: false,
        event: { kind: 'periodic-transit', startJd: 0, subject: { kind: 'aspect' } },
      }) as unknown as GanttMark;
    const band = forecastBand([transit(0.2, 0.3), transit(0.25, 0.4), transit(0.6, 0.7)]);
    expect(band).toEqual({ start: 0.2, end: 0.7, count: 3 });
    expect(forecastBand([])).toBeUndefined();
  });
});
