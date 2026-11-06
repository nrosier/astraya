/**
 * The shared frame of a section with sub-views (#1139, #1175): a page-level h1 naming the section, the sub-views as a tab
 * bar in the shared Tabs primitive, and the open screen in the tab panel, where it keeps its own name as an h2 section
 * heading. Tools (`ToolsLayout`) and the three person sections (Transits & Forecast, Progressions & Directions,
 * Relationship Charts) use it, so every section looks and behaves alike. Owner decisions on #1139 and #1175.
 */
/**
 * @module SectionLayout
 * @purpose Frames a multi-view section's screens with a section h1 and a Tabs bar (#1139, #1175); `PersonSectionLayout` supplies it for the three person sections.
 * @conventions Each tab still navigates to its sub-view's unchanged route href (a hash change), so deep links work. The Tabs primitive has no narrow case, so at 40rem and below a labelled Select replaces the strip, inside a navigation landmark (axe `region`); the two are switched by CSS (`.section-tabs`, `.section-select`). The panel holds whole screens with their own main landmark, so it carries only the id the tabs control. The header takes the width of the open screen. Labels come from AppNav.messages.ts.
 * @exports SectionLayout, PersonSectionLayout, SectionLayoutItem
 */
import { appNavMessages } from './AppNav.messages.js';
import { useMessages } from './messages.js';
import { replaceRoute } from './nav-history.js';
import { Select } from './primitives/Select.js';
import { Tabs, tabPanelProps } from './primitives/Tabs.js';
import type { Route } from './route.js';
import { sectionTabsFor } from './SectionNav.js';

export interface SectionLayoutItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
}

export function SectionLayout({
  idBase,
  heading,
  items,
  active,
  wide,
  children,
}: {
  /** Prefix of the tab and panel ids, and of the heading id. */
  readonly idBase: string;
  /** The name of the section, shown as the page h1. */
  readonly heading: string;
  readonly items: readonly SectionLayoutItem[];
  readonly active: string;
  /** True when the open screen uses the wide data shell, so the header lines up with it. */
  readonly wide: boolean;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const t = useMessages(appNavMessages);
  const label = t.subtabsAriaLabel(heading);
  const headingId = `${idBase}-heading`;
  const { id } = tabPanelProps(idBase, active);
  const open = (key: string): void => {
    const target = items.find((item) => item.key === key);
    if (target !== undefined) replaceRoute(target.href);
  };
  return (
    <>
      <section
        className={wide ? 'section-header shell shell--wide' : 'section-header shell'}
        aria-labelledby={headingId}
      >
        <h1 id={headingId}>{heading}</h1>
        <div className="section-tabs">
          <Tabs
            idBase={idBase}
            label={label}
            items={items.map((item) => ({ key: item.key, label: item.label }))}
            active={active}
            onSelect={open}
          />
        </div>
        <nav className="section-select" aria-label={label}>
          <div className="chart-view-select">
            <Select
              label={label}
              value={active}
              options={items.map((item) => ({ value: item.key, label: item.label }))}
              onChange={open}
            />
          </div>
        </nav>
      </section>
      <div id={id} className="section-panel">
        {children}
      </div>
    </>
  );
}

/** The person-section screens that use the wide data shell (their `main` carries `shell--wide`). */
const WIDE_PERSON_TABS: readonly string[] = ['timing-timeline', 'synastry', 'composite'];

/** Wraps a person-section screen (#1175); draws nothing around any other route. */
export function PersonSectionLayout({
  route,
  children,
}: {
  readonly route: Route;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const t = useMessages(appNavMessages);
  const section = sectionTabsFor(route);
  if (section === null) return <>{children}</>;
  const labels: Readonly<Record<string, string>> = t.tabLabels;
  return (
    <SectionLayout
      idBase={section.section}
      heading={t.familyLabels[section.section]}
      items={section.tabs.map((tab) => ({ key: tab.key, label: labels[tab.key] ?? tab.key, href: tab.href }))}
      active={section.activeKey}
      wide={WIDE_PERSON_TABS.includes(section.activeKey)}
    >
      {children}
    </SectionLayout>
  );
}
