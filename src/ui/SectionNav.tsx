/**
 * The tab row for a sidebar section with sub-views (#882): Transits & Forecast, Progressions & Directions,
 * Relationship Charts and Tools. The sidebar holds one entry per section; this row sits at the top of the
 * page and lists the section's sub-views as ordinary links, the same pattern the Charts page uses
 * (`ChartViewNav.tsx`, `AdminNav.tsx`): a `ScrollingTabRow` above 40rem and a labelled Select at 40rem and below.
 */
/**
 * @module SectionNav
 * @purpose Renders the sub-view tabs of a multi-view sidebar section (Transits & Forecast, Progressions & Directions, Relationship Charts, Tools) above the open screen (#882).
 * @conventions Uses the shared ScrollingTabRow with a Select fallback, like AdminNav. Plain links to the unchanged routes, not ARIA tabs. Draws nothing on a route outside those sections. Labels come from AppNav.messages.ts.
 * @exports SectionNav, sectionTabsFor, SectionTabs
 */
import { appNavMessages } from './AppNav.messages.js';
import { activePersonTabKey, activeToolKey } from './feature-registry.js';
import { useMessages } from './messages.js';
import { familyForTab, PERSON_TAB_FAMILIES, PERSON_TABS } from './person-nav.js';
import { Select } from './primitives/Select.js';
import type { Route } from './route.js';
import { ScrollingTabRow } from './ScrollingTabRow.js';
import { TOOLS } from './tools-nav.js';

export interface SectionTabs {
  /** A `familyLabels` key in `AppNav.messages.ts`, or `'tools'` for the Tools section. */
  readonly section: 'transits-forecast' | 'progressions-directions' | 'relationship-charts' | 'tools';
  readonly activeKey: string;
  readonly tabs: readonly { readonly key: string; readonly href: string }[];
}

/** The sub-view tabs for a route, or `null` when the route is not in a multi-view section. */
export function sectionTabsFor(route: Route): SectionTabs | null {
  const toolKey = activeToolKey(route);
  if (toolKey !== null) {
    return { section: 'tools', activeKey: toolKey, tabs: TOOLS.map((tool) => ({ key: tool.key, href: tool.href })) };
  }
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

export function SectionNav({ route }: { route: Route }): React.JSX.Element | null {
  const t = useMessages(appNavMessages);
  const section = sectionTabsFor(route);
  if (section === null) return null;
  const sectionLabel = section.section === 'tools' ? t.toolsLabel : t.familyLabels[section.section];
  const label = t.subtabsAriaLabel(sectionLabel);
  const labels: Readonly<Record<string, string>> = { ...t.tabLabels, ...t.toolLabels };
  const labelFor = (key: string): string => labels[key] ?? key;
  return (
    <div className="person-nav section-nav">
      <ScrollingTabRow
        label={label}
        activeKey={section.activeKey}
        fallback={
          <div className="chart-view-select">
            <Select
              label={label}
              value={section.activeKey}
              options={section.tabs.map((tab) => ({ value: tab.key, label: labelFor(tab.key) }))}
              onChange={(value) => {
                const target = section.tabs.find((tab) => tab.key === value);
                if (target !== undefined) window.location.hash = target.href;
              }}
            />
          </div>
        }
      >
        {section.tabs.map((tab) => {
          const isActive = tab.key === section.activeKey;
          return (
            <a key={tab.key} href={tab.href} aria-current={isActive ? 'page' : undefined}>
              {labelFor(tab.key)}
            </a>
          );
        })}
      </ScrollingTabRow>
    </div>
  );
}
