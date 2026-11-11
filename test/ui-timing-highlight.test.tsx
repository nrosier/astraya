// @vitest-environment jsdom
/** #1442: the Gantt and the events table share a hovered and a selected event, in both directions. */
import { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { TIMING_TIMELINE_TRACKS, type TimingTimelineTrackEvents } from '../src/domain/timing-timeline.js';
import { SortableTable } from '../src/ui/SortableTable.js';
import { TimingTimelineGantt } from '../src/ui/TimingTimelineGantt.js';
import { barLabelFits, ganttRows } from '../src/ui/timeline-gantt.js';

const labels = Object.fromEntries(TIMING_TIMELINE_TRACKS.map((track) => [track, track])) as Record<
  (typeof TIMING_TIMELINE_TRACKS)[number],
  string
>;
const tracks: readonly TimingTimelineTrackEvents[] = [
  {
    track: 'firdaria',
    events: [
      { kind: 'firdaria', startJd: 0, endJd: 30, subject: { kind: 'firdaria', ruler: 'sun' }, sourceModule: 'fixture' },
      {
        kind: 'firdaria',
        startJd: 40,
        endJd: 70,
        subject: { kind: 'firdaria', ruler: 'moon' },
        sourceModule: 'fixture',
      },
    ],
  },
  {
    track: 'profections',
    events: [
      {
        kind: 'profection-year',
        startJd: 0,
        endJd: 50,
        subject: { kind: 'profection', sign: 'Leo', house: 5 },
        sourceModule: 'fixture',
      },
    ],
  },
];
const marks = ganttRows(tracks, 0, 100).flatMap((row) => row.marks);
const keys = marks.map((mark) => mark.key);

interface Row {
  readonly key: string;
}

function Harness({ log }: { log: string[] }): React.JSX.Element {
  const [hovered, setHovered] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const rows: readonly Row[] = keys.map((key) => ({ key }));
  return (
    <>
      <TimingTimelineGantt
        rows={ganttRows(tracks, 0, 100)}
        fromJd={0}
        toJd={100}
        targetJd={50}
        label="axis"
        trackLabels={labels}
        rowLabel={(track, count) => `${track}: ${String(count)}`}
        describe={() => 'event'}
        barLabel={() => 'Label'}
        passLabel={() => ''}
        targetTitle="Centre"
        hoveredKey={hovered}
        selectedKey={selected}
        onHover={setHovered}
        onSelect={(key) => {
          log.push(`bar:${key}`);
          setSelected(key);
        }}
      />
      <SortableTable
        caption="Rows"
        columns={[{ key: 'key', label: 'Key', valueOf: (row: Row) => row.key }]}
        rows={rows}
        getRowKey={(row) => row.key}
        selectedRowKey={selected}
        linking={{
          hoveredKey: hovered,
          onHover: setHovered,
          onSelect: (key) => {
            log.push(`row:${key}`);
            setSelected(key);
          },
        }}
      />
    </>
  );
}

function mount(log: string[]): { container: HTMLElement; root: Root } {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Harness log={log} />);
  });
  return { container, root };
}

const mark = (container: HTMLElement, key: string): Element => {
  const found = container.querySelector(`[data-mark-key="${key}"]`);
  if (found === null) throw new Error(`no mark ${key}`);
  return found;
};
const row = (container: HTMLElement, key: string): HTMLElement => {
  const found = container.querySelector<HTMLElement>(`tr[data-row-key="${key}"]`);
  if (found === null) throw new Error(`no row ${key}`);
  return found;
};
const fire = (element: Element, type: string): void => {
  act(() => {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  });
};

describe('two-way highlighting (#1442)', () => {
  it('hovering a bar highlights its row and dims the other bars', () => {
    const { container, root } = mount([]);
    try {
      const [first, second, third] = keys as [string, string, string];
      fire(mark(container, first), 'mouseover');
      expect(mark(container, first).classList.contains('gantt-hovered')).toBe(true);
      expect(mark(container, second).classList.contains('gantt-dim')).toBe(true);
      expect(mark(container, third).classList.contains('gantt-dim')).toBe(true);
      expect(mark(container, first).classList.contains('gantt-dim')).toBe(false);
      expect(row(container, first).classList.contains('data-table-row-hovered')).toBe(true);
      expect(row(container, second).classList.contains('data-table-row-hovered')).toBe(false);
      fire(mark(container, first), 'mouseout');
      expect(container.querySelector('.gantt-dim')).toBeNull();
      expect(container.querySelector('.data-table-row-hovered')).toBeNull();
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('hovering a row brightens its bar and dims the others; focusing a row does the same', () => {
    const { container, root } = mount([]);
    try {
      const [first, second] = keys as [string, string];
      fire(row(container, second), 'mouseover');
      expect(mark(container, second).classList.contains('gantt-hovered')).toBe(true);
      expect(mark(container, first).classList.contains('gantt-dim')).toBe(true);
      fire(row(container, second), 'mouseout');
      expect(container.querySelector('.gantt-dim')).toBeNull();
      act(() => {
        row(container, first).focus();
      });
      expect(mark(container, first).classList.contains('gantt-hovered')).toBe(true);
      expect(mark(container, second).classList.contains('gantt-dim')).toBe(true);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('a dimmed bar draws no label, the hovered bar keeps it, and a narrow bar draws none', () => {
    // jsdom has no layout: give the plot a width and a resize observer so the chart can tell which bars are wide enough.
    const widthOf = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
    globalThis.ResizeObserver = class {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    };
    const { container, root } = mount([]);
    try {
      const [first, second] = keys as [string, string];
      // The 30 and 50 day bars are 300 and 500 px wide of 1000: all three hold "Label".
      expect(container.querySelectorAll('.gantt-bar-label')).toHaveLength(3);
      fire(mark(container, first), 'mouseover');
      expect(container.querySelectorAll('.gantt-bar-label')).toHaveLength(1);
      fire(mark(container, first), 'mouseout');
      fire(row(container, second), 'mouseover');
      expect(container.querySelectorAll('.gantt-bar-label')).toHaveLength(1);
      expect(barLabelFits('Label', 20, 12)).toBe(false);
      expect(barLabelFits('', 400, 12)).toBe(false);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
      if (widthOf !== undefined) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthOf);
      else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
    }
  });

  it('clicking a bar or a row selects that event, and Enter or Space on a row selects it too', () => {
    const log: string[] = [];
    const { container, root } = mount(log);
    try {
      const [first, second, third] = keys as [string, string, string];
      fire(mark(container, first), 'click');
      expect(mark(container, first).classList.contains('gantt-selected')).toBe(true);
      expect(row(container, first).getAttribute('aria-current')).toBe('true');
      fire(row(container, second), 'click');
      expect(mark(container, second).classList.contains('gantt-selected')).toBe(true);
      expect(mark(container, first).classList.contains('gantt-selected')).toBe(false);
      for (const key of ['Enter', ' ']) {
        act(() => {
          row(container, third).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        });
      }
      expect(log).toEqual([`bar:${first}`, `row:${second}`, `row:${third}`, `row:${third}`]);
      expect(row(container, third).tabIndex).toBe(0);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});
