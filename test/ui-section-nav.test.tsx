// @vitest-environment jsdom
/**
 * The sub-view tabs of the sidebar sections (#882): Transits & Forecast, Progressions & Directions,
 * Relationship Charts and Tools each show their sub-views as a tab row on the page, and the first tab is
 * the sub-view the section's single sidebar entry opens (`AppNav.tsx`).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { PERSON_TAB_FAMILIES, PERSON_TABS } from '../src/ui/person-nav.js';
import { parseRoute, type Route } from '../src/ui/route.js';
import { SectionNav, sectionTabsFor } from '../src/ui/SectionNav.js';
import { TOOLS } from '../src/ui/tools-nav.js';

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  setLocale('en');
});

async function mount(route: Route): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(<SectionNav route={route} />);
    await Promise.resolve();
  });
  return container;
}

const labels = (box: HTMLElement): (string | null)[] =>
  Array.from(box.querySelectorAll('nav a')).map((a) => a.textContent);

describe('sectionTabsFor', () => {
  it('lists each person section in order, first sub-view first, on unchanged routes', () => {
    for (const family of PERSON_TAB_FAMILIES) {
      const firstMember = family.members[0];
      const first = PERSON_TABS.find((tab) => tab.key === firstMember);
      if (first === undefined) throw new Error('fixture bug: family without a first tab');
      const route = parseRoute(first.buildHref('p-abcdefghijklmnop'));
      const section = sectionTabsFor(route);
      expect(section?.section).toBe(family.key);
      expect(section?.tabs.map((tab) => tab.key)).toEqual(family.members);
      expect(section?.tabs[0]?.href).toBe(first.buildHref('p-abcdefghijklmnop'));
      expect(section?.activeKey).toBe(firstMember);
    }
  });

  it('lists every tool for the Tools section, and nothing on other routes', () => {
    const section = sectionTabsFor(parseRoute('#/explore/eclipses'));
    expect(section?.section).toBe('tools');
    expect(section?.tabs.map((tab) => tab.href)).toEqual(TOOLS.map((tool) => tool.href));
    expect(section?.activeKey).toBe('eclipses');
    expect(sectionTabsFor(parseRoute('#/people'))).toBeNull();
    expect(sectionTabsFor(parseRoute('#/people/p-abcdefghijklmnop/birth-record'))).toBeNull();
    expect(sectionTabsFor(parseRoute('#/people/p-abcdefghijklmnop/charts'))).toBeNull();
    expect(sectionTabsFor(parseRoute('#/documents'))).toBeNull();
  });
});

describe('SectionNav', () => {
  it('draws the Relationship Charts tabs with the open one current', async () => {
    const box = await mount(parseRoute('#/people/p-abcdefghijklmnop/relationships/composite'));
    expect(box.querySelector('nav[aria-label="Relationship Charts subtabs"]')).not.toBeNull();
    expect(labels(box)).toEqual(['Synastry', 'Composite']);
    expect(box.querySelector('a[aria-current="page"]')?.textContent).toBe('Composite');
    expect(Array.from(box.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      '#/people/p-abcdefghijklmnop/relationships/synastry',
      '#/people/p-abcdefghijklmnop/relationships/composite',
    ]);
  });

  it('draws the Progressions & Directions and Transits & Forecast tabs', async () => {
    const box = await mount(parseRoute('#/people/p-abcdefghijklmnop/timing/profections'));
    expect(labels(box)).toEqual([
      'Timing timeline',
      'Profections',
      'Progressions',
      'Solar Arc',
      'Primary Directions (Placidus)',
    ]);
    act(() => {
      mounted?.root.unmount();
    });
    mounted?.container.remove();
    const transits = await mount(parseRoute('#/people/p-abcdefghijklmnop/timing/transits'));
    expect(labels(transits)).toEqual(['Transits', 'Forecast']);
  });

  it('draws the six tools as the Tools tabs, in Dutch when the language is Dutch', async () => {
    const box = await mount(parseRoute('#/explore/cycles'));
    expect(box.querySelector('nav[aria-label="Tools subtabs"]')).not.toBeNull();
    expect(labels(box)).toEqual([
      'Planetary cycles',
      'Ephemeris research',
      'Eclipses',
      'Horary chart',
      'Electional search',
      'Birth-time rectification',
    ]);
    act(() => {
      mounted?.root.unmount();
    });
    mounted?.container.remove();
    setLocale('nl');
    const nl = await mount(parseRoute('#/explore/eclipses'));
    expect(labels(nl)).toContain('Verduisteringen');
  });

  it('keeps every section tab a focusable link in tab order', async () => {
    const routes = [
      '#/people/p-abcdefghijklmnop/relationships/synastry',
      '#/people/p-abcdefghijklmnop/timing/transits',
      '#/people/p-abcdefghijklmnop/timing/profections',
      '#/explore/cycles',
    ];
    for (const href of routes) {
      const box = await mount(parseRoute(href));
      const tabs = Array.from(box.querySelectorAll<HTMLAnchorElement>('nav a'));
      expect(tabs.length).toBeGreaterThan(1);
      for (const tab of tabs) {
        expect(tab.getAttribute('href')).toMatch(/^#\//);
        expect(tab.tabIndex).toBeGreaterThanOrEqual(0);
        expect(tab.closest('[hidden], [inert], [aria-hidden="true"]')).toBeNull();
      }
      act(() => {
        mounted?.root.unmount();
      });
      mounted?.container.remove();
      mounted = undefined;
    }
  });

  it('draws nothing outside the four sections', async () => {
    const box = await mount(parseRoute('#/people'));
    expect(box.innerHTML).toBe('');
  });
});
