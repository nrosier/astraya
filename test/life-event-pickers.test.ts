/**
 * Life events as date pickers (#1399, slice S5): the pure option list, and the return in force at an event, checked
 * against `computeLunarReturns` / `computeSolarReturn` on the real Swiss Ephemeris engine (no mocks).
 */
import { describe, expect, it } from 'vitest';
import { returnInForceAtEvent } from '../src/domain/life-event-return.js';
import { computeLunarReturns } from '../src/domain/lunar-returns.js';
import { computeSolarReturn } from '../src/domain/solar-return.js';
import { lifeEventPickerOptions, type LifeEvent } from '../src/domain/life-events.js';
import { julianDayFor } from '../src/time/julian.js';
import { resolveMoment } from '../src/time/resolve.js';
import type { BirthMomentInput } from '../src/time/types.js';
import { getEngine } from './engine-harness.js';

const NATAL: BirthMomentInput = {
  civil: { year: 1990, month: 6, day: 15, hour: 14, minute: 30, second: 0 },
  coordinates: { latitude: 38.7478, longitude: -85.0672 },
  offsetOverrideMinutes: -300,
};

describe('lifeEventPickerOptions', () => {
  it('orders by date then time, untimed after timed on the same day, and labels the date', () => {
    const events: LifeEvent[] = [
      { id: 'c', date: '2001-05-05', label: 'Untimed' },
      { id: 'b', date: '2001-05-05', time: '18:00', label: 'Evening' },
      { id: 'a', date: '1999-01-02', label: 'Earlier' },
      { id: 'd', date: '2001-05-05', time: '08:15', label: 'Morning' },
    ];
    expect(lifeEventPickerOptions(events)).toEqual([
      { id: 'a', isoDate: '1999-01-02', dateLabel: '1999-01-02', label: 'Earlier' },
      { id: 'd', isoDate: '2001-05-05', dateLabel: '2001-05-05 08:15', label: 'Morning' },
      { id: 'b', isoDate: '2001-05-05', dateLabel: '2001-05-05 18:00', label: 'Evening' },
      { id: 'c', isoDate: '2001-05-05', dateLabel: '2001-05-05', label: 'Untimed' },
    ]);
  });

  it('is empty for no events', () => {
    expect(lifeEventPickerOptions([])).toEqual([]);
  });
});

describe('returnInForceAtEvent', () => {
  it('lunar: picks the last return before the event, confirmed against computeLunarReturns', async () => {
    const engine = await getEngine();
    const natalJd = await julianDayFor(engine, resolveMoment(NATAL));
    const window = await computeLunarReturns(NATAL, natalJd + 3650, natalJd + 3650 + 120, engine);
    const [, second, third] = window.returns;
    if (second === undefined || third === undefined) throw new Error('expected at least three returns in 120 days');

    // An event midway between two returns is in force of the earlier one.
    const middle = (second.returnJd + third.returnJd) / 2;
    const utc = new Date((middle - 2440587.5) * 86_400_000);
    const iso = utc.toISOString();
    // Noon local on that date is within a day of the midpoint, far inside the ~27-day gap.
    const event: LifeEvent = { id: 'e', date: iso.slice(0, 10), label: 'Mid-cycle' };
    const found = await returnInForceAtEvent('lunar-return', event, NATAL, engine);

    expect(Math.abs(Date.parse(iso) - Date.parse(`${event.date}T12:00:00Z`))).toBeLessThan(86_400_000);
    expect(found.returnJd).toBeCloseTo(second.returnJd, 6);
    expect(found.utcDate).toBe(new Date((second.returnJd - 2440587.5) * 86_400_000).toISOString().slice(0, 10));
  });

  it('solar: picks the return of the event year, or the previous year before it', async () => {
    const engine = await getEngine();
    const return2005 = await computeSolarReturn(NATAL, 2005, engine);
    const return2004 = await computeSolarReturn(NATAL, 2004, engine);
    const after = await returnInForceAtEvent(
      'solar-return',
      { id: 'a', date: '2005-12-01', label: 'x' },
      NATAL,
      engine,
    );
    expect(after.returnJd).toBeCloseTo(return2005.returnJd, 6);
    expect(after.year).toBe(2005);
    const before = await returnInForceAtEvent(
      'solar-return',
      { id: 'b', date: '2005-02-01', label: 'x' },
      NATAL,
      engine,
    );
    expect(before.returnJd).toBeCloseTo(return2004.returnJd, 6);
    expect(before.year).toBe(2004);
  });
});
