/**
 * How a saved interpretation's time is shown (#423): the viewer's local time, written out as
 * `Tuesday March 10 2026 @ 17:30`, in the language of the interface — not the raw UTC instant.
 */
import { describe, expect, it } from 'vitest';
import { formatSavedTime } from '../src/ui/saved-time.js';

describe('formatSavedTime (#423)', () => {
  it('writes the local time as Weekday Month D YYYY @ HH:mm (English)', () => {
    // 16:30 UTC is 17:30 in Amsterdam in March, before daylight saving starts.
    expect(formatSavedTime('2026-03-10T16:30:00.000Z', 'en', 'Europe/Amsterdam')).toBe('Tuesday March 10 2026 @ 17:30');
    expect(formatSavedTime('2026-03-11T12:35:00.000Z', 'en', 'UTC')).toBe('Wednesday March 11 2026 @ 12:35');
  });

  it('writes the day before the month in Dutch, with the Dutch weekday and month', () => {
    expect(formatSavedTime('2026-03-10T16:30:00.000Z', 'nl', 'Europe/Amsterdam')).toBe('dinsdag 10 maart 2026 @ 17:30');
  });

  it('uses the viewer’s zone, so the same instant reads differently elsewhere, and the date can change', () => {
    const instant = '2026-03-10T23:30:00.000Z';
    expect(formatSavedTime(instant, 'en', 'UTC')).toBe('Tuesday March 10 2026 @ 23:30');
    expect(formatSavedTime(instant, 'en', 'Europe/Amsterdam')).toBe('Wednesday March 11 2026 @ 00:30');
    expect(formatSavedTime(instant, 'en', 'America/New_York')).toBe('Tuesday March 10 2026 @ 19:30');
  });

  it('shows midnight as 00:30, never 24:30', () => {
    expect(formatSavedTime('2026-03-10T23:30:00.000Z', 'en', 'Europe/Amsterdam')).toContain('@ 00:30');
    expect(formatSavedTime('2026-03-10T00:05:00.000Z', 'nl', 'UTC')).toContain('@ 00:05');
  });

  it('follows daylight saving: the same clock time in UTC is an hour later in the Amsterdam summer', () => {
    // Amsterdam changes to summer time on Sunday 29 March 2026, at 01:00 UTC.
    expect(formatSavedTime('2026-03-29T00:30:00.000Z', 'en', 'Europe/Amsterdam')).toBe('Sunday March 29 2026 @ 01:30');
    expect(formatSavedTime('2026-03-29T01:30:00.000Z', 'en', 'Europe/Amsterdam')).toBe('Sunday March 29 2026 @ 03:30');
    expect(formatSavedTime('2026-10-25T00:30:00.000Z', 'en', 'Europe/Amsterdam')).toBe(
      'Sunday October 25 2026 @ 02:30',
    );
    expect(formatSavedTime('2026-10-25T01:30:00.000Z', 'en', 'Europe/Amsterdam')).toBe(
      'Sunday October 25 2026 @ 02:30',
    );
  });

  it('pads the hour and minute to two digits', () => {
    expect(formatSavedTime('2026-03-10T07:05:00.000Z', 'en', 'UTC')).toBe('Tuesday March 10 2026 @ 07:05');
  });

  it('shows an unreadable value as it is rather than failing', () => {
    expect(formatSavedTime('not a date', 'en', 'UTC')).toBe('not a date');
  });
});
