/**
 * Tests for the persistent per-person tab bar's pure logic (#234). No DOM: `PersonNav.tsx`
 * itself is thin wiring around `activeFeatureKey`/`isTabEnabled`, so the behaviour worth pinning
 * lives here rather than behind a component render.
 */
import { describe, expect, it } from 'vitest';
import { newId } from '../src/domain/id.js';
import { activeFeatureKey } from '../src/ui/feature-registry.js';
import { familyForTab, isTabEnabled, PERSON_TAB_FAMILIES, PERSON_TABS } from '../src/ui/person-nav.js';
import type { Route } from '../src/ui/route.js';

const ID = newId('p');

describe('activeFeatureKey for the person tabs', () => {
  it('maps every person-scoped route kind to its tab', () => {
    expect(activeFeatureKey({ kind: 'person-overview', personId: ID }, 'person')).toBe('overview');
    expect(activeFeatureKey({ kind: 'person', personId: ID }, 'person')).toBe('birth-record');
    expect(activeFeatureKey({ kind: 'chart', personId: ID }, 'person')).toBe('chart');
    expect(activeFeatureKey({ kind: 'report', personId: ID }, 'person')).toBe('report');
    expect(activeFeatureKey({ kind: 'profections', personId: ID }, 'person')).toBe('profections');
    expect(activeFeatureKey({ kind: 'progressions', personId: ID }, 'person')).toBe('progressions');
    expect(activeFeatureKey({ kind: 'solar-arc', personId: ID }, 'person')).toBe('solar-arc');
    expect(activeFeatureKey({ kind: 'primary-directions', personId: ID }, 'person')).toBe('primary-directions');
    expect(activeFeatureKey({ kind: 'transit', personId: ID }, 'person')).toBe('transit');
    expect(activeFeatureKey({ kind: 'synastry', personId: ID }, 'person')).toBe('synastry');
    expect(activeFeatureKey({ kind: 'composite', personId: ID }, 'person')).toBe('composite');
    // Every chart type (natal, draconic, harmonic, returns) is the one Charts page.
    expect(activeFeatureKey({ kind: 'chart', personId: ID, chartType: 'draconic' }, 'person')).toBe('chart');
    expect(activeFeatureKey({ kind: 'periodic-transit', personId: ID }, 'person')).toBe('periodic-transit');
    expect(activeFeatureKey({ kind: 'astrocartography', personId: ID }, 'person')).toBe('astrocartography');
  });

  it('is null for routes with no tab of their own', () => {
    const nonPersonRoutes: Route[] = [
      { kind: 'home' },
      { kind: 'about' },
      { kind: 'changelog' },
      { kind: 'people' },
      { kind: 'shared' },
      { kind: 'admin' },
      { kind: 'set-password' },
      { kind: 'setup' },
    ];
    for (const route of nonPersonRoutes) {
      expect(activeFeatureKey(route, 'person')).toBeNull();
    }
  });
});

describe('isTabEnabled', () => {
  it('always enables the overview and birth record tabs', () => {
    expect(isTabEnabled('overview', false)).toBe(true);
    expect(isTabEnabled('overview', true)).toBe(true);
    expect(isTabEnabled('birth-record', false)).toBe(true);
    expect(isTabEnabled('birth-record', true)).toBe(true);
  });

  it('gates every other tab on a stored birth moment', () => {
    for (const tab of PERSON_TABS) {
      if (tab.key === 'overview' || tab.key === 'birth-record') continue;
      expect(isTabEnabled(tab.key, false)).toBe(false);
      expect(isTabEnabled(tab.key, true)).toBe(true);
    }
  });
});

describe('PERSON_TABS', () => {
  it('builds the same hrefs the old nav chain used', () => {
    const hrefs = Object.fromEntries(PERSON_TABS.map((tab) => [tab.key, tab.buildHref(ID)]));
    expect(hrefs).toEqual({
      overview: `#/people/${ID}/overview`,
      'birth-record': `#/people/${ID}/birth-record`,
      chart: `#/people/${ID}/charts/natal/wheel`,
      report: `#/people/${ID}/interpretation`,
      'timing-timeline': `#/people/${ID}/timing/timeline`,
      profections: `#/people/${ID}/timing/profections`,
      progressions: `#/people/${ID}/timing/progressions`,
      'solar-arc': `#/people/${ID}/timing/solar-arc`,
      'primary-directions': `#/people/${ID}/timing/primary-directions`,
      transit: `#/people/${ID}/timing/transits`,
      synastry: `#/people/${ID}/relationships/synastry`,
      composite: `#/people/${ID}/relationships/composite`,
      'periodic-transit': `#/people/${ID}/timing/forecast`,
      astrocartography: `#/people/${ID}/location/astrocartography`,
    });
  });
});

describe('PERSON_TAB_FAMILIES (#398)', () => {
  it('keeps the four fixed tabs and astrocartography out of every family', () => {
    const grouped = new Set(PERSON_TAB_FAMILIES.flatMap((family) => family.members));
    expect(grouped.has('overview')).toBe(false);
    expect(grouped.has('birth-record')).toBe(false);
    expect(grouped.has('chart')).toBe(false);
    expect(grouped.has('report')).toBe(false);
    expect(grouped.has('astrocartography')).toBe(false);
  });

  it('places every other tab in exactly one family', () => {
    const groupable = PERSON_TABS.filter(
      (tab) =>
        tab.key !== 'overview' &&
        tab.key !== 'birth-record' &&
        tab.key !== 'chart' &&
        tab.key !== 'report' &&
        tab.key !== 'astrocartography',
    );
    for (const tab of groupable) {
      const matches = PERSON_TAB_FAMILIES.filter((family) => family.members.includes(tab.key));
      expect(matches).toHaveLength(1);
    }
  });
});

describe('familyForTab (#398)', () => {
  it('returns the family a grouped tab belongs to', () => {
    expect(familyForTab('profections')).toBe('progressions-directions');
    expect(familyForTab('progressions')).toBe('progressions-directions');
    expect(familyForTab('solar-arc')).toBe('progressions-directions');
    expect(familyForTab('primary-directions')).toBe('progressions-directions');
    expect(familyForTab('transit')).toBe('transits-forecast');
    expect(familyForTab('periodic-transit')).toBe('transits-forecast');
    expect(familyForTab('synastry')).toBe('relationship-charts');
    expect(familyForTab('composite')).toBe('relationship-charts');
  });

  it('returns undefined for the three fixed tabs and astrocartography', () => {
    expect(familyForTab('birth-record')).toBeUndefined();
    expect(familyForTab('chart')).toBeUndefined();
    expect(familyForTab('report')).toBeUndefined();
    expect(familyForTab('astrocartography')).toBeUndefined();
  });
});
