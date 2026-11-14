/**
 * #1400 (owner answer A1): each extra ring's date has its own query parameter on the natal chart route
 * (`?transit=`, `?progressed=`, `?directed=`, `?solararc=`, `?return=`); the older `?date=` still opens the transit ring.
 */
import { describe, expect, it } from 'vitest';
import { newId } from '../src/domain/id.ts';
import { chartHref, hashWithOverlayDates, parseRoute, routeHref } from '../src/ui/route.ts';

const ID = newId('p');
const base = routeHref({ kind: 'chart', personId: ID });

describe('chart route ring dates (#1400)', () => {
  it('parses one date per ring and keeps the older ?date= as the transit ring', () => {
    const route = parseRoute(`${base}?progressed=2027-01-02&directed=2028-02-03&solararc=2029-03-04&return=2030-04-05`);
    expect(route).toMatchObject({
      kind: 'chart',
      ringDates: { progressed: '2027-01-02', directed: '2028-02-03', solarArc: '2029-03-04', return: '2030-04-05' },
    });
    expect(parseRoute(`${base}?date=2026-05-06`)).toMatchObject({ date: '2026-05-06' });
    expect(parseRoute(`${base}?transit=2026-07-08&date=2026-05-06`)).toMatchObject({ date: '2026-07-08' });
  });

  it('drops a malformed or impossible ring date', () => {
    const route = parseRoute(`${base}?progressed=2027-02-30&return=nope`);
    expect(route).toMatchObject({ kind: 'chart' });
    expect(route).not.toHaveProperty('ringDates');
  });

  it('round-trips through routeHref and chartHref', () => {
    const route = { kind: 'chart', personId: ID, date: '2026-05-06', ringDates: { solarArc: '2029-03-04' } } as const;
    expect(parseRoute(routeHref(route))).toEqual({ ...route, chartType: 'natal', view: 'wheel' });
    expect(chartHref(ID, 'wheel', 'natal', undefined, '2026-05-06', { return: '2030-04-05' })).toContain(
      'return=2030-04-05',
    );
    expect(routeHref(route)).toContain('solararc=2029-03-04');
  });

  it('writes ring dates on Apply: a ring that is off is dropped and the old date= becomes transit=', () => {
    const hash = `${base}?date=2026-05-06&progressed=2027-01-02&compare=harmonic`;
    const next = hashWithOverlayDates(hash, { transit: '2026-09-09', solarArc: '2029-03-04' });
    const query = new URLSearchParams(next.split('?')[1]);
    expect(Object.fromEntries(query)).toEqual({ compare: 'harmonic', transit: '2026-09-09', solararc: '2029-03-04' });
    expect(hashWithOverlayDates(`${base}?date=2026-05-06`, {})).toBe(base);
  });
});
