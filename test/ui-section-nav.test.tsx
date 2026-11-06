// @vitest-environment jsdom
/**
 * The sub-view tabs of the sidebar sections (#882, #1175): Transits & Forecast, Progressions & Directions and
 * Relationship Charts each show their sub-views as a Tabs bar under a section h1, and the first tab is the sub-view the
 * section's single sidebar entry opens (`AppNav.tsx`).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src/ui/locale.js';
import { PERSON_TAB_FAMILIES, PERSON_TABS } from '../src/ui/person-nav.js';
import { parseRoute, type Route } from '../src/ui/route.js';
import { PersonSectionLayout } from '../src/ui/SectionLayout.js';
import { sectionTabsFor } from '../src/ui/SectionNav.js';

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
    root.render(
      <PersonSectionLayout route={route}>
        <main>
          <h2>The open screen</h2>
        </main>
      </PersonSectionLayout>,
    );
    await Promise.resolve();
  });
  return container;
}

const labels = (box: HTMLElement): (string | null)[] =>
  Array.from(box.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent);

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

  it('draws nothing for the Tools routes (their Tabs bar is ToolsLayout, #1139) or other routes', () => {
    expect(sectionTabsFor(parseRoute('#/explore/eclipses'))).toBeNull();
    expect(sectionTabsFor(parseRoute('#/people'))).toBeNull();
    expect(sectionTabsFor(parseRoute('#/people/p-abcdefghijklmnop/birth-record'))).toBeNull();
    expect(sectionTabsFor(parseRoute('#/people/p-abcdefghijklmnop/charts'))).toBeNull();
    expect(sectionTabsFor(parseRoute('#/documents'))).toBeNull();
  });
});

describe('PersonSectionLayout (#1175)', () => {
  it('draws the Relationship Charts frame with the open tab selected and the screen in the panel', async () => {
    const box = await mount(parseRoute('#/people/p-abcdefghijklmnop/relationships/composite'));
    expect(box.querySelector('h1')?.textContent).toBe('Relationship Charts');
    expect(box.querySelector('nav[aria-label="Relationship Charts subtabs"]')).not.toBeNull();
    expect(labels(box)).toEqual(['Synastry', 'Composite']);
    expect(box.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Composite');
    expect(box.querySelector('#relationship-charts-panel-composite h2')?.textContent).toBe('The open screen');
  });

  it('draws the Progressions & Directions and Transits & Forecast tabs', async () => {
    const box = await mount(parseRoute('#/people/p-abcdefghijklmnop/timing/profections'));
    expect(box.querySelector('h1')?.textContent).toBe('Progressions & Directions');
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
    expect(transits.querySelector('h1')?.textContent).toBe('Transits & Forecast');
    expect(labels(transits)).toEqual(['Transits', 'Forecast']);
  });

  it('keeps exactly one tab in the tab order, as the Tools bar does', async () => {
    const box = await mount(parseRoute('#/people/p-abcdefghijklmnop/timing/transits'));
    const tabs = Array.from(box.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1]);
  });

  it('draws only the screen outside the three sections', async () => {
    const box = await mount(parseRoute('#/people'));
    expect(box.querySelector('h1')).toBeNull();
    expect(box.querySelector('[role="tablist"]')).toBeNull();
    expect(box.querySelector('h2')?.textContent).toBe('The open screen');
  });
});
