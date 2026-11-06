/**
 * The sub-view tabs of a sidebar section with sub-views (#882): Transits & Forecast, Progressions & Directions,
 * Relationship Charts. The sidebar holds one entry per section; the section's frame (`SectionLayout.tsx`, #1175) lists
 * the sub-views as a Tabs bar above the open screen. This module is the pure part: which tabs a route has.
 */
/**
 * @module SectionNav
 * @purpose Pure logic for the sub-view tabs of the three person sections (Transits & Forecast, Progressions & Directions, Relationship Charts): which section and tabs a route has (#882); the Tabs frame is SectionLayout (#1175), Tools has ToolsLayout (#1139).
 * @conventions Pure, so tab logic is tested without a DOM. Returns null on a route outside those sections, Tools included. Each tab keeps its unchanged route href.
 * @exports sectionTabsFor, SectionTabs
 */
import { activePersonTabKey } from './feature-registry.js';
import { familyForTab, PERSON_TAB_FAMILIES, PERSON_TABS } from './person-nav.js';
import type { Route } from './route.js';

export interface SectionTabs {
  /** A `familyLabels` key in `AppNav.messages.ts`. */
  readonly section: 'transits-forecast' | 'progressions-directions' | 'relationship-charts';
  readonly activeKey: string;
  readonly tabs: readonly { readonly key: string; readonly href: string }[];
}

/** The sub-view tabs for a route, or `null` when the route is not in a multi-view section. */
export function sectionTabsFor(route: Route): SectionTabs | null {
  const tabKey = activePersonTabKey(route);
  const familyKey = tabKey === null ? undefined : familyForTab(tabKey);
  if (tabKey === null || familyKey === undefined || !('personId' in route)) return null;
  const family = PERSON_TAB_FAMILIES.find((candidate) => candidate.key === familyKey);
  if (family === undefined) return null;
  const personId = route.personId;
  return {
    section: familyKey,
    activeKey: tabKey,
    tabs: family.members.flatMap((memberKey) => {
      const tab = PERSON_TABS.find((candidate) => candidate.key === memberKey);
      return tab === undefined ? [] : [{ key: memberKey, href: tab.buildHref(personId) }];
    }),
  };
}
