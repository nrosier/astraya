/**
 * Tests for the shared TimingTimelineEvent adapters (#554).
 *
 * The releasing/firdaria adapters are pure and tested with fixed inputs; the profections
 * adapter is tested against the real engine (via `computeProfections`), since `ProfectionData`
 * itself only comes from a real houses call.
 */
import { describe, expect, it } from 'vitest';
import { firdariaPeriods } from '../src/astrology/firdaria.js';
import { zodiacalReleasingPeriods, zodiacalReleasingSubperiods } from '../src/astrology/zodiacal-releasing.js';
import { computeProfections } from '../src/domain/profections.js';
import {
  firdariaPeriodsToTimelineEvents,
  profectionToTimelineEvents,
  releasingPeriodsToTimelineEvents,
  releasingSubperiodsToTimelineEvents,
  timingTimelineTracks,
} from '../src/domain/timing-timeline.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

describe('releasingPeriodsToTimelineEvents (#554)', () => {
  it('carries each period’s own boundaries and labels it by sign and ruler', () => {
    const periods = zodiacalReleasingPeriods(35, 0, 2); // Taurus/Venus, then Gemini/Mercury
    const events = releasingPeriodsToTimelineEvents(periods);
    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe('zodiacal-releasing');
    expect(events[0]?.startJd).toBe(periods[0]?.startJd);
    expect(events[0]?.endJd).toBe(periods[0]?.endJd);
    expect(events[0]?.subject).toEqual({
      kind: 'releasing',
      level: 1,
      sign: 'Taurus',
      ruler: 'venus',
      loosingOfBond: false,
    });
    expect(events[0]?.sourceModule).toBe('astrology/zodiacal-releasing');
  });
});

describe('releasingSubperiodsToTimelineEvents (#554)', () => {
  it('keeps Level-2 periods on the zodiacal-releasing track and makes a bond release visible', () => {
    const parent = zodiacalReleasingPeriods(305, 0, 1)[0];
    if (parent === undefined) throw new Error('fixture bug: no parent period');
    const events = releasingSubperiodsToTimelineEvents(zodiacalReleasingSubperiods(parent));
    expect(
      events.some(
        (event) =>
          event.subject.kind === 'releasing' &&
          event.subject.level === 2 &&
          event.subject.sign === 'Leo' &&
          event.subject.ruler === 'sun' &&
          event.subject.loosingOfBond,
      ),
    ).toBe(true);
    expect(events.every((event) => event.kind === 'zodiacal-releasing')).toBe(true);
  });
});

describe('firdariaPeriodsToTimelineEvents (#554)', () => {
  it('carries each period’s own boundaries and labels it by ruler', () => {
    const periods = firdariaPeriods('day', 0, 2); // Sun then Venus
    const events = firdariaPeriodsToTimelineEvents(periods);
    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe('firdaria');
    expect(events[0]?.subject).toEqual({ kind: 'firdaria', ruler: 'sun' });
    expect(events[0]?.startJd).toBe(periods[0]?.startJd);
    expect(events[0]?.endJd).toBe(periods[0]?.endJd);
  });
});

describe('profectionToTimelineEvents (#554)', () => {
  it('reconstructs year/month boundaries that bracket the target moment', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const targetJd = natalJd + 5.5 * 365.2425; // mid-way through age 5

    const profected = await computeProfections(NATAL, targetJd, engine);
    const [yearEvent, monthEvent] = profectionToTimelineEvents(profected);

    expect(yearEvent?.kind).toBe('profection-year');
    expect(yearEvent?.startJd).toBeLessThanOrEqual(targetJd);
    expect(yearEvent?.endJd).toBeGreaterThan(targetJd);

    expect(monthEvent?.kind).toBe('profection-month');
    expect(monthEvent?.startJd).toBeLessThanOrEqual(targetJd);
    expect(monthEvent?.endJd).toBeGreaterThan(targetJd);
    // The month window sits inside the year window.
    expect(monthEvent?.startJd ?? 0).toBeGreaterThanOrEqual(yearEvent?.startJd ?? 0);
    expect(monthEvent?.endJd ?? 0).toBeLessThanOrEqual(yearEvent?.endJd ?? 0);
  });
});

describe('timingTimelineTracks (#554)', () => {
  it('overlays at least three techniques on one requested date range', () => {
    const tracks = timingTimelineTracks(
      [
        {
          kind: 'zodiacal-releasing',
          startJd: 0,
          endJd: 100,
          subject: { kind: 'firdaria', ruler: 'mars' },
          sourceModule: 'fixture',
        },
        {
          kind: 'firdaria',
          startJd: 0,
          endJd: 100,
          subject: { kind: 'firdaria', ruler: 'sun' },
          sourceModule: 'fixture',
        },
        {
          kind: 'profection-year',
          startJd: 20,
          endJd: 40,
          subject: { kind: 'profection', sign: 'Leo', house: 5 },
          sourceModule: 'fixture',
        },
        {
          kind: 'transit',
          startJd: 30,
          endJd: 30,
          subject: { kind: 'aspect', from: 'mars', aspect: 'square', to: 'sun' },
          sourceModule: 'fixture',
        },
      ],
      25,
      35,
    );

    expect(tracks.filter((track) => track.events.length > 0).map((track) => track.track)).toEqual([
      'zodiacal-releasing',
      'firdaria',
      'profections',
      'transit',
    ]);
  });
});
