// @vitest-environment jsdom
/** UI rendering contract for the shared timing timeline (#554) and its Gantt chart (#1237). */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import {
  TIMING_TIMELINE_TRACKS,
  type TimingTimelineEvent,
  type TimingTimelineTrackEvents,
} from '../src/domain/timing-timeline.js';
import { TimingTimelineGantt } from '../src/ui/TimingTimelineGantt.js';
import { ganttFraction, ganttRows, thinYearTicks, yearTicks } from '../src/ui/timeline-gantt.js';
import { timelineSubjectLabel } from '../src/ui/timing-timeline-labels.js';

const labels = Object.fromEntries(TIMING_TIMELINE_TRACKS.map((track) => [track, track])) as Record<
  (typeof TIMING_TIMELINE_TRACKS)[number],
  string
>;

const tracks: readonly TimingTimelineTrackEvents[] = [
  {
    track: 'zodiacal-releasing',
    events: [
      {
        kind: 'zodiacal-releasing',
        startJd: 0,
        endJd: 30,
        subject: { kind: 'releasing', lot: 'fortune', level: 1, sign: 'Leo', ruler: 'sun', loosingOfBond: false },
        sourceModule: 'fixture',
      },
    ],
  },
  {
    track: 'firdaria',
    events: [
      { kind: 'firdaria', startJd: 0, endJd: 30, subject: { kind: 'firdaria', ruler: 'sun' }, sourceModule: 'fixture' },
    ],
  },
  {
    track: 'profections',
    events: [
      {
        kind: 'profection-year',
        startJd: 0,
        endJd: 30,
        subject: { kind: 'profection', sign: 'Leo', house: 5 },
        sourceModule: 'fixture',
      },
    ],
  },
  { track: 'primary-directions', events: [] },
  { track: 'secondary-progression', events: [] },
  { track: 'solar-arc', events: [] },
  { track: 'transit', events: [] },
  { track: 'periodic-transit', events: [] },
];

describe('the timing timeline Gantt (#554, #1237)', () => {
  it('draws three timing techniques at once, one labelled row each, over one shared date axis', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root: Root = createRoot(container);
    try {
      act(() => {
        root.render(
          <TimingTimelineGantt
            rows={ganttRows(tracks, 0, 100)}
            fromJd={0}
            toJd={100}
            targetJd={50}
            label="Shared date axis: 2000-01-01 to 2005-01-01"
            trackLabels={labels}
            rowLabel={(track, count) => `${track}: ${String(count)}`}
            describe={(event) => timelineSubjectLabel(event.subject, 'en')}
            passLabel={(number, count) => `${String(number)}/${String(count)}`}
            targetTitle="Centre date"
          />,
        );
      });
      expect(container.querySelector('[aria-label="Shared date axis: 2000-01-01 to 2005-01-01"]')).not.toBeNull();
      const rows = [...container.querySelectorAll('.gantt-row')];
      expect(rows).toHaveLength(tracks.length);
      for (const track of ['zodiacal-releasing', 'firdaria', 'profections']) {
        expect(container.querySelector(`svg[aria-label="${track}: 1"]`)).not.toBeNull();
      }
      expect(container.querySelector('.gantt-bar title')?.textContent).toBe('From Fortune: Leo, ruled by Sun');
      // 30 of 100 days: the bar spans a third of the 1000-unit axis, and the target line sits in the middle.
      expect(container.querySelector('.gantt-bar')?.getAttribute('width')).toBe('300');
      expect(container.querySelector('.gantt-target')?.getAttribute('x1')).toBe('500');
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});

describe('an orb window on the Gantt (#1401)', () => {
  it('draws the window as a bar, marks the exact date inside it and labels the pass number', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root: Root = createRoot(container);
    const event: TimingTimelineEvent = {
      kind: 'periodic-transit',
      startJd: 20,
      endJd: 80,
      exactJd: 40,
      pass: { number: 2, count: 3 },
      subject: { kind: 'aspect', from: 'pluto', aspect: 'conjunction', to: 'saturn' },
      sourceModule: 'domain/periodic-transit',
    };
    try {
      act(() => {
        root.render(
          <TimingTimelineGantt
            rows={ganttRows([{ track: 'periodic-transit', events: [event] }], 0, 100)}
            fromJd={0}
            toJd={100}
            targetJd={50}
            label="axis"
            trackLabels={labels}
            rowLabel={(track, count) => `${track}: ${String(count)}`}
            describe={(e) => timelineSubjectLabel(e.subject, 'en')}
            passLabel={(number, count) => `${String(number)}/${String(count)}`}
            targetTitle="Centre date"
          />,
        );
      });
      // 20 to 80 of 100 days: a bar from 200 and 600 wide, with the exact date at 40 of 100.
      expect(container.querySelector('.gantt-bar')?.getAttribute('x')).toBe('200');
      expect(Number(container.querySelector('.gantt-bar')?.getAttribute('width'))).toBeCloseTo(600, 6);
      expect(container.querySelector('.gantt-exact')?.getAttribute('x1')).toBe('400');
      expect(container.querySelector('.gantt-pass')?.textContent).toBe('2/3');
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});

describe('the Gantt layout (#1237)', () => {
  it('places a date as a fraction of the window, clamped to it', () => {
    expect(ganttFraction(50, 0, 100)).toBe(0.5);
    expect(ganttFraction(-10, 0, 100)).toBe(0);
    expect(ganttFraction(500, 0, 100)).toBe(1);
    expect(ganttFraction(5, 10, 10)).toBe(0);
  });

  it('clamps a bar that runs past the window, and marks an event with no end as a point', () => {
    const rows = ganttRows(
      [
        {
          track: 'transit',
          events: [
            {
              kind: 'a',
              startJd: -50,
              endJd: 50,
              subject: { kind: 'firdaria', ruler: 'sun' },
              sourceModule: 'fixture',
            },
            { kind: 'b', startJd: 25, subject: { kind: 'firdaria', ruler: 'sun' }, sourceModule: 'fixture' },
            { kind: 'c', startJd: 40, endJd: 40, subject: { kind: 'firdaria', ruler: 'sun' }, sourceModule: 'fixture' },
          ],
        },
      ],
      0,
      100,
    );
    const marks = rows[0]?.marks ?? [];
    expect(marks.map((mark) => [mark.start, mark.end, mark.point])).toEqual([
      [0, 0.5, false],
      [0.25, 0.25, true],
      [0.4, 0.4, true],
    ]);
  });

  it('draws the zodiacal-releasing subperiods as the thinner level 2', () => {
    const rows = ganttRows(
      [
        {
          track: 'zodiacal-releasing',
          events: [
            {
              kind: 'x',
              startJd: 0,
              endJd: 10,
              subject: { kind: 'releasing', lot: 'spirit', level: 2, sign: 'Leo', ruler: 'sun', loosingOfBond: false },
              sourceModule: 'fixture',
            },
          ],
        },
      ],
      0,
      100,
    );
    expect(rows[0]?.marks[0]?.sub).toBe(true);
  });

  it('labels every first of January inside the window', () => {
    // JD 2451544.5 is 2000-01-01 00:00 UT; a window of just over two years holds three such days.
    const ticks = yearTicks(2451544, 2451544 + 365 * 2 + 2);
    expect(ticks.map((tick) => tick.year)).toEqual([2000, 2001, 2002]);
    expect(ticks[0]?.fraction).toBeGreaterThanOrEqual(0);
  });
  describe('thinning year ticks (#1369)', () => {
    // Ten January firsts, 2022 to 2031, over a window that ends on the last one (the 390px case: a 213px plot).
    const ticks = Array.from({ length: 10 }, (_, index) => ({ year: 2022 + index, fraction: index / 9 }));
    const minSeparation = 36;

    it('keeps labels at least the minimum apart on a narrow plot, and keeps the first and the range', () => {
      const kept = thinYearTicks(ticks, 213, minSeparation);
      expect(kept.length).toBeLessThan(ticks.length);
      expect(kept[0]?.year).toBe(2022);
      for (let i = 1; i < kept.length; i += 1) {
        const gap = ((kept[i]?.fraction ?? 0) - (kept[i - 1]?.fraction ?? 0)) * 213;
        expect(gap).toBeGreaterThanOrEqual(minSeparation);
      }
    });

    it('keeps every tick on a wide plot, and when the plot is unmeasured', () => {
      expect(thinYearTicks(ticks, 900, minSeparation)).toEqual(ticks);
      expect(thinYearTicks(ticks, 0, minSeparation)).toEqual(ticks);
    });
  });
});

describe('timelineSubjectLabel (#674)', () => {
  it('words every subject in Dutch, with no English left over', () => {
    expect(
      timelineSubjectLabel(
        { kind: 'releasing', lot: 'spirit', level: 2, sign: 'Leo', ruler: 'sun', loosingOfBond: true },
        'nl',
      ),
    ).toBe('Vanaf Spirit, L2: Leeuw, met als heerser Zon (loosing of the bond)');
    expect(timelineSubjectLabel({ kind: 'profection', sign: 'Leo', house: 5 }, 'nl')).toBe('Leeuw, 5e huis');
    expect(timelineSubjectLabel({ kind: 'firdaria', ruler: 'northNode' }, 'nl')).toBe('Noordelijke Maansknoop');
    expect(timelineSubjectLabel({ kind: 'aspect', from: 'jupiter', aspect: 'square', to: 'ic' }, 'nl')).toBe(
      'Jupiter vierkant Imum Coeli',
    );
    expect(timelineSubjectLabel({ kind: 'station', body: 'mercury', direction: 'retrograde' }, 'nl')).toBe(
      'Mercurius wordt retrograde',
    );
  });

  it('words them in English with display names, not keys', () => {
    expect(timelineSubjectLabel({ kind: 'aspect', from: 'meanNode', aspect: 'trine', to: 'asc' }, 'en')).toBe(
      'Mean Node trine Ascendant',
    );
    expect(timelineSubjectLabel({ kind: 'return', which: 'progressed-lunar-return' }, 'en')).toBe(
      'Progressed lunar return',
    );
  });
});
