/**
 * Exhaustiveness checks for `feature-registry.ts` (#506/#509), per
 * `docs/UI-UX_IMPLEMENTATION_PLAN.md` §5.1: unique keys, unique (group, order) pairs, every
 * person feature building a working href, and every labelKey resolving in both locales via
 * the catalogue it actually looks up at render time.
 */
import { describe, expect, it } from 'vitest';
import { newId } from '../src/domain/id.js';
import { FEATURES, featureFor, hrefFor } from '../src/ui/feature-registry.js';
import { appNavMessages } from '../src/ui/AppNav.messages.js';
import { adminNavMessages } from '../src/ui/AdminNav.messages.js';
import type { Route } from '../src/ui/route.js';

const ID = newId('p');

describe('FEATURES', () => {
  it('has a unique key per feature', () => {
    const keys = FEATURES.map((feature) => feature.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has a unique order within each group', () => {
    const byGroup = new Map<string, number[]>();
    for (const feature of FEATURES) {
      const orders = byGroup.get(feature.group) ?? [];
      orders.push(feature.order);
      byGroup.set(feature.group, orders);
    }
    for (const [group, orders] of byGroup) {
      expect(new Set(orders).size, `duplicate order within group "${group}"`).toBe(orders.length);
    }
  });

  it('builds a real href for every person-scoped feature given a personId', () => {
    for (const feature of FEATURES.filter((candidate) => candidate.scope === 'person')) {
      const href = feature.buildHref({ personId: ID });
      expect(href.startsWith('#/')).toBe(true);
      expect(href).toContain(ID);
    }
  });

  it('builds a real href for every global/document/admin feature with no personId', () => {
    for (const feature of FEATURES.filter((candidate) => candidate.scope !== 'person')) {
      expect(feature.buildHref({}).startsWith('#/')).toBe(true);
    }
  });

  it('throws rather than silently building a personless href for a person-scoped feature', () => {
    const anyPersonFeature = FEATURES.find((candidate) => candidate.scope === 'person');
    expect(anyPersonFeature).toBeDefined();
    expect(() => anyPersonFeature?.buildHref({})).toThrow();
  });

  it('resolves every person/global feature labelKey in both locales via AppNav.messages.ts', () => {
    for (const feature of FEATURES.filter(
      (candidate) => candidate.scope === 'person' || candidate.scope === 'global',
    )) {
      const table = feature.scope === 'person' ? 'tabLabels' : 'toolLabels';
      expect(appNavMessages.en[table]).toHaveProperty(feature.labelKey);
      expect(appNavMessages.nl[table]).toHaveProperty(feature.labelKey);
    }
  });

  it('resolves every admin feature labelKey in both locales via AdminNav.messages.ts', () => {
    for (const feature of FEATURES.filter((candidate) => candidate.scope === 'admin')) {
      expect(adminNavMessages.en.tabLabels).toHaveProperty(feature.labelKey);
      expect(adminNavMessages.nl.tabLabels).toHaveProperty(feature.labelKey);
    }
  });
});

describe('featureFor', () => {
  it('finds the feature for every route kind FEATURES declares', () => {
    for (const feature of FEATURES) {
      const route = { kind: feature.routeKind, personId: ID } as Route;
      expect(featureFor(route)?.key).toBe(feature.key);
    }
  });

  it('is undefined for a route with no feature metadata (home, about, etc.)', () => {
    expect(featureFor({ kind: 'home' })).toBeUndefined();
    expect(featureFor({ kind: 'about' })).toBeUndefined();
  });
});

describe('hrefFor', () => {
  it('matches the feature it looks up by key', () => {
    expect(hrefFor('chart', { personId: ID })).toBe(`#/people/${ID}/charts/natal/wheel`);
    expect(hrefFor('overview', { personId: ID })).toBe(`#/people/${ID}/overview`);
    expect(hrefFor('cycles')).toBe('#/explore/cycles');
  });

  it('throws for an unregistered key', () => {
    // @ts-expect-error -- deliberately an invalid key to exercise the runtime guard.
    expect(() => hrefFor('not-a-real-feature')).toThrow();
  });
});

/**
 * Every `Route` kind says whether it is a registered feature or why it is not. Typed as a full `Record`, so adding
 * a route kind without deciding fails the type check here instead of leaving a page the registry never heard of.
 */
const ROUTE_KIND_STATUS: Readonly<Record<Route['kind'], 'feature' | 'not a feature'>> = {
  home: 'not a feature',
  about: 'not a feature',
  changelog: 'not a feature',
  people: 'not a feature',
  person: 'feature',
  'person-overview': 'feature',
  chart: 'feature',
  report: 'feature',
  'timing-timeline': 'feature',
  profections: 'feature',
  progressions: 'feature',
  'solar-arc': 'feature',
  'primary-directions': 'feature',
  transit: 'feature',
  synastry: 'feature',
  composite: 'feature',
  'periodic-transit': 'feature',
  astrocartography: 'feature',
  'multi-wheel': 'feature',
  shared: 'not a feature',
  'export-builder': 'feature',
  preferences: 'not a feature',
  cycles: 'feature',
  'event-search': 'feature',
  eclipses: 'feature',
  horary: 'feature',
  electional: 'feature',
  rectification: 'feature',
  admin: 'feature',
  'admin-usage': 'feature',
  'corpus-overrides': 'feature',
  'corpus-candidates': 'feature',
  'set-password': 'not a feature',
  setup: 'not a feature',
};

describe('FEATURES against the routes (#509)', () => {
  const featureKinds = new Set<string>(FEATURES.map((feature) => feature.routeKind));

  it('registers exactly the route kinds that are features, and every feature points at a real route kind', () => {
    for (const [kind, status] of Object.entries(ROUTE_KIND_STATUS)) {
      expect(featureKinds.has(kind), `route kind "${kind}" is ${status}`).toBe(status === 'feature');
    }
    for (const feature of FEATURES) {
      expect(Object.keys(ROUTE_KIND_STATUS), `feature "${feature.key}"`).toContain(feature.routeKind);
    }
  });

  it('gives each route kind at most one feature, so a route can only resolve one way', () => {
    expect(featureKinds.size).toBe(FEATURES.length);
  });

  it('builds a different href for every feature', () => {
    const hrefs = FEATURES.map((feature) => feature.buildHref({ personId: ID }));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('declares what each feature can export, "none" only on its own', () => {
    for (const feature of FEATURES) {
      expect(feature.exportCapabilities.length, `feature "${feature.key}"`).toBeGreaterThan(0);
      if (feature.exportCapabilities.includes('none')) expect(feature.exportCapabilities).toEqual(['none']);
    }
  });
});
