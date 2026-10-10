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
    expect(hrefFor('chart', { personId: ID })).toBe(`#/chart/${ID}`);
    expect(hrefFor('overview', { personId: ID })).toBe(`#/people/${ID}/overview`);
    expect(hrefFor('cycles')).toBe('#/cycles');
  });

  it('throws for an unregistered key', () => {
    // @ts-expect-error -- deliberately an invalid key to exercise the runtime guard.
    expect(() => hrefFor('not-a-real-feature')).toThrow();
  });
});
