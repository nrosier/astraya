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

describe('stackSameDayExacts (owner review, #1442)', () => {
  it('draws one exact mark with a count when several exacts fall on the same day, and leaves a lone exact alone', async () => {
    const { stackSameDayExacts } = await import('../src/ui/timeline-gantt.js');
    const mark = (key: string, exactJd: number) =>
      ({
        key,
        start: 0.4,
        end: 0.6,
        point: false,
        sub: false,
        exact: 0.5,
        event: {
          exactJd,
          startJd: exactJd - 1,
          endJd: exactJd + 1,
          kind: 'periodic-transit',
          subject: { kind: 'aspect' },
        },
      }) as unknown as GanttMark;
    // Three exacts on 11 Nov (JD 0.25, 0.5, 0.75 of that day), one alone on 20 Nov.
    const day = 2461000;
    const stacked = stackSameDayExacts([
      mark('a', day + 0.25),
      mark('b', day + 0.5),
      mark('c', day + 0.75),
      mark('d', day + 9),
    ]);
    expect(stacked).toHaveLength(2);
    expect(stacked[0]?.stackCount).toBe(3);
    expect(stacked[0]?.stacked).toHaveLength(3);
    expect(stacked[1]?.stackCount).toBe(1);
  });
});
