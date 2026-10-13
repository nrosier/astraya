// @vitest-environment jsdom
/** UI rendering contract for the shared timing timeline (#554). */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { TIMING_TIMELINE_TRACKS, type TimingTimelineTrackEvents } from '../src/domain/timing-timeline.js';
import { TimingTimelineTracks } from '../src/ui/TimingTimelineView.js';

const labels = Object.fromEntries(TIMING_TIMELINE_TRACKS.map((track) => [track, track])) as Record<
  (typeof TIMING_TIMELINE_TRACKS)[number],
  string
>;

const tracks: readonly TimingTimelineTrackEvents[] = [
  {
    track: 'zodiacal-releasing',
    events: [{ kind: 'zodiacal-releasing', startJd: 0, endJd: 30, label: 'Leo / sun', sourceModule: 'fixture' }],
  },
  { track: 'firdaria', events: [{ kind: 'firdaria', startJd: 0, endJd: 30, label: 'sun', sourceModule: 'fixture' }] },
  {
    track: 'profections',
    events: [{ kind: 'profection-year', startJd: 0, endJd: 30, label: 'Leo / house 5', sourceModule: 'fixture' }],
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
          />,
        );
      });
      expect(container.querySelector('[aria-label="Shared date axis: 2000-01-01 to 2005-01-01"]')).not.toBeNull();
      for (const track of ['zodiacal-releasing', 'firdaria', 'profections']) {
        expect(container.querySelector(`#${track}-heading`)?.textContent).toBe(track);
      }
      expect(container.textContent).toContain('Leo / sun');
      expect(container.textContent).toContain('Leo / house 5');
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});
