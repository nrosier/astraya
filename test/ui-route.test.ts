/**
 * Tests for hash routing, on the one canonical scheme (docs/UI-UX_IMPLEMENTATION_PLAN.md §3).
 *
 * The failures worth catching are the quiet ones: a link that lands on the home page
 * instead of the screen it names, and a mistyped person id that opens the form and reports
 * a person who never existed as deleted. Both look like the app working.
 */
import { describe, expect, it } from 'vitest';
import { newId } from '../src/domain/id.js';
import { CHART_TYPES, CHART_VIEWS } from '../src/ui/chart-sections.js';
import {
  chartHref,
  PREFERENCES_SECTIONS,
  parseRoute,
  personHref,
  routeHref,
  setPasswordToken,
  setupToken,
  type Route,
} from '../src/ui/route.js';

const ID = newId('p');

/** One of every route kind, with every optional part present where it has one, and the same without. */
const ROUTES: readonly Route[] = [
  { kind: 'about' },
  { kind: 'changelog' },
  { kind: 'people' },
  { kind: 'person', personId: ID },
  { kind: 'person-overview', personId: ID },
  { kind: 'chart', personId: ID, chartType: 'natal', view: 'wheel' },
  { kind: 'report', personId: ID },
  { kind: 'timing-timeline', personId: ID },
  { kind: 'profections', personId: ID },
  { kind: 'progressions', personId: ID },
  { kind: 'solar-arc', personId: ID },
  { kind: 'primary-directions', personId: ID },
  { kind: 'transit', personId: ID },
  { kind: 'periodic-transit', personId: ID },
  { kind: 'synastry', personId: ID },
  { kind: 'composite', personId: ID },
  { kind: 'composite', personId: ID, view: 'aspects' },
  { kind: 'astrocartography', personId: ID },
  { kind: 'multi-wheel', personId: ID },
  { kind: 'shared' },
  { kind: 'export-builder' },
  { kind: 'preferences' },
  { kind: 'preferences', section: 'data' },
  { kind: 'cycles' },
  { kind: 'eclipses' },
  { kind: 'horary' },
  { kind: 'horary', view: 'patterns' },
  { kind: 'electional' },
  { kind: 'rectification' },
  { kind: 'admin' },
  { kind: 'admin-usage' },
  { kind: 'corpus-overrides' },
  { kind: 'corpus-candidates' },
  { kind: 'set-password' },
  { kind: 'setup' },
];

describe('the canonical hashes', () => {
  it('writes exactly the scheme of the plan (§3)', () => {
    const hashes: Record<string, string> = {
      people: routeHref({ kind: 'people' }),
      overview: routeHref({ kind: 'person-overview', personId: ID }),
      birthRecord: personHref(ID),
      chart: chartHref(ID, 'aspects', 'draconic'),
      interpretation: routeHref({ kind: 'report', personId: ID }),
      timeline: routeHref({ kind: 'timing-timeline', personId: ID }),
      transits: routeHref({ kind: 'transit', personId: ID }),
      forecast: routeHref({ kind: 'periodic-transit', personId: ID }),
      profections: routeHref({ kind: 'profections', personId: ID }),
      synastry: routeHref({ kind: 'synastry', personId: ID }),
      composite: routeHref({ kind: 'composite', personId: ID }),
      astrocartography: routeHref({ kind: 'astrocartography', personId: ID }),
      tool: routeHref({ kind: 'eclipses' }),
      pdf: routeHref({ kind: 'export-builder' }),
      preferences: routeHref({ kind: 'preferences', section: 'astrology' }),
      admin: routeHref({ kind: 'admin-usage' }),
    };
    expect(hashes).toEqual({
      people: '#/people',
      overview: `#/people/${ID}/overview`,
      birthRecord: `#/people/${ID}/birth-record`,
      chart: `#/people/${ID}/charts/draconic/aspects`,
      interpretation: `#/people/${ID}/interpretation`,
      timeline: `#/people/${ID}/timing/timeline`,
      transits: `#/people/${ID}/timing/transits`,
      forecast: `#/people/${ID}/timing/forecast`,
      profections: `#/people/${ID}/timing/profections`,
      synastry: `#/people/${ID}/relationships/synastry`,
      composite: `#/people/${ID}/relationships/composite`,
      astrocartography: `#/people/${ID}/location/astrocartography`,
      tool: '#/explore/eclipses',
      pdf: '#/documents/pdf',
      preferences: '#/preferences/astrology',
      admin: '#/admin/usage',
    });
  });

  it('round-trips: parsing what routeHref wrote gives the route back, for every kind', () => {
    for (const route of ROUTES) {
      expect(parseRoute(routeHref(route)), routeHref(route)).toEqual(route);
    }
  });

  it('covers every route kind (a new kind must be added to this list)', () => {
    // `home` has no hash of its own: it is what an unknown hash falls back to.
    const every: Record<Exclude<Route['kind'], 'home'>, true> = {
      about: true,
      changelog: true,
      people: true,
      person: true,
      'person-overview': true,
      chart: true,
      report: true,
      'timing-timeline': true,
      profections: true,
      progressions: true,
      'solar-arc': true,
      'primary-directions': true,
      transit: true,
      'periodic-transit': true,
      synastry: true,
      composite: true,
      astrocartography: true,
      'multi-wheel': true,
      shared: true,
      'export-builder': true,
      preferences: true,
      cycles: true,
      eclipses: true,
      horary: true,
      electional: true,
      rectification: true,
      admin: true,
      'admin-usage': true,
      'corpus-overrides': true,
      'corpus-candidates': true,
      'set-password': true,
      setup: true,
    };
    expect([...new Set(ROUTES.map((route) => route.kind))].sort()).toEqual(Object.keys(every).sort());
  });

  it('round-trips every chart type with every chart view', () => {
    for (const chartType of CHART_TYPES) {
      for (const view of CHART_VIEWS) {
        const route: Route = { kind: 'chart', personId: ID, chartType, view };
        expect(parseRoute(routeHref(route))).toEqual(route);
      }
    }
  });

  it('writes the default chart (natal, wheel) in full, so the hash always says what is open', () => {
    expect(routeHref({ kind: 'chart', personId: ID })).toBe(`#/people/${ID}/charts/natal/wheel`);
    expect(chartHref(ID)).toBe(`#/people/${ID}/charts/natal/wheel`);
  });

  it('round-trips every Preferences section', () => {
    for (const section of PREFERENCES_SECTIONS) {
      expect(parseRoute(routeHref({ kind: 'preferences', section }))).toEqual({ kind: 'preferences', section });
    }
  });
});

describe('parseRoute', () => {
  it('routes the named screens', () => {
    expect(parseRoute('#/about')).toEqual({ kind: 'about' });
    expect(parseRoute('#/changelog')).toEqual({ kind: 'changelog' });
    expect(parseRoute('#/people')).toEqual({ kind: 'people' });
  });

  it('routes an empty hash home, as a browser leaves it', () => {
    // A fresh visit, a bare '#' after an anchor click, and an explicit '#/' are the same
    // request. Any of them falling through to a 404 screen would be a bug nobody typed.
    expect(parseRoute('')).toEqual({ kind: 'home' });
    expect(parseRoute('#')).toEqual({ kind: 'home' });
    expect(parseRoute('#/')).toEqual({ kind: 'home' });
  });

  it('keeps the query out of the match, and reads the view from it where a route has one', () => {
    expect(parseRoute(`#/people/${ID}/birth-record?x=1`)).toEqual({ kind: 'person', personId: ID });
    expect(parseRoute(`#/people/${ID}/relationships/composite?view=aspects`)).toEqual({
      kind: 'composite',
      personId: ID,
      view: 'aspects',
    });
    expect(parseRoute('#/explore/horary?view=patterns')).toEqual({ kind: 'horary', view: 'patterns' });
    expect(parseRoute('#/explore/horary?view=nope')).toEqual({ kind: 'horary' });
  });

  it('routes a shared chart link (#65), which also carries its whole record in the query', () => {
    expect(parseRoute('#/shared?v=1&d=1960-06-15&t=14:30&la=38.7478&lo=-85.0672')).toEqual({ kind: 'shared' });
    expect(parseRoute('#/shared')).toEqual({ kind: 'shared' });
  });

  it('tolerates a trailing slash', () => {
    expect(parseRoute('#/people/')).toEqual({ kind: 'people' });
    expect(parseRoute(`#/people/${ID}/birth-record/`)).toEqual({ kind: 'person', personId: ID });
    expect(parseRoute('#/explore/cycles/')).toEqual({ kind: 'cycles' });
  });

  it('sends a mistyped or foreign person id home, never to a person who does not exist', () => {
    for (const hash of [
      '#/people//overview',
      '#/people/nope/overview',
      '#/people/p-short/birth-record',
      `#/people/${newId('c')}/birth-record`,
      '#/people/../about',
      '#/people/../overview',
    ]) {
      expect(parseRoute(hash), hash).toEqual({ kind: 'home' });
    }
  });

  it('sends an unknown or incomplete person area home', () => {
    for (const hash of [
      `#/people/${ID}`,
      `#/people/${ID}/nope`,
      `#/people/${ID}/charts`,
      `#/people/${ID}/charts/natal`,
      `#/people/${ID}/charts/composite/wheel`,
      `#/people/${ID}/charts/natal/nope`,
      `#/people/${ID}/charts/natal/wheel/extra`,
      `#/people/${ID}/timing`,
      `#/people/${ID}/timing/nope`,
      `#/people/${ID}/relationships/nope`,
      `#/people/${ID}/location/nope`,
      `#/people/${ID}/overview/extra`,
    ]) {
      expect(parseRoute(hash), hash).toEqual({ kind: 'home' });
    }
  });

  it('sends an unknown tool or Preferences section home', () => {
    for (const hash of [
      '#/explore',
      '#/explore/nope',
      '#/explore/cycles/extra',
      '#/preferences/nope',
      '#/documents',
      '#/documents/nope',
    ]) {
      expect(parseRoute(hash), hash).toEqual({ kind: 'home' });
    }
  });

  it('no longer knows the obsolete shapes, and does not redirect them to a guess', () => {
    for (const hash of [
      `#/person/${ID}`,
      `#/chart/${ID}`,
      `#/chart/${ID}?type=draconic&view=aspects`,
      `#/report/${ID}`,
      `#/profections/${ID}`,
      `#/progressions/${ID}`,
      `#/solar-arc/${ID}`,
      `#/primary-directions/${ID}`,
      `#/transit/${ID}`,
      `#/periodic-transit/${ID}`,
      `#/synastry/${ID}`,
      `#/composite/${ID}`,
      `#/harmonic/${ID}`,
      `#/draconic/${ID}`,
      `#/astrocartography/${ID}`,
      '#/cycles',
      '#/eclipses',
      '#/horary',
      '#/electional',
      '#/rectification',
      '#/export',
    ]) {
      expect(parseRoute(hash), hash).toEqual({ kind: 'home' });
    }
  });
});

describe('setPasswordToken', () => {
  it('reads the token out of the hash query (#135)', () => {
    expect(setPasswordToken('#/set-password?token=abc123')).toBe('abc123');
  });

  it('returns null when there is no query at all', () => {
    expect(setPasswordToken('#/set-password')).toBeNull();
  });

  it('returns null when the query has no token', () => {
    expect(setPasswordToken('#/set-password?foo=bar')).toBeNull();
  });
});

describe('setupToken', () => {
  it('reads the token out of the hash query', () => {
    expect(setupToken('#/setup?token=abc123')).toBe('abc123');
  });

  it('returns null when there is no query at all', () => {
    expect(setupToken('#/setup')).toBeNull();
  });

  it('returns null when the query has no token', () => {
    expect(setupToken('#/setup?foo=bar')).toBeNull();
  });
});
