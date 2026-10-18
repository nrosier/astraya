// @vitest-environment jsdom
/** UI rendering contract for the shared timing timeline (#554). */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { TIMING_TIMELINE_TRACKS, type TimingTimelineTrackEvents } from '../src/domain/timing-timeline.js';
import { TimingTimelineTracks } from '../src/ui/TimingTimelineView.js';
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
        subject: { kind: 'releasing', level: 1, sign: 'Leo', ruler: 'sun', loosingOfBond: false },
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

describe('TimingTimelineTracks (#554)', () => {
  it('renders three timing techniques simultaneously under one shared date axis', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root: Root = createRoot(container);
    try {
      act(() => {
        root.render(
          <TimingTimelineTracks
            axisLabel="Shared date axis: 2000-01-01 to 2005-01-01"
            tracks={tracks}
            labels={labels}
            noEvents="No events"
            dateLabel={(jd) => `JD ${String(jd)}`}
            describe={(subject) => timelineSubjectLabel(subject, 'en')}
            range={(start, end) => `${start} to ${end}`}
            notes={{ profections: 'Birthday to birthday.' }}
          />,
        );
      });
      expect(container.querySelector('[aria-label="Shared date axis: 2000-01-01 to 2005-01-01"]')).not.toBeNull();
      for (const track of ['zodiacal-releasing', 'firdaria', 'profections']) {
        expect(container.querySelector(`#${track}-heading`)?.textContent).toBe(track);
      }
      expect(container.textContent).toContain('Leo, ruled by Sun');
      expect(container.textContent).toContain('Leo, 5th house');
      expect(container.textContent).toContain('JD 0 to JD 30');
      expect(container.querySelector('[aria-labelledby="profections-heading"] .hint')?.textContent).toBe(
        'Birthday to birthday.',
      );
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});

describe('timelineSubjectLabel (#674)', () => {
  it('words every subject in Dutch, with no English left over', () => {
    expect(
      timelineSubjectLabel({ kind: 'releasing', level: 2, sign: 'Leo', ruler: 'sun', loosingOfBond: true }, 'nl'),
    ).toBe('L2 Leeuw, met als heerser Zon (loosing of the bond)');
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
