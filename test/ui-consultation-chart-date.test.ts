/**
 * #800 round 2: the Consultation's "View Chart Wheel" carries the selected day to the chart route as `?date=`, so the
 * wheel opens on that day. A malformed or impossible date is dropped rather than opening a chart on a wrong day.
 */
import { describe, expect, it } from 'vitest';
import { newId } from '../src/domain/id.js';
import { chartHref, parseRoute, routeHref } from '../src/ui/route.js';

const ID = newId('p');

describe('the chart route carries a date (#800)', () => {
  it('writes the date as a query parameter on the wheel', () => {
    expect(routeHref({ kind: 'chart', personId: ID, date: '2026-10-30' })).toBe(
      `#/people/${ID}/charts/natal/wheel?date=2026-10-30`,
    );
  });

  it('writes compare and date together, compare first, joined by &', () => {
    expect(
      routeHref({
        kind: 'chart',
        personId: ID,
        chartType: 'natal',
        view: 'wheel',
        compareType: 'draconic',
        date: '2026-10-30',
      }),
    ).toBe(`#/people/${ID}/charts/natal/wheel?compare=draconic&date=2026-10-30`);
  });

  it('reads the date back, so the route round-trips', () => {
    const route = { kind: 'chart', personId: ID, chartType: 'natal', view: 'wheel', date: '2026-10-30' } as const;
    expect(parseRoute(routeHref(route))).toEqual(route);
  });

  it('keeps the chart identical when no date is given', () => {
    expect(routeHref({ kind: 'chart', personId: ID })).toBe(`#/people/${ID}/charts/natal/wheel`);
    expect(parseRoute(`#/people/${ID}/charts/natal/wheel`)).toEqual({
      kind: 'chart',
      personId: ID,
      chartType: 'natal',
      view: 'wheel',
    });
  });

  it('drops a date that is not a real calendar day', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-5', '30-10-2026', 'today', '']) {
      expect(parseRoute(`#/people/${ID}/charts/natal/wheel?date=${bad}`)).toEqual({
        kind: 'chart',
        personId: ID,
        chartType: 'natal',
        view: 'wheel',
      });
    }
  });

  it('accepts a leap day', () => {
    expect(parseRoute(`#/people/${ID}/charts/natal/wheel?date=2028-02-29`)).toMatchObject({ date: '2028-02-29' });
  });

  it('chartHref writes the date for the Consultation wheel link', () => {
    expect(chartHref(ID, 'wheel', 'natal', undefined, '2026-10-30')).toBe(
      `#/people/${ID}/charts/natal/wheel?date=2026-10-30`,
    );
    expect(chartHref(ID, 'wheel', 'natal')).toBe(`#/people/${ID}/charts/natal/wheel`);
  });
});
